import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

/**
 * Service responsible for session caching operations in Redis.
 * Centralizes all Redis cache logic for sessions and tokens.
 */
@Injectable()
export class SessionCacheService {
  constructor(
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  /**
   * Caches an access token with its associated session ID.
   *
   * @param tokenPrefix - The prefix of the access token
   * @param sessionId - The session ID to cache
   * @param ttl - Time to live in seconds
   */
  async cacheAccessToken(tokenPrefix: string, sessionId: string, ttl: number): Promise<void> {
    const cachePrefix = this.configService.get<string>('auth.session.cachePrefix');
    const cacheKey = `${cachePrefix}${tokenPrefix}`;
    await this.redisService.setex(cacheKey, ttl, sessionId);
  }

  /**
   * Caches a refresh token with its associated session ID.
   *
   * @param tokenPrefix - The prefix of the refresh token
   * @param sessionId - The session ID to cache
   * @param ttl - Time to live in seconds
   */
  async cacheRefreshToken(tokenPrefix: string, sessionId: string, ttl: number): Promise<void> {
    const refreshCachePrefix = this.configService.get<string>('auth.session.refreshCachePrefix');
    const cacheKey = `${refreshCachePrefix}${tokenPrefix}`;
    await this.redisService.setex(cacheKey, ttl, sessionId);
  }

  /**
   * Retrieves a session ID from cache using an access token prefix.
   *
   * @param tokenPrefix - The prefix of the access token
   * @returns Session ID if cached, null otherwise
   */
  async getCachedSessionByAccessToken(tokenPrefix: string): Promise<string | null> {
    const cachePrefix = this.configService.get<string>('auth.session.cachePrefix');
    const cacheKey = `${cachePrefix}${tokenPrefix}`;
    return await this.redisService.get(cacheKey);
  }

  /**
   * Retrieves a session ID from cache using a refresh token prefix.
   *
   * @param tokenPrefix - The prefix of the refresh token
   * @returns Session ID if cached, null otherwise
   */
  async getCachedSessionByRefreshToken(tokenPrefix: string): Promise<string | null> {
    const refreshCachePrefix = this.configService.get<string>('auth.session.refreshCachePrefix');
    const cacheKey = `${refreshCachePrefix}${tokenPrefix}`;
    return await this.redisService.get(cacheKey);
  }

  /**
   * Invalidates a cached access token.
   *
   * @param tokenPrefix - The prefix of the access token to invalidate
   */
  async invalidateAccessToken(tokenPrefix: string): Promise<void> {
    const cachePrefix = this.configService.get<string>('auth.session.cachePrefix');
    const cacheKey = `${cachePrefix}${tokenPrefix}`;
    await this.redisService.del(cacheKey);
  }

  /**
   * Invalidates a cached refresh token.
   *
   * @param tokenPrefix - The prefix of the refresh token to invalidate
   */
  async invalidateRefreshToken(tokenPrefix: string): Promise<void> {
    const refreshCachePrefix = this.configService.get<string>('auth.session.refreshCachePrefix');
    const cacheKey = `${refreshCachePrefix}${tokenPrefix}`;
    await this.redisService.del(cacheKey);
  }

  /**
   * Tracks token refresh frequency for abuse detection.
   *
   * @param userId - The user ID to track
   * @returns Current refresh count within the time window
   */
  async incrementRefreshFrequency(userId: string): Promise<number> {
    const refreshKey = `refresh:frequency:${userId}`;
    const refreshCount = await this.redisService.incr(refreshKey);
    await this.redisService.expire(refreshKey, AUTH_CONSTANTS.TIME_WINDOWS.ONE_HOUR_SECONDS);
    return refreshCount;
  }
}
