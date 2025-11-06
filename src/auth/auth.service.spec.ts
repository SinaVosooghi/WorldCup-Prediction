import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { Session } from './entities/session.entity';
import { AuditLoggerService } from '../common/services/audit-logger.service';
import { MetricsService } from '../common/services/metrics.service';
import { TokenService } from './services/token.service';
import { SessionCacheService } from './services/session-cache.service';
import { FraudDetectionService } from './services/fraud-detection.service';
import { Repository } from 'typeorm';

describe('AuthService', () => {
  let service: AuthService;
  let sessionRepository: jest.Mocked<Repository<Session>>;
  let otpService: jest.Mocked<OtpService>;
  let tokenService: jest.Mocked<TokenService>;
  let sessionCacheService: jest.Mocked<SessionCacheService>;
  let fraudDetectionService: jest.Mocked<FraudDetectionService>;

  const mockSession: Session = {
    id: 'session-id-123',
    userId: 'user-id-123',
    tokenHash: 'hashed-token',
    refreshTokenHash: 'hashed-refresh-token',
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    user: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(Session),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: OtpService,
          useValue: {
            sendOtp: jest.fn(),
            verifyOtp: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'auth.session.tokenLength': 32,
                'auth.session.bcryptRounds': 12,
                'auth.session.accessTokenTtlSeconds': 900,
                'auth.session.refreshTokenTtlSeconds': 2592000,
                'auth.session.ttlSeconds': 2592000,
                'auth.session.cachePrefix': 'session:token:',
                'auth.session.refreshCachePrefix': 'session:refresh:',
              };
              return config[key];
            }),
          },
        },
        {
          provide: AuditLoggerService,
          useValue: {
            logSessionCreated: jest.fn(),
            logSessionDeleted: jest.fn(),
            logSessionValidation: jest.fn(),
            logSuspiciousActivity: jest.fn(),
            log: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementSessionCreated: jest.fn(),
            incrementSessionDeleted: jest.fn(),
            incrementSessionValidation: jest.fn(),
            recordSessionValidationDuration: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            generateToken: jest.fn().mockResolvedValue({
              token: 'a'.repeat(64),
              hash: 'hashed-token',
            }),
            verifyToken: jest.fn().mockResolvedValue(true),
            getTokenPrefix: jest.fn((token: string) => token.substring(0, 16)),
            validateTokenFormat: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: SessionCacheService,
          useValue: {
            cacheAccessToken: jest.fn(),
            cacheRefreshToken: jest.fn(),
            getCachedSessionByAccessToken: jest.fn(),
            getCachedSessionByRefreshToken: jest.fn(),
            invalidateAccessToken: jest.fn(),
            invalidateRefreshToken: jest.fn(),
            incrementRefreshFrequency: jest.fn().mockResolvedValue(1),
          },
        },
        {
          provide: FraudDetectionService,
          useValue: {
            checkConcurrentSessions: jest.fn(),
            isUnusualPhonePattern: jest.fn().mockReturnValue(false),
            trackOtpFailureByPhone: jest.fn(),
            trackOtpFailureByIp: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    sessionRepository = module.get(getRepositoryToken(Session));
    otpService = module.get(OtpService);
    tokenService = module.get(TokenService);
    sessionCacheService = module.get(SessionCacheService);
    fraudDetectionService = module.get(FraudDetectionService);
  });

  describe('sendOtp', () => {
    it('should call otpService.sendOtp with correct parameters', async () => {
      await service.sendOtp('09123456789', '127.0.0.1', 'test-agent');

      expect(otpService.sendOtp).toHaveBeenCalledWith('09123456789', '127.0.0.1', 'test-agent');
    });
  });

  describe('verifyOtp', () => {
    it('should verify OTP and create session with Redis cache', async () => {
      const userId = 'user-id-123';
      otpService.verifyOtp.mockResolvedValue({ userId });
      sessionRepository.create.mockReturnValue(mockSession);
      sessionRepository.save.mockResolvedValue(mockSession);

      const result = await service.verifyOtp('09123456789', '123456', '127.0.0.1', 'Mozilla/5.0');

      expect(otpService.verifyOtp).toHaveBeenCalledWith('09123456789', '123456');
      expect(sessionRepository.create).toHaveBeenCalled();
      expect(sessionRepository.save).toHaveBeenCalled();
      expect(sessionCacheService.cacheAccessToken).toHaveBeenCalled();
      expect(sessionCacheService.cacheRefreshToken).toHaveBeenCalled();
      expect(result).toHaveProperty('session');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.session.userId).toBe(userId);
    });
  });

  describe('validateSession', () => {
    it('should validate session from Redis cache (cache hit)', async () => {
      const token = 'a'.repeat(64);

      sessionCacheService.getCachedSessionByAccessToken.mockResolvedValue(mockSession.id);
      sessionRepository.findOne.mockResolvedValue(mockSession);
      tokenService.verifyToken.mockResolvedValue(true);

      const result = await service.validateSession(token);

      expect(sessionCacheService.getCachedSessionByAccessToken).toHaveBeenCalled();
      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockSession.id },
      });
      expect(result).toEqual(mockSession);
    });

    it('should return null for invalid token in cache', async () => {
      const token = 'a'.repeat(64);

      sessionCacheService.getCachedSessionByAccessToken.mockResolvedValue(mockSession.id);
      sessionRepository.findOne.mockResolvedValue(mockSession);
      sessionRepository.find.mockResolvedValue([]);
      tokenService.verifyToken.mockResolvedValue(false);

      const result = await service.validateSession(token);

      expect(sessionCacheService.invalidateAccessToken).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should fallback to database search on cache miss', async () => {
      const token = 'a'.repeat(64);

      sessionCacheService.getCachedSessionByAccessToken.mockResolvedValue(null);
      sessionRepository.find.mockResolvedValue([mockSession]);
      tokenService.verifyToken.mockResolvedValue(true);

      const result = await service.validateSession(token);

      expect(sessionRepository.find).toHaveBeenCalledWith({
        where: { expiresAt: expect.any(Object) },
        order: { createdAt: 'DESC' },
        take: 3,
      });
      expect(sessionCacheService.cacheAccessToken).toHaveBeenCalled();
      expect(result).toEqual(mockSession);
    });

    it('should return null for expired session', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() - 1000),
      };
      const token = 'a'.repeat(64);

      sessionCacheService.getCachedSessionByAccessToken.mockResolvedValue(expiredSession.id);
      sessionRepository.findOne.mockResolvedValue(expiredSession);
      sessionRepository.find.mockResolvedValue([]);

      const result = await service.validateSession(token);

      expect(result).toBeNull();
    });
  });

  describe('getUserSessions', () => {
    it('should return all sessions for a user', async () => {
      const sessions = [mockSession];
      sessionRepository.find.mockResolvedValue(sessions);

      const result = await service.getUserSessions('user-id-123');

      expect(sessionRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-id-123' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(sessions);
    });
  });

  describe('deleteSession', () => {
    it('should delete a specific session', async () => {
      sessionRepository.findOne.mockResolvedValue(mockSession);
      sessionRepository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await service.deleteSession('user-id-123', 'session-id-123');

      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'session-id-123', userId: 'user-id-123' },
      });
      expect(sessionRepository.delete).toHaveBeenCalledWith({
        id: 'session-id-123',
        userId: 'user-id-123',
      });
    });

    it('should not delete session if not found', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      await service.deleteSession('user-id-123', 'session-id-123');

      expect(sessionRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteAllUserSessions', () => {
    it('should delete all sessions for a user', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 3, raw: [] });

      await service.deleteAllUserSessions('user-id-123');

      expect(sessionRepository.delete).toHaveBeenCalledWith({ userId: 'user-id-123' });
    });
  });
});
