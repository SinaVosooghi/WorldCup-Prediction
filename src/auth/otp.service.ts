import { Injectable, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { SmsService } from '../sms/sms.service';
import { AuditLoggerService } from '../common/services/audit-logger.service';
import { MetricsService } from '../common/services/metrics.service';
import { UserService } from './services/user.service';
import { FraudDetectionService } from './services/fraud-detection.service';
import { AUTH_CONSTANTS } from './constants/auth.constants';

export class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class OtpService {
  constructor(
    private redisService: RedisService,
    private smsService: SmsService,
    private configService: ConfigService,
    private auditLogger: AuditLoggerService,
    private metricsService: MetricsService,
    private userService: UserService,
    private fraudDetectionService: FraudDetectionService,
  ) {}

  /**
   * Sends an OTP code to the provided phone number with rate limiting.
   */
  async sendOtp(phone: string, ip: string, userAgent: string): Promise<{ otp?: string }> {
    const expirySeconds = this.configService.get<number>('auth.otp.expirySeconds');
    const cooldownSeconds = this.configService.get<number>('auth.otp.sendCooldownSeconds');
    const isSandbox = this.configService.get<boolean>('sms.sandbox');

    const normalizedPhone = this.userService.normalizePhoneNumber(phone);
    this.checkUnusualPhonePattern(normalizedPhone, ip, userAgent);

    await this.checkRateLimits(phone, ip, userAgent);

    const code = this.generateOtpCode();
    await this.storeOtp(phone, code, expirySeconds, ip, userAgent);
    await this.setRateLimitKeys(phone, cooldownSeconds);

    await this.smsService.sendOtpSms(phone, code);

    this.auditLogger.logOtpSent(phone, ip, userAgent);
    this.metricsService.incrementOtpSent('success');

    if (isSandbox) {
      return { otp: code };
    }

    return {};
  }

  /**
   * Verifies an OTP code with attempt limiting and returns the user ID.
   */
  async verifyOtp(phone: string, code: string): Promise<{ userId: string }> {
    const startTime = Date.now();
    const maxAttempts = this.configService.get<number>('auth.otp.maxVerifyAttempts');
    const verifyWindowSeconds = this.configService.get<number>(
      'auth.rateLimit.verifyWindowSeconds',
    );

    const otpKey = `otp:phone:${phone}`;
    const attemptKey = `otp:verify:attempts:${phone}`;

    await this.checkVerifyAttempts(attemptKey, phone, maxAttempts, verifyWindowSeconds);

    const otpData = await this.getStoredOtp(otpKey, phone);
    this.validateOtpExpiration(otpData, otpKey, phone);
    await this.validateOtpCode(otpData, code, phone);

    await this.cleanupOtpData(otpKey, attemptKey);

    const normalizedPhone = this.userService.normalizePhoneNumber(phone);
    const user = await this.userService.findOrCreateUser(normalizedPhone);

    this.auditLogger.logOtpVerified(user.id, phone, otpData.ip, otpData.userAgent);

    const duration = (Date.now() - startTime) / 1000;
    this.metricsService.recordOtpVerificationDuration(duration);
    this.metricsService.incrementOtpVerified();

    return { userId: user.id };
  }

  /**
   * Checks for unusual phone number patterns.
   */
  private checkUnusualPhonePattern(phone: string, ip: string, userAgent: string): void {
    if (this.fraudDetectionService.isUnusualPhonePattern(phone)) {
      this.auditLogger.logSuspiciousActivity('Unusual phone number pattern detected', {
        phone,
        ipAddress: ip,
        userAgent,
        pattern: 'sequential_or_repetitive',
      });
    }
  }

  /**
   * Checks rate limiting for OTP sending.
   */
  private async checkRateLimits(phone: string, ip: string, userAgent: string): Promise<void> {
    const sendLimitKey = `otp:send:limit:${phone}`;
    const isLimited = await this.redisService.get(sendLimitKey);

    if (isLimited) {
      this.auditLogger.logRateLimitExceeded(phone, ip, 'otp_send', userAgent);
      this.metricsService.incrementOtpSent('rate_limited');
      throw new TooManyRequestsException('EXCEEDED_SEND_LIMIT');
    }

    const lastRequestKey = `otp:last_request:${phone}`;
    const lastRequest = await this.redisService.get(lastRequestKey);

    if (lastRequest) {
      this.auditLogger.logRateLimitExceeded(phone, ip, 'otp_cooldown', userAgent);
      this.metricsService.incrementOtpSent('rate_limited');
      throw new TooManyRequestsException('PLEASE_WAIT_BEFORE_NEXT_REQUEST');
    }
  }

  /**
   * Stores OTP data in Redis.
   */
  private async storeOtp(
    phone: string,
    code: string,
    expirySeconds: number,
    ip: string,
    userAgent: string,
  ): Promise<void> {
    const expiresAt = Date.now() + expirySeconds * 1000;
    const otpData = {
      code,
      expiresAt,
      attempts: 0,
      phone,
      ip,
      userAgent,
    };

    const otpKey = `otp:phone:${phone}`;
    await this.redisService.setex(otpKey, expirySeconds, JSON.stringify(otpData));
  }

  /**
   * Sets rate limiting keys in Redis.
   */
  private async setRateLimitKeys(phone: string, cooldownSeconds: number): Promise<void> {
    const sendLimitKey = `otp:send:limit:${phone}`;
    const lastRequestKey = `otp:last_request:${phone}`;

    await this.redisService.setex(sendLimitKey, cooldownSeconds, '1');
    await this.redisService.setex(lastRequestKey, cooldownSeconds, '1');
  }

  /**
   * Checks OTP verification attempts.
   */
  private async checkVerifyAttempts(
    attemptKey: string,
    phone: string,
    maxAttempts: number,
    verifyWindowSeconds: number,
  ): Promise<void> {
    const attempts = await this.redisService.incr(attemptKey);
    await this.redisService.expire(attemptKey, verifyWindowSeconds);

    if (attempts > maxAttempts) {
      await this.fraudDetectionService.trackOtpFailureByPhone(phone);

      this.auditLogger.logRateLimitExceeded(phone, 'unknown', 'otp_verify_attempts');
      this.metricsService.incrementOtpFailed('rate_limit_exceeded');
      throw new TooManyRequestsException('EXCEEDED_VERIFICATION_ATTEMPTS');
    }
  }

  /**
   * Retrieves stored OTP data from Redis.
   */
  private async getStoredOtp(otpKey: string, phone: string): Promise<any> {
    const otpDataStr = await this.redisService.get(otpKey);

    if (!otpDataStr) {
      this.auditLogger.logOtpVerificationFailed(phone, 'unknown', 'OTP not found or expired');
      this.metricsService.incrementOtpFailed('not_found');
      throw new BadRequestException('OTP_NOT_FOUND_OR_EXPIRED');
    }

    return JSON.parse(otpDataStr);
  }

  /**
   * Validates OTP expiration.
   */
  private validateOtpExpiration(otpData: any, otpKey: string, phone: string): void {
    if (Date.now() > otpData.expiresAt) {
      this.redisService.del(otpKey);
      this.auditLogger.logOtpVerificationFailed(
        phone,
        otpData.ip,
        'OTP expired',
        otpData.userAgent,
      );
      this.metricsService.incrementOtpFailed('expired');
      throw new BadRequestException('OTP_EXPIRED');
    }
  }

  /**
   * Validates OTP code matches stored value.
   */
  private async validateOtpCode(otpData: any, code: string, phone: string): Promise<void> {
    if (otpData.code !== code) {
      await this.fraudDetectionService.trackOtpFailureByIp(otpData.ip, phone, otpData.userAgent);

      this.auditLogger.logOtpVerificationFailed(
        phone,
        otpData.ip,
        'Invalid OTP code',
        otpData.userAgent,
      );
      this.metricsService.incrementOtpFailed('invalid_code');
      throw new BadRequestException('INVALID_OTP_CODE');
    }
  }

  /**
   * Cleans up OTP data after successful verification.
   */
  private async cleanupOtpData(otpKey: string, attemptKey: string): Promise<void> {
    await this.redisService.del(otpKey);
    await this.redisService.del(attemptKey);
  }

  /**
   * Generates a random OTP code based on configured length.
   */
  private generateOtpCode(): string {
    const length = this.configService.get<number>('auth.otp.length');
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
  }
}
