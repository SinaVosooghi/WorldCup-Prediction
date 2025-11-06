import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Session } from '../entities/session.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

/**
 * Service responsible for fraud detection and security monitoring.
 * Consolidates all security-related checks and suspicious activity tracking.
 */
@Injectable()
export class FraudDetectionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    private redisService: RedisService,
    private auditLogger: AuditLoggerService,
  ) {}

  /**
   * Detects unusual phone number patterns that may indicate fraud or testing.
   * Checks for sequential digits, repeated digits, or test patterns.
   *
   * @param phone - Normalized phone number
   * @returns True if pattern is suspicious
   */
  isUnusualPhonePattern(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');

    if (this.hasRepeatedDigits(digits)) {
      return true;
    }

    if (this.hasSequentialPattern(digits)) {
      return true;
    }

    if (this.matchesTestPattern(digits)) {
      return true;
    }

    return false;
  }

  /**
   * Checks for concurrent session creation from different IPs.
   * Logs suspicious activity if multiple IPs are detected.
   *
   * @param userId - User ID to check
   * @param currentIp - Current IP address
   * @param userAgent - User agent string
   */
  async checkConcurrentSessions(
    userId: string,
    currentIp: string,
    userAgent: string,
  ): Promise<void> {
    const recentSessions = await this.sessionRepository.find({
      where: {
        userId,
        expiresAt: MoreThan(
          new Date(Date.now() - AUTH_CONSTANTS.SESSION.CONCURRENT_CHECK_WINDOW_MS),
        ),
      },
      order: { createdAt: 'DESC' },
      take: AUTH_CONSTANTS.SESSION.CONCURRENT_CHECK_LIMIT,
    });

    if (recentSessions.length > 0) {
      const differentIps = recentSessions.filter((s) => s.ipAddress && s.ipAddress !== currentIp);
      if (differentIps.length > 0) {
        this.auditLogger.logSuspiciousActivity('Concurrent session creation from different IPs', {
          userId,
          currentIp,
          recentIps: differentIps.map((s) => s.ipAddress).slice(0, 3),
          userAgent,
          sessionCount: recentSessions.length,
        });
      }
    }
  }

  /**
   * Tracks OTP verification failures per phone number.
   * Triggers alert if threshold is exceeded.
   *
   * @param phone - Phone number
   * @returns Total failure count
   */
  async trackOtpFailureByPhone(phone: string): Promise<number> {
    const failureTrackingKey = `otp:failures:${phone}`;
    const totalFailures = await this.redisService.incr(failureTrackingKey);
    await this.redisService.expire(
      failureTrackingKey,
      AUTH_CONSTANTS.TIME_WINDOWS.ONE_HOUR_SECONDS,
    );

    if (totalFailures > AUTH_CONSTANTS.RATE_LIMIT.OTP_FAILURE_THRESHOLD_PER_PHONE) {
      this.auditLogger.logSuspiciousActivity(
        'Multiple failed OTP verification attempts from same phone',
        {
          phone,
          totalFailures,
          timeWindow: '1 hour',
        },
      );
    }

    return totalFailures;
  }

  /**
   * Tracks OTP verification failures per IP address.
   * Triggers alert if threshold is exceeded.
   *
   * @param ip - IP address
   * @param phone - Phone number
   * @param userAgent - User agent string
   * @returns Total failure count for this IP
   */
  async trackOtpFailureByIp(ip: string, phone: string, userAgent: string): Promise<number> {
    const ipFailureKey = `otp:ip:failures:${ip}`;
    const ipFailures = await this.redisService.incr(ipFailureKey);
    await this.redisService.expire(ipFailureKey, AUTH_CONSTANTS.TIME_WINDOWS.ONE_HOUR_SECONDS);

    if (ipFailures > AUTH_CONSTANTS.RATE_LIMIT.OTP_FAILURE_THRESHOLD_PER_IP) {
      this.auditLogger.logSuspiciousActivity('Multiple failed OTP verifications from same IP', {
        ipAddress: ip,
        phone,
        failureCount: ipFailures,
        timeWindow: '1 hour',
        userAgent,
      });
    }

    return ipFailures;
  }

  /**
   * Checks if a phone number contains repeated digits.
   *
   * @param digits - Phone number digits only
   * @returns True if repeated digits pattern detected
   */
  private hasRepeatedDigits(digits: string): boolean {
    const threshold = AUTH_CONSTANTS.FRAUD_DETECTION.REPEATED_DIGITS_THRESHOLD;
    const pattern = new RegExp(`(\\d)\\1{${threshold},}`);
    return pattern.test(digits);
  }

  /**
   * Checks if a phone number contains sequential patterns.
   *
   * @param digits - Phone number digits only
   * @returns True if sequential pattern detected
   */
  private hasSequentialPattern(digits: string): boolean {
    const patternLength = AUTH_CONSTANTS.FRAUD_DETECTION.SEQUENTIAL_PATTERN_LENGTH;

    for (let i = 0; i < digits.length - patternLength + 1; i++) {
      const sequence = digits.substring(i, i + patternLength);
      const nums = sequence.split('').map(Number);
      const isAscending = nums.every((n, idx) => idx === 0 || n === nums[idx - 1] + 1);
      const isDescending = nums.every((n, idx) => idx === 0 || n === nums[idx - 1] - 1);

      if (isAscending || isDescending) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if a phone number matches known test patterns.
   *
   * @param digits - Phone number digits only
   * @returns True if matches test pattern
   */
  private matchesTestPattern(digits: string): boolean {
    return AUTH_CONSTANTS.FRAUD_DETECTION.TEST_PATTERNS.some((pattern) => digits.includes(pattern));
  }
}
