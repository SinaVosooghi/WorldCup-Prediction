import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from './auth.guard';
import { AuthService } from '../auth.service';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { MetricsService } from '../../common/services/metrics.service';
import { Session } from '../entities/session.entity';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: jest.Mocked<AuthService>;
  let configService: jest.Mocked<ConfigService>;
  let auditLogger: jest.Mocked<AuditLoggerService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockSession: Session = {
    id: 'session-123',
    userId: 'user-123',
    tokenHash: 'hashed-token',
    refreshTokenHash: 'hashed-refresh',
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    user: null,
  };

  const createMockExecutionContext = (
    authorization?: string,
    ip?: string | null,
    userAgent?: string,
  ): ExecutionContext => {
    const request = {
      headers: {
        authorization,
        'user-agent': userAgent,
      },
      ip: ip === null ? undefined : ip || '127.0.0.1',
      connection: { remoteAddress: ip === null ? undefined : ip || '127.0.0.1' },
      user: undefined,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        {
          provide: AuthService,
          useValue: {
            validateSession: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'auth.security.enableIpValidation': false,
                'auth.security.enableUserAgentValidation': false,
              };
              return config[key];
            }),
          },
        },
        {
          provide: AuditLoggerService,
          useValue: {
            logSessionValidation: jest.fn(),
            logSuspiciousActivity: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementSessionValidationFailed: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
    authService = module.get(AuthService) as jest.Mocked<AuthService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
    auditLogger = module.get(AuditLoggerService) as jest.Mocked<AuditLoggerService>;
    metricsService = module.get(MetricsService) as jest.Mocked<MetricsService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Extraction', () => {
    it('should extract token from Bearer authorization header', async () => {
      const token = 'valid-token-123';
      const context = createMockExecutionContext(`Bearer ${token}`);

      authService.validateSession.mockResolvedValue(mockSession);

      await guard.canActivate(context);

      expect(authService.validateSession).toHaveBeenCalledWith(token);
    });

    it('should throw UnauthorizedException when authorization header is missing', async () => {
      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('MISSING_ACCESS_TOKEN'),
      );

      expect(authService.validateSession).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when authorization header is not Bearer type', async () => {
      const context = createMockExecutionContext('Basic some-token');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('MISSING_ACCESS_TOKEN'),
      );

      expect(authService.validateSession).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when authorization header is malformed', async () => {
      const context = createMockExecutionContext('InvalidFormat');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('MISSING_ACCESS_TOKEN'),
      );

      expect(authService.validateSession).not.toHaveBeenCalled();
    });

    it('should handle authorization header with only Bearer keyword', async () => {
      const context = createMockExecutionContext('Bearer ');

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Session Validation', () => {
    it('should allow access when session is valid', async () => {
      const token = 'valid-token';
      const context = createMockExecutionContext(`Bearer ${token}`);

      authService.validateSession.mockResolvedValue(mockSession);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateSession).toHaveBeenCalledWith(token);
      expect(auditLogger.logSessionValidation).toHaveBeenCalledWith(
        mockSession.userId,
        true,
        '127.0.0.1',
        undefined,
      );
    });

    it('should throw UnauthorizedException when session is invalid', async () => {
      const token = 'invalid-token';
      const context = createMockExecutionContext(`Bearer ${token}`);

      authService.validateSession.mockResolvedValue(null);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('INVALID_OR_EXPIRED_TOKEN'),
      );

      expect(auditLogger.logSessionValidation).toHaveBeenCalledWith('unknown', false);
      expect(metricsService.incrementSessionValidationFailed).toHaveBeenCalledWith('invalid_token');
    });

    it('should attach user info to request when session is valid', async () => {
      const token = 'valid-token';
      const context = createMockExecutionContext(`Bearer ${token}`);
      const request = context.switchToHttp().getRequest();

      authService.validateSession.mockResolvedValue(mockSession);

      await guard.canActivate(context);

      expect(request.user).toEqual({
        userId: mockSession.userId,
        sessionId: mockSession.id,
      });
    });

    it('should handle unexpected errors during validation', async () => {
      const token = 'valid-token';
      const context = createMockExecutionContext(`Bearer ${token}`);

      authService.validateSession.mockRejectedValue(new Error('Database error'));

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('AUTHENTICATION_FAILED'),
      );
    });

    it('should re-throw UnauthorizedException from validation', async () => {
      const token = 'valid-token';
      const context = createMockExecutionContext(`Bearer ${token}`);

      authService.validateSession.mockRejectedValue(new UnauthorizedException('CUSTOM_ERROR'));

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('CUSTOM_ERROR'),
      );
    });
  });

  describe('IP Validation', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'auth.security.enableIpValidation') return true;
        if (key === 'auth.security.enableUserAgentValidation') return false;
        return false;
      });
    });

    it('should allow access when IP matches session IP', async () => {
      const token = 'valid-token';
      const ip = '192.168.1.1';
      const sessionWithIp = { ...mockSession, ipAddress: ip };
      const context = createMockExecutionContext(`Bearer ${token}`, ip);

      authService.validateSession.mockResolvedValue(sessionWithIp);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when IP does not match', async () => {
      const token = 'valid-token';
      const sessionIp = '192.168.1.1';
      const requestIp = '192.168.1.2';
      const sessionWithIp = { ...mockSession, ipAddress: sessionIp };
      const context = createMockExecutionContext(`Bearer ${token}`, requestIp, 'Mozilla/5.0');

      authService.validateSession.mockResolvedValue(sessionWithIp);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('SESSION_IP_MISMATCH'),
      );

      expect(auditLogger.logSuspiciousActivity).toHaveBeenCalledWith(
        'IP address mismatch detected',
        {
          userId: mockSession.userId,
          sessionIp: sessionIp,
          requestIp: requestIp,
          userAgent: 'Mozilla/5.0',
        },
      );
      expect(metricsService.incrementSessionValidationFailed).toHaveBeenCalledWith('ip_mismatch');
    });

    it('should skip IP validation when session has no IP address', async () => {
      const token = 'valid-token';
      const sessionWithoutIp = { ...mockSession, ipAddress: null };
      const context = createMockExecutionContext(`Bearer ${token}`, '192.168.1.2');

      authService.validateSession.mockResolvedValue(sessionWithoutIp);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
    });

    it('should skip IP validation when request has no IP', async () => {
      const token = 'valid-token';
      const sessionWithIp = { ...mockSession, ipAddress: '192.168.1.1' };
      const context = createMockExecutionContext(`Bearer ${token}`, null);

      authService.validateSession.mockResolvedValue(sessionWithIp);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
    });
  });

  describe('User Agent Validation', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'auth.security.enableIpValidation') return false;
        if (key === 'auth.security.enableUserAgentValidation') return true;
        return false;
      });
    });

    it('should log but allow access when User Agent does not match', async () => {
      const token = 'valid-token';
      const sessionUa = 'Mozilla/5.0 (Chrome)';
      const requestUa = 'Mozilla/5.0 (Firefox)';
      const sessionWithUa = { ...mockSession, userAgent: sessionUa };
      const context = createMockExecutionContext(`Bearer ${token}`, '127.0.0.1', requestUa);

      authService.validateSession.mockResolvedValue(sessionWithUa);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).toHaveBeenCalledWith(
        'User agent mismatch detected',
        {
          userId: mockSession.userId,
          sessionUserAgent: sessionUa,
          requestUserAgent: requestUa,
          ipAddress: '127.0.0.1',
        },
      );
    });

    it('should allow access when User Agent matches', async () => {
      const token = 'valid-token';
      const userAgent = 'Mozilla/5.0';
      const sessionWithUa = { ...mockSession, userAgent };
      const context = createMockExecutionContext(`Bearer ${token}`, '127.0.0.1', userAgent);

      authService.validateSession.mockResolvedValue(sessionWithUa);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
    });

    it('should skip UA validation when session has no user agent', async () => {
      const token = 'valid-token';
      const sessionWithoutUa = { ...mockSession, userAgent: null };
      const context = createMockExecutionContext(`Bearer ${token}`, '127.0.0.1', 'Mozilla/5.0');

      authService.validateSession.mockResolvedValue(sessionWithoutUa);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
    });

    it('should skip UA validation when request has no user agent', async () => {
      const token = 'valid-token';
      const sessionWithUa = { ...mockSession, userAgent: 'Mozilla/5.0' };
      const context = createMockExecutionContext(`Bearer ${token}`, '127.0.0.1', null);

      authService.validateSession.mockResolvedValue(sessionWithUa);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
    });
  });

  describe('Combined Validations', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'auth.security.enableIpValidation') return true;
        if (key === 'auth.security.enableUserAgentValidation') return true;
        return false;
      });
    });

    it('should perform both IP and UA validations when enabled', async () => {
      const token = 'valid-token';
      const ip = '192.168.1.1';
      const userAgent = 'Mozilla/5.0';
      const session = { ...mockSession, ipAddress: ip, userAgent };
      const context = createMockExecutionContext(`Bearer ${token}`, ip, userAgent);

      authService.validateSession.mockResolvedValue(session);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
    });

    it('should block access on IP mismatch even if UA matches', async () => {
      const token = 'valid-token';
      const sessionIp = '192.168.1.1';
      const requestIp = '192.168.1.2';
      const userAgent = 'Mozilla/5.0';
      const session = { ...mockSession, ipAddress: sessionIp, userAgent };
      const context = createMockExecutionContext(`Bearer ${token}`, requestIp, userAgent);

      authService.validateSession.mockResolvedValue(session);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('SESSION_IP_MISMATCH'),
      );
    });
  });

  describe('Disabled Validations', () => {
    it('should not perform IP validation when disabled', async () => {
      const token = 'valid-token';
      const sessionIp = '192.168.1.1';
      const requestIp = '192.168.1.2';
      const session = { ...mockSession, ipAddress: sessionIp };
      const context = createMockExecutionContext(`Bearer ${token}`, requestIp);

      configService.get.mockImplementation((key: string) => {
        if (key === 'auth.security.enableIpValidation') return false;
        return false;
      });

      authService.validateSession.mockResolvedValue(session);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
    });

    it('should not perform UA validation when disabled', async () => {
      const token = 'valid-token';
      const sessionUa = 'Chrome';
      const requestUa = 'Firefox';
      const session = { ...mockSession, userAgent: sessionUa };
      const context = createMockExecutionContext(`Bearer ${token}`, '127.0.0.1', requestUa);

      configService.get.mockImplementation((key: string) => {
        if (key === 'auth.security.enableUserAgentValidation') return false;
        return false;
      });

      authService.validateSession.mockResolvedValue(session);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(auditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
    });
  });
});
