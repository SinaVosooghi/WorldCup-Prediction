import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { MetricsService } from '../../common/services/metrics.service';

/**
 * CSRF Protection: Not required for this API
 *
 * This API uses Bearer token authentication via Authorization headers.
 * CSRF attacks exploit browsers' automatic cookie sending behavior.
 * Since Bearer tokens must be explicitly added to each request header,
 * they are not vulnerable to CSRF attacks.
 *
 * If web clients use cookies for authentication in the future,
 * implement CSRF protection using double-submit cookie pattern.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private auditLogger: AuditLoggerService,
    private metricsService: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      // Enhanced logging for missing/malformed authorization headers
      const authHeader = request.headers.authorization;
      this.auditLogger.logSuspiciousActivity('Missing or malformed authorization header', {
        ipAddress: request.ip || request.connection?.remoteAddress,
        userAgent: request.headers['user-agent'],
        authHeaderPresent: !!authHeader,
        authHeaderFormat: authHeader ? authHeader.split(' ')[0] : 'none',
        path: request.url,
      });
      throw new UnauthorizedException('MISSING_ACCESS_TOKEN');
    }

    try {
      const session = await this.authService.validateSession(token);

      if (!session) {
        this.auditLogger.logSessionValidation('unknown', false);
        this.metricsService.incrementSessionValidationFailed('invalid_token');
        throw new UnauthorizedException('INVALID_OR_EXPIRED_TOKEN');
      }

      // Optional: Validate IP address matches session (if enabled in config)
      const enableIpValidation = this.configService.get<boolean>(
        'auth.security.enableIpValidation',
      );
      if (enableIpValidation && session.ipAddress) {
        const currentIp = request.ip || request.connection?.remoteAddress;
        if (currentIp && currentIp !== 'undefined' && session.ipAddress !== currentIp) {
          this.auditLogger.logSuspiciousActivity('IP address mismatch detected', {
            userId: session.userId,
            sessionIp: session.ipAddress,
            requestIp: currentIp,
            userAgent: request.headers['user-agent'],
          });
          this.metricsService.incrementSessionValidationFailed('ip_mismatch');
          throw new UnauthorizedException('SESSION_IP_MISMATCH');
        }
      }

      // Optional: Validate user agent matches session (if enabled in config)
      const enableUserAgentValidation = this.configService.get<boolean>(
        'auth.security.enableUserAgentValidation',
      );
      if (enableUserAgentValidation && session.userAgent) {
        const currentUserAgent = request.headers['user-agent'];
        if (currentUserAgent && session.userAgent !== currentUserAgent) {
          this.auditLogger.logSuspiciousActivity('User agent mismatch detected', {
            userId: session.userId,
            sessionUserAgent: session.userAgent,
            requestUserAgent: currentUserAgent,
            ipAddress: request.ip,
          });
          // Note: User agent mismatches are logged but not blocked (browser updates are common)
        }
      }

      // Audit log successful validation
      this.auditLogger.logSessionValidation(
        session.userId,
        true,
        request.ip,
        request.headers['user-agent'],
      );

      // Attach user info to request
      request.user = {
        userId: session.userId,
        sessionId: session.id,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('AUTHENTICATION_FAILED');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
