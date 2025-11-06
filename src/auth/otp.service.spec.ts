import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpService, TooManyRequestsException } from './otp.service';
import { RedisService } from '../redis/redis.service';
import { SmsService } from '../sms/sms.service';
import { AuditLoggerService } from '../common/services/audit-logger.service';
import { MetricsService } from '../common/services/metrics.service';
import { UserService } from './services/user.service';
import { FraudDetectionService } from './services/fraud-detection.service';

describe('OtpService', () => {
  let otpService: OtpService;
  let redisService: RedisService;
  let smsService: SmsService;
  let userService: UserService;
  let fraudDetectionService: FraudDetectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            incr: jest.fn(),
            expire: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: SmsService,
          useValue: {
            sendOtpSms: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'auth.otp.length': 6,
                'auth.otp.expirySeconds': 120,
                'auth.otp.sendCooldownSeconds': 120,
                'auth.otp.maxVerifyAttempts': 5,
                'auth.rateLimit.verifyWindowSeconds': 60,
                'sms.sandbox': false,
              };
              return config[key];
            }),
          },
        },
        {
          provide: AuditLoggerService,
          useValue: {
            logOtpSent: jest.fn(),
            logOtpVerified: jest.fn(),
            logOtpVerificationFailed: jest.fn(),
            logRateLimitExceeded: jest.fn(),
            logUserCreated: jest.fn(),
            logSuspiciousActivity: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementOtpSent: jest.fn(),
            incrementOtpVerified: jest.fn(),
            incrementOtpFailed: jest.fn(),
            recordOtpVerificationDuration: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findOrCreateUser: jest.fn().mockResolvedValue({
              id: 'user-id-123',
              phone: '09123456789',
              createdAt: new Date(),
              updatedAt: new Date(),
              lastLoginAt: new Date(),
            }),
            normalizePhoneNumber: jest.fn((phone) => phone),
          },
        },
        {
          provide: FraudDetectionService,
          useValue: {
            isUnusualPhonePattern: jest.fn().mockReturnValue(false),
            trackOtpFailureByPhone: jest.fn().mockResolvedValue(1),
            trackOtpFailureByIp: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    otpService = module.get<OtpService>(OtpService);
    redisService = module.get<RedisService>(RedisService);
    smsService = module.get<SmsService>(SmsService);
    userService = module.get<UserService>(UserService);
    fraudDetectionService = module.get<FraudDetectionService>(FraudDetectionService);
  });

  describe('sendOtp', () => {
    it('should send OTP successfully', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'setex').mockResolvedValue('OK');
      jest.spyOn(smsService, 'sendOtpSms').mockResolvedValue(undefined);

      await expect(
        otpService.sendOtp('09123456789', '127.0.0.1', 'test-agent'),
      ).resolves.not.toThrow();

      expect(redisService.setex).toHaveBeenCalledTimes(3);
      expect(smsService.sendOtpSms).toHaveBeenCalled();
    });

    it('should throw error when send rate limited', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValueOnce('1');

      await expect(otpService.sendOtp('09123456789', '127.0.0.1', 'test-agent')).rejects.toThrow(
        TooManyRequestsException,
      );
    });

    it('should throw error when last request is too recent', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValueOnce(null).mockResolvedValueOnce('1');

      await expect(otpService.sendOtp('09123456789', '127.0.0.1', 'test-agent')).rejects.toThrow(
        TooManyRequestsException,
      );
    });
  });

  describe('verifyOtp', () => {
    it('should verify valid OTP', async () => {
      const otpData = {
        code: '123456',
        expiresAt: Date.now() + 60000,
        attempts: 0,
        phone: '09123456789',
        ip: '127.0.0.1',
        userAgent: 'test',
      };

      jest.spyOn(redisService, 'incr').mockResolvedValue(1);
      jest.spyOn(redisService, 'expire').mockResolvedValue(1);
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(otpData));
      jest.spyOn(redisService, 'del').mockResolvedValue(1);

      const result = await otpService.verifyOtp('09123456789', '123456');

      expect(result).toHaveProperty('userId');
      expect(result.userId).toBe('user-id-123');
      expect(redisService.del).toHaveBeenCalledTimes(2);
      expect(userService.findOrCreateUser).toHaveBeenCalled();
    });

    it('should throw error for expired OTP', async () => {
      const expiredOtp = {
        code: '123456',
        expiresAt: Date.now() - 1000,
        attempts: 0,
        phone: '09123456789',
        ip: '127.0.0.1',
      };

      jest.spyOn(redisService, 'incr').mockResolvedValue(1);
      jest.spyOn(redisService, 'expire').mockResolvedValue(1);
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(expiredOtp));
      jest.spyOn(redisService, 'del').mockResolvedValue(1);

      await expect(otpService.verifyOtp('09123456789', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error for invalid OTP code', async () => {
      const otpData = {
        code: '123456',
        expiresAt: Date.now() + 60000,
        attempts: 0,
        phone: '09123456789',
        ip: '127.0.0.1',
        userAgent: 'test',
      };

      jest.spyOn(redisService, 'incr').mockResolvedValue(1);
      jest.spyOn(redisService, 'expire').mockResolvedValue(1);
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(otpData));

      await expect(otpService.verifyOtp('09123456789', '654321')).rejects.toThrow(
        BadRequestException,
      );

      expect(fraudDetectionService.trackOtpFailureByIp).toHaveBeenCalled();
    });

    it('should throw error when verification attempts exceeded', async () => {
      jest.spyOn(redisService, 'incr').mockResolvedValue(6);
      jest.spyOn(redisService, 'expire').mockResolvedValue(1);

      await expect(otpService.verifyOtp('09123456789', '123456')).rejects.toThrow(
        TooManyRequestsException,
      );

      expect(fraudDetectionService.trackOtpFailureByPhone).toHaveBeenCalled();
    });

    it('should throw error when OTP not found', async () => {
      jest.spyOn(redisService, 'incr').mockResolvedValue(1);
      jest.spyOn(redisService, 'expire').mockResolvedValue(1);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      await expect(otpService.verifyOtp('09123456789', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
