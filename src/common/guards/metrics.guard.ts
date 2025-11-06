import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Metrics Guard
 *
 * Secures the /metrics endpoint using IP whitelist.
 * In production, only allow internal monitoring systems to access metrics.
 */
@Injectable()
export class MetricsGuard implements CanActivate {
  private readonly allowedIps: string[];

  constructor(private configService: ConfigService) {
    // Allow localhost and Docker internal networks by default
    const envIps = process.env.METRICS_ALLOWED_IPS || '';
    this.allowedIps = envIps
      ? envIps.split(',').map((ip) => ip.trim())
      : ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const clientIp = this.getClientIp(request);

    // Check if IP is whitelisted
    const isAllowed = this.allowedIps.some((allowedIp) => {
      // Support CIDR notation check (basic)
      if (allowedIp.includes('/')) {
        // Simple subnet check for common cases like 10.0.0.0/8
        const [network] = allowedIp.split('/');
        return clientIp.startsWith(network.split('.').slice(0, -1).join('.'));
      }
      return clientIp === allowedIp || allowedIp === '*';
    });

    if (!isAllowed) {
      throw new UnauthorizedException(
        `Access denied. IP ${clientIp} not whitelisted for metrics endpoint.`,
      );
    }

    return true;
  }

  private getClientIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0].trim() ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      request.ip
    );
  }
}
