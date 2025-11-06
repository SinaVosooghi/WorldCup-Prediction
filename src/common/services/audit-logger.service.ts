import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum AuditEventType {
  OTP_SENT = 'OTP_SENT',
  OTP_VERIFIED = 'OTP_VERIFIED',
  OTP_VERIFICATION_FAILED = 'OTP_VERIFICATION_FAILED',
  OTP_EXPIRED = 'OTP_EXPIRED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_VALIDATED = 'SESSION_VALIDATED',
  SESSION_VALIDATION_FAILED = 'SESSION_VALIDATION_FAILED',
  SESSION_DELETED = 'SESSION_DELETED',
  ALL_SESSIONS_DELETED = 'ALL_SESSIONS_DELETED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  USER_CREATED = 'USER_CREATED',
  USER_LOGIN = 'USER_LOGIN',
}

export interface AuditLogEntry {
  timestamp: Date;
  eventType: AuditEventType;
  userId?: string;
  phone?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  success: boolean;
  message?: string;
}

/**
 * Service for logging security and authentication events.
 * In production, this should write to a dedicated audit log database or service.
 */
@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger(AuditLoggerService.name);
  private readonly isProduction: boolean;

  constructor(private configService: ConfigService) {
    this.isProduction = this.configService.get<string>('nodeEnv') === 'production';
  }

  /**
   * Logs an audit event for security monitoring and compliance.
   *
   * @param entry - Audit log entry details
   */
  log(entry: AuditLogEntry): void {
    const logData = {
      timestamp: entry.timestamp.toISOString(),
      eventType: entry.eventType,
      userId: entry.userId || 'N/A',
      phone: this.maskPhoneNumber(entry.phone),
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      success: entry.success,
      message: entry.message,
      metadata: entry.metadata,
    };

    // In production, send to centralized logging service (e.g., ELK, Datadog, CloudWatch)
    if (this.isProduction) {
      // TODO: Integrate with production logging service
      this.logger.log(JSON.stringify(logData));
    } else {
      // Development: Pretty print for debugging
      this.logger.log(`[AUDIT] ${entry.eventType}`, logData);
    }

    // If this is a security concern, also log as warning
    if (this.isSecurityEvent(entry.eventType) && !entry.success) {
      this.logger.warn(`[SECURITY] ${entry.eventType} - ${entry.message}`, logData);
    }
  }

  /**
   * Logs a successful OTP send event.
   */
  logOtpSent(phone: string, ipAddress: string, userAgent: string): void {
    this.log({
      timestamp: new Date(),
      eventType: AuditEventType.OTP_SENT,
      phone,
      ipAddress,
      userAgent,
      success: true,
      message: 'OTP sent successfully',
    });
  }

  /**
   * Logs a successful OTP verification.
   */
  logOtpVerified(userId: string, phone: string, ipAddress: string, userAgent: string): void {
    this.log({
      timestamp: new Date(),
      eventType: AuditEventType.OTP_VERIFIED,
      userId,
      phone,
      ipAddress,
      userAgent,
      success: true,
      message: 'OTP verified successfully',
    });
  }

  /**
   * Logs a failed OTP verification attempt.
   */
  logOtpVerificationFailed(
    phone: string,
    ipAddress: string,
    reason: string,
    userAgent?: string,
  ): void {
    this.log({
      timestamp: new Date(),
      eventType: AuditEventType.OTP_VERIFICATION_FAILED,
      phone,
      ipAddress,
      userAgent,
      success: false,
      message: reason,
    });
  }

  /**
   * Logs rate limit exceeded events.
   */
  logRateLimitExceeded(
    phone: string,
    ipAddress: string,
    limitType: string,
    userAgent?: string,
  ): void {
    this.log({
      timestamp: new Date(),
      eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
      phone,
      ipAddress,
      userAgent,
      success: false,
      message: `Rate limit exceeded: ${limitType}`,
      metadata: { limitType },
    });
  }

  /**
   * Logs session creation.
   */
  logSessionCreated(userId: string, sessionId: string, ipAddress: string, userAgent: string): void {
    this.log({
      timestamp: new Date(),
      eventType: AuditEventType.SESSION_CREATED,
      userId,
      ipAddress,
      userAgent,
      success: true,
      message: 'Session created',
      metadata: { sessionId },
    });
  }

  /**
   * Logs session validation attempts.
   */
  logSessionValidation(
    userId: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
  ): void {
    this.log({
      timestamp: new Date(),
      eventType: success
        ? AuditEventType.SESSION_VALIDATED
        : AuditEventType.SESSION_VALIDATION_FAILED,
      userId,
      ipAddress,
      userAgent,
      success,
      message: success ? 'Session validated' : 'Session validation failed',
    });
  }

  /**
   * Logs session deletion.
   */
  logSessionDeleted(userId: string, sessionId: string, deletedAll: boolean = false): void {
    this.log({
      timestamp: new Date(),
      eventType: deletedAll ? AuditEventType.ALL_SESSIONS_DELETED : AuditEventType.SESSION_DELETED,
      userId,
      success: true,
      message: deletedAll ? 'All sessions deleted' : 'Session deleted',
      metadata: { sessionId: deletedAll ? 'all' : sessionId },
    });
  }

  /**
   * Logs user creation.
   */
  logUserCreated(userId: string, phone: string): void {
    this.log({
      timestamp: new Date(),
      eventType: AuditEventType.USER_CREATED,
      userId,
      phone,
      success: true,
      message: 'New user created',
    });
  }

  /**
   * Logs suspicious activity that requires attention.
   */
  logSuspiciousActivity(description: string, metadata?: Record<string, any>): void {
    this.log({
      timestamp: new Date(),
      eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
      success: false,
      message: description,
      metadata,
      ...metadata, // Spread metadata for ip, phone, etc.
    });
  }

  /**
   * Masks phone number for privacy in logs (shows only last 4 digits).
   *
   * @param phone - Phone number to mask
   * @returns Masked phone number
   */
  private maskPhoneNumber(phone?: string): string {
    if (!phone) return 'N/A';

    if (phone.length <= 4) return '****';

    const lastFour = phone.slice(-4);
    const masked = '*'.repeat(phone.length - 4) + lastFour;
    return masked;
  }

  /**
   * Determines if an event type is security-related.
   *
   * @param eventType - Event type to check
   * @returns True if security event
   */
  private isSecurityEvent(eventType: AuditEventType): boolean {
    const securityEvents = [
      AuditEventType.OTP_VERIFICATION_FAILED,
      AuditEventType.RATE_LIMIT_EXCEEDED,
      AuditEventType.SESSION_VALIDATION_FAILED,
      AuditEventType.SUSPICIOUS_ACTIVITY,
    ];

    return securityEvents.includes(eventType);
  }
}
