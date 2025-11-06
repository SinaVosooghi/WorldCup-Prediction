import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Session } from '../entities/session.entity';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { MetricsService } from '../../common/services/metrics.service';

/**
 * Service responsible for cleaning up expired sessions from the database.
 * Runs on a configurable cron schedule (default: daily at 2 AM).
 */
@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    private configService: ConfigService,
    private auditLogger: AuditLoggerService,
    private metricsService: MetricsService,
  ) {}

  /**
   * Cron job that runs daily at 2 AM to clean expired sessions.
   * Schedule can be configured via SESSION_CLEANUP_CRON env var.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'session-cleanup',
    timeZone: 'Asia/Tehran',
  })
  async handleSessionCleanup(): Promise<void> {
    this.logger.log('Starting scheduled session cleanup...');
    await this.cleanupExpiredSessions();
  }

  /**
   * Manually triggers session cleanup (useful for testing and manual operations).
   *
   * @returns Number of sessions deleted
   */
  async cleanupExpiredSessions(): Promise<number> {
    const startTime = Date.now();

    try {
      // Find all expired sessions
      const expiredSessions = await this.sessionRepository.find({
        where: {
          expiresAt: LessThan(new Date()),
        },
      });

      const count = expiredSessions.length;

      if (count === 0) {
        this.logger.log('No expired sessions to clean up');
        return 0;
      }

      // Delete expired sessions
      await this.sessionRepository.delete({
        expiresAt: LessThan(new Date()),
      });

      const duration = (Date.now() - startTime) / 1000;

      // Logging
      this.logger.log(`Cleaned up ${count} expired sessions in ${duration.toFixed(2)}s`);

      // Audit log
      this.auditLogger.log({
        timestamp: new Date(),
        eventType: 'SESSION_CLEANUP' as any,
        success: true,
        message: `Cleaned ${count} expired sessions`,
        metadata: { count, durationSeconds: duration },
      });

      // Metrics
      this.metricsService.incrementSessionsCleaned(count);

      return count;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      this.logger.error(`Session cleanup failed after ${duration.toFixed(2)}s`, error.stack);

      // Audit log
      this.auditLogger.log({
        timestamp: new Date(),
        eventType: 'SESSION_CLEANUP' as any,
        success: false,
        message: `Session cleanup failed: ${error.message}`,
        metadata: { error: error.message, durationSeconds: duration },
      });

      throw error;
    }
  }

  /**
   * Gets count of expired sessions without deleting them.
   *
   * @returns Number of expired sessions
   */
  async getExpiredSessionsCount(): Promise<number> {
    return await this.sessionRepository.count({
      where: {
        expiresAt: LessThan(new Date()),
      },
    });
  }

  /**
   * Gets count of active (non-expired) sessions.
   * Used to update the active sessions gauge metric.
   *
   * @returns Number of active sessions
   */
  async getActiveSessionsCount(): Promise<number> {
    const count = await this.sessionRepository.count({
      where: {
        expiresAt: MoreThan(new Date()),
      },
    });

    // Update gauge metric
    this.metricsService.setActiveSessions(count);

    return count;
  }
}
