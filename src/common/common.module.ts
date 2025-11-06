import { Module } from '@nestjs/common';
import { RateLimitingGuard } from './guards/rate-limiting.guard';
import { MetricsGuard } from './guards/metrics.guard';
import { ValidationPipe } from './pipes/validation.pipe';
import { AuditLoggerService } from './services/audit-logger.service';
import { MetricsService } from './services/metrics.service';
import { ConfigValidationService } from './config/config-validation.service';

@Module({
  providers: [
    RateLimitingGuard,
    MetricsGuard,
    ValidationPipe,
    AuditLoggerService,
    MetricsService,
    ConfigValidationService,
  ],
  exports: [
    RateLimitingGuard,
    MetricsGuard,
    ValidationPipe,
    AuditLoggerService,
    MetricsService,
    ConfigValidationService,
  ],
})
export class CommonModule {}
