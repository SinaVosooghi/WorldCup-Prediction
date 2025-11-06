import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseSmsProvider } from './providers/base-sms.provider';
import { MockSmsProvider } from './providers/mock-sms.provider';
import { ProductionSmsProvider } from './providers/production-sms.provider';

export interface ISmsProvider {
  sendOtpSms(phone: string, code: string): Promise<void>;
}

/**
 * SMS Service using Strategy pattern for different SMS providers
 * Automatically selects between mock (sandbox) and production providers
 */
@Injectable()
export class SmsService implements ISmsProvider {
  private readonly logger = new Logger(SmsService.name);
  private readonly smsProvider: BaseSmsProvider;

  constructor(private configService: ConfigService) {
    // Select provider based on sandbox mode (Strategy pattern)
    const isSandbox = this.configService.get<boolean>('sms.sandbox');

    if (isSandbox) {
      this.smsProvider = new MockSmsProvider();
      this.logger.log('SMS Service initialized with MockSmsProvider (sandbox mode)');
    } else {
      this.smsProvider = new ProductionSmsProvider(this.configService);
      this.logger.log('SMS Service initialized with ProductionSmsProvider');
    }
  }

  async sendOtpSms(phone: string, code: string): Promise<void> {
    try {
      await this.smsProvider.sendOtpSms(phone, code);
    } catch (error) {
      this.logger.error(`Failed to send OTP SMS to ${phone}:`, error);
      throw error;
    }
  }
}
