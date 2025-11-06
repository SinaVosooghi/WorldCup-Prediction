import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { Session } from './entities/session.entity';
import { AuditLoggerService } from '../common/services/audit-logger.service';
import { MetricsService } from '../common/services/metrics.service';
import { TokenService } from './services/token.service';
import { SessionCacheService } from './services/session-cache.service';
import { FraudDetectionService } from './services/fraud-detection.service';
import { AUTH_CONSTANTS } from './constants/auth.constants';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    private otpService: OtpService,
    private configService: ConfigService,
    private auditLogger: AuditLoggerService,
    private metricsService: MetricsService,
    private tokenService: TokenService,
    private sessionCacheService: SessionCacheService,
    private fraudDetectionService: FraudDetectionService,
  ) {}

  async sendOtp(phone: string, ip: string, userAgent: string): Promise<{ otp?: string }> {
    return await this.otpService.sendOtp(phone, ip, userAgent);
  }

  async verifyOtp(
    phone: string,
    code: string,
    ip: string,
    userAgent: string,
  ): Promise<{ session: Session; accessToken: string; refreshToken: string }> {
    const { userId } = await this.otpService.verifyOtp(phone, code);
    return await this.createSession(userId, ip, userAgent);
  }

  /**
   * Creates a new session for a user with Redis caching for optimal performance.
   * Generates both access and refresh tokens for enhanced UX.
   */
  private async createSession(
    userId: string,
    ip: string,
    userAgent: string,
  ): Promise<{ session: Session; accessToken: string; refreshToken: string }> {
    await this.fraudDetectionService.checkConcurrentSessions(userId, ip, userAgent);

    const { accessToken, refreshToken, session } = await this.generateSessionTokens(
      userId,
      ip,
      userAgent,
    );

    await this.cacheSessionTokens(accessToken, refreshToken, session.id);

    this.auditLogger.logSessionCreated(userId, session.id, ip, userAgent);
    this.metricsService.incrementSessionCreated();

    return { session, accessToken, refreshToken };
  }

  /**
   * Generates session tokens and creates the session record.
   */
  private async generateSessionTokens(
    userId: string,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string; session: Session }> {
    const refreshTokenTtl = this.configService.get<number>('auth.session.refreshTokenTtlSeconds');

    const { token: accessToken, hash: tokenHash } = await this.tokenService.generateToken();
    const { token: refreshToken, hash: refreshTokenHash } = await this.tokenService.generateToken();

    const session = this.sessionRepository.create({
      userId,
      tokenHash,
      refreshTokenHash,
      userAgent,
      ipAddress: ip,
      expiresAt: new Date(Date.now() + refreshTokenTtl * 1000),
    });

    await this.sessionRepository.save(session);

    return { accessToken, refreshToken, session };
  }

  /**
   * Caches session tokens in Redis for O(1) lookup.
   */
  private async cacheSessionTokens(
    accessToken: string,
    refreshToken: string,
    sessionId: string,
  ): Promise<void> {
    const accessTokenTtl = this.configService.get<number>('auth.session.accessTokenTtlSeconds');
    const refreshTokenTtl = this.configService.get<number>('auth.session.refreshTokenTtlSeconds');

    const accessTokenPrefix = this.tokenService.getTokenPrefix(accessToken);
    const refreshTokenPrefix = this.tokenService.getTokenPrefix(refreshToken);

    await this.sessionCacheService.cacheAccessToken(accessTokenPrefix, sessionId, accessTokenTtl);
    await this.sessionCacheService.cacheRefreshToken(
      refreshTokenPrefix,
      sessionId,
      refreshTokenTtl,
    );
  }

  /**
   * Validates a session token using hybrid Redis cache + database fallback.
   */
  async validateSession(token: string): Promise<Session | null> {
    const startTime = Date.now();

    if (!this.tokenService.validateTokenFormat(token)) {
      this.metricsService.incrementSessionValidation('failure');
      return null;
    }

    const tokenPrefix = this.tokenService.getTokenPrefix(token);
    const session = await this.validateTokenFromCache(token, tokenPrefix);

    if (session) {
      this.recordValidationMetrics(startTime, 'success');
      return session;
    }

    const fallbackSession = await this.validateTokenFromDatabase(token, tokenPrefix);

    if (fallbackSession) {
      this.recordValidationMetrics(startTime, 'success');
      return fallbackSession;
    }

    this.logValidationFailure(token, startTime);
    this.recordValidationMetrics(startTime, 'failure');
    return null;
  }

  /**
   * Validates token using Redis cache.
   */
  private async validateTokenFromCache(
    token: string,
    tokenPrefix: string,
  ): Promise<Session | null> {
    const cachedSessionId =
      await this.sessionCacheService.getCachedSessionByAccessToken(tokenPrefix);

    if (!cachedSessionId) {
      return null;
    }

    const session = await this.sessionRepository.findOne({
      where: { id: cachedSessionId },
    });

    if (session && session.expiresAt > new Date()) {
      const isValid = await this.tokenService.verifyToken(token, session.tokenHash);
      if (isValid) {
        return session;
      }
      await this.sessionCacheService.invalidateAccessToken(tokenPrefix);
    }

    return null;
  }

  /**
   * Validates token by searching database (fallback for cache miss).
   */
  private async validateTokenFromDatabase(
    token: string,
    tokenPrefix: string,
  ): Promise<Session | null> {
    const sessions = await this.sessionRepository.find({
      where: { expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
      take: AUTH_CONSTANTS.SESSION.RECENT_LOOKUP_LIMIT,
    });

    for (const session of sessions) {
      const isValid = await this.tokenService.verifyToken(token, session.tokenHash);
      if (isValid) {
        await this.recacheSession(tokenPrefix, session);
        return session;
      }
    }

    return null;
  }

  /**
   * Re-caches a session after database lookup.
   */
  private async recacheSession(tokenPrefix: string, session: Session): Promise<void> {
    const sessionTtl = this.configService.get<number>('auth.session.ttlSeconds');
    const ttlRemaining = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    await this.sessionCacheService.cacheAccessToken(
      tokenPrefix,
      session.id,
      Math.min(ttlRemaining, sessionTtl),
    );
  }

  /**
   * Records validation metrics.
   */
  private recordValidationMetrics(startTime: number, status: 'success' | 'failure'): void {
    const duration = (Date.now() - startTime) / 1000;
    this.metricsService.recordSessionValidationDuration(duration);
    this.metricsService.incrementSessionValidation(status);
  }

  /**
   * Logs validation failure with details.
   */
  private logValidationFailure(token: string, startTime: number): void {
    const duration = (Date.now() - startTime) / 1000;
    this.auditLogger.logSuspiciousActivity(
      'Session validation failed - token not found in cache or database',
      {
        tokenPrefix: token.substring(0, 8),
        validationDuration: duration,
      },
    );
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    return await this.sessionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Deletes a specific session and invalidates its Redis cache.
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (session) {
      await this.sessionRepository.delete({ id: sessionId, userId });
      this.auditLogger.logSessionDeleted(userId, sessionId, false);
      this.metricsService.incrementSessionDeleted('single');
    }
  }

  /**
   * Deletes all sessions for a user (logout from all devices).
   */
  async deleteAllUserSessions(userId: string): Promise<void> {
    await this.sessionRepository.delete({ userId });
    this.auditLogger.logSessionDeleted(userId, 'all', true);
    this.metricsService.incrementSessionDeleted('all');
  }

  /**
   * Refreshes an access token using a valid refresh token.
   */
  async refreshSession(refreshToken: string): Promise<{ accessToken: string }> {
    const startTime = Date.now();
    const session = await this.findSessionByRefreshToken(refreshToken);

    if (!session) {
      this.logRefreshFailure(refreshToken, startTime);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.checkRefreshFrequency(session);

    const accessToken = await this.generateNewAccessToken(session);

    this.logSuccessfulRefresh(session);

    return { accessToken };
  }

  /**
   * Finds a session by refresh token (cache + database fallback).
   */
  private async findSessionByRefreshToken(refreshToken: string): Promise<Session | null> {
    const refreshPrefix = this.tokenService.getTokenPrefix(refreshToken);
    const cachedSessionId =
      await this.sessionCacheService.getCachedSessionByRefreshToken(refreshPrefix);

    let session: Session | null = null;

    if (cachedSessionId) {
      session = await this.sessionRepository.findOne({
        where: { id: cachedSessionId },
      });

      if (session && session.expiresAt > new Date() && session.refreshTokenHash) {
        const isValid = await this.tokenService.verifyToken(refreshToken, session.refreshTokenHash);
        if (!isValid) {
          session = null;
        }
      } else {
        session = null;
      }
    }

    if (!session) {
      session = await this.findSessionByRefreshTokenFromDatabase(refreshToken);
    }

    return session;
  }

  /**
   * Searches database for session with matching refresh token.
   */
  private async findSessionByRefreshTokenFromDatabase(
    refreshToken: string,
  ): Promise<Session | null> {
    const sessions = await this.sessionRepository.find({
      where: { expiresAt: MoreThan(new Date()) },
      take: AUTH_CONSTANTS.SESSION.BULK_REFRESH_LOOKUP_LIMIT,
    });

    for (const s of sessions) {
      if (s.refreshTokenHash) {
        const isValid = await this.tokenService.verifyToken(refreshToken, s.refreshTokenHash);
        if (isValid) {
          return s;
        }
      }
    }

    return null;
  }

  /**
   * Checks and logs frequent token refresh patterns.
   */
  private async checkRefreshFrequency(session: Session): Promise<void> {
    const refreshCount = await this.sessionCacheService.incrementRefreshFrequency(session.userId);

    if (refreshCount > AUTH_CONSTANTS.RATE_LIMIT.TOKEN_REFRESH_THRESHOLD_PER_HOUR) {
      this.auditLogger.logSuspiciousActivity('Unusually frequent token refresh pattern detected', {
        userId: session.userId,
        sessionId: session.id,
        refreshCount,
        timeWindow: '1 hour',
      });
    }
  }

  /**
   * Generates a new access token for the session.
   */
  private async generateNewAccessToken(session: Session): Promise<string> {
    const accessTokenTtl = this.configService.get<number>('auth.session.accessTokenTtlSeconds');

    const { token: newAccessToken, hash: newTokenHash } = await this.tokenService.generateToken();

    session.tokenHash = newTokenHash;
    await this.sessionRepository.save(session);

    const newTokenPrefix = this.tokenService.getTokenPrefix(newAccessToken);
    await this.sessionCacheService.cacheAccessToken(newTokenPrefix, session.id, accessTokenTtl);

    return newAccessToken;
  }

  /**
   * Logs refresh token failure.
   */
  private logRefreshFailure(refreshToken: string, startTime: number): void {
    this.auditLogger.logSuspiciousActivity('Token refresh failed - invalid refresh token', {
      refreshTokenPrefix: refreshToken.substring(0, 8),
      duration: (Date.now() - startTime) / 1000,
    });
  }

  /**
   * Logs successful token refresh.
   */
  private logSuccessfulRefresh(session: Session): void {
    this.auditLogger.log({
      timestamp: new Date(),
      eventType: 'SESSION_REFRESHED' as any,
      userId: session.userId,
      success: true,
      message: 'Access token refreshed successfully',
      metadata: { sessionId: session.id },
    });
  }
}
