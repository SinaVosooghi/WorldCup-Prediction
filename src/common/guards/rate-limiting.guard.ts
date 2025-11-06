import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class RateLimitingGuard implements CanActivate {
  constructor(
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    const key = `rate_limit:${ip}`;

    const windowSeconds = this.configService.get<number>('rateLimit.windowSeconds') || 60;
    const maxRequests = this.configService.get<number>('rateLimit.maxRequests') || 100;

    const requests = await this.redisService.incr(key);
    if (requests === 1) {
      await this.redisService.expire(key, windowSeconds);
    }

    if (requests > maxRequests) {
      throw new TooManyRequestsException('RATE_LIMIT_EXCEEDED');
    }

    return true;
  }
}
