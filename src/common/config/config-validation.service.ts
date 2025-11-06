import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Configuration Validation Service
 *
 * Validates all environment variables on application startup.
 * Fails fast for critical missing configs, warns for optional ones.
 * Run this BEFORE application bootstrap to ensure system integrity.
 */
@Injectable()
export class ConfigValidationService {
  private readonly logger = new Logger(ConfigValidationService.name);
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(private configService: ConfigService) {}

  /**
   * Validates all configuration values
   * Throws error if critical configs are missing/invalid
   */
  validate(): void {
    this.logger.log('Validating configuration...');

    // Critical validations (will throw if failed)
    this.validateDatabase();
    this.validateRedis();
    this.validateRabbitMQ();

    // Optional validations (will warn only)
    this.validateOptionalConfigs();

    // Report results
    if (this.errors.length > 0) {
      this.logger.error('❌ Configuration validation failed:');
      this.errors.forEach((error) => this.logger.error(`  - ${error}`));
      throw new Error(`Configuration validation failed. Fix the above errors and restart.`);
    }

    if (this.warnings.length > 0) {
      this.logger.warn('⚠️  Configuration warnings:');
      this.warnings.forEach((warning) => this.logger.warn(`  - ${warning}`));
    }

    this.logger.log('✅ Configuration validation passed');
  }

  private validateDatabase(): void {
    const host = this.configService.get<string>('database.host');
    const port = this.configService.get<number>('database.port');
    const username = this.configService.get<string>('database.username');
    const password = this.configService.get<string>('database.password');
    const database = this.configService.get<string>('database.database');
    const poolSize = this.configService.get<number>('database.poolSize');

    if (!host) {
      this.errors.push('DATABASE_HOST is required but missing');
    }

    if (!port || port < 1 || port > 65535) {
      this.errors.push('DATABASE_PORT must be a valid port number (1-65535)');
    }

    if (!username) {
      this.errors.push('DATABASE_USERNAME is required but missing');
    }

    if (!password) {
      this.warnings.push('DATABASE_PASSWORD is not set (using default "postgres")');
    }

    if (!database) {
      this.errors.push('DATABASE_NAME is required but missing');
    }

    if (poolSize && (poolSize < 1 || poolSize > 100)) {
      this.errors.push('DATABASE_POOL_SIZE must be between 1 and 100');
    }
  }

  private validateRedis(): void {
    const host = this.configService.get<string>('redis.host');
    const port = this.configService.get<number>('redis.port');

    if (!host) {
      this.errors.push('REDIS_HOST is required but missing');
    }

    if (!port || port < 1 || port > 65535) {
      this.errors.push('REDIS_PORT must be a valid port number (1-65535)');
    }

    const password = this.configService.get<string>('redis.password');
    if (!password) {
      this.warnings.push('REDIS_PASSWORD is not set (authentication disabled)');
    }
  }

  private validateRabbitMQ(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const queue = this.configService.get<string>('rabbitmq.queue');
    const prefetchCount = this.configService.get<number>('rabbitmq.prefetchCount');

    if (!url) {
      this.errors.push('RABBITMQ_URL is required but missing (example: amqp://localhost:5672)');
    } else if (!url.startsWith('amqp://') && !url.startsWith('amqps://')) {
      this.errors.push('RABBITMQ_URL must start with amqp:// or amqps://');
    }

    if (!queue || queue.trim() === '') {
      this.errors.push('RABBITMQ_QUEUE is required but missing');
    }

    if (prefetchCount && (prefetchCount < 1 || prefetchCount > 1000)) {
      this.errors.push('RABBITMQ_PREFETCH_COUNT must be between 1 and 1000');
    }
  }

  private validateOptionalConfigs(): void {
    // Prediction settings
    const batchSize = this.configService.get<number>('prediction.batchSize');
    if (batchSize && (batchSize < 1 || batchSize > 5000)) {
      this.errors.push('PREDICTION_BATCH_SIZE must be between 1 and 5000');
    }

    const asyncEnabled = this.configService.get<boolean>('prediction.enableAsyncProcessing');
    this.logger.log(`Async processing: ${asyncEnabled ? 'ENABLED' : 'DISABLED (legacy mode)'}`);

    // OTP settings
    const otpTtl = this.configService.get<number>('auth.otp.expirySeconds');
    if (otpTtl && (otpTtl < 30 || otpTtl > 600)) {
      this.warnings.push('OTP_EXPIRY_SECONDS should be between 30 and 600 seconds');
    }

    const maxVerifyAttempts = this.configService.get<number>('auth.otp.maxVerifyAttempts');
    if (maxVerifyAttempts && (maxVerifyAttempts < 3 || maxVerifyAttempts > 10)) {
      this.warnings.push('MAX_OTP_VERIFY_ATTEMPTS should be between 3 and 10');
    }

    // SMS configuration
    const smsApiKey = this.configService.get<string>('sms.apiKey');
    const smsSandbox = this.configService.get<boolean>('sms.sandbox');

    if (!smsApiKey && !smsSandbox) {
      this.warnings.push('SMS_API_KEY is missing. SMS will not work in production mode.');
    }
  }

  /**
   * Quick validation helper for use in services
   * @param key - Config key to validate
   * @param defaultValue - Default value if config is missing
   */
  getConfigOrWarn<T>(key: string, defaultValue: T): T {
    try {
      const value = this.configService.get<T>(key);
      if (value === undefined || value === null) {
        this.logger.warn(`Config key '${key}' not found, using default: ${defaultValue}`);
        return defaultValue;
      }
      return value;
    } catch (error) {
      this.logger.error(`Error reading config key '${key}': ${error.message}`);
      return defaultValue;
    }
  }
}
