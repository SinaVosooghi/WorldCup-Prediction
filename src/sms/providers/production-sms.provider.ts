import { BaseSmsProvider } from './base-sms.provider';
import { ConfigService } from '@nestjs/config';

/**
 * Production SMS provider
 * Integrates with real SMS service (e.g., Kavenegar, Ghasedak, Twilio, AWS SNS)
 */
export class ProductionSmsProvider extends BaseSmsProvider {
  constructor(private configService: ConfigService) {
    super('ProductionSmsProvider');
  }

  async sendOtpSms(phone: string, code: string): Promise<void> {
    if (!this.validatePhoneNumber(phone)) {
      throw new Error(`Invalid phone number format: ${phone}`);
    }

    if (!this.validateOtpCode(code)) {
      throw new Error(`Invalid OTP code format: ${code}`);
    }

    try {
      await this.sendViaSmsProvider(phone, code);
    } catch (error) {
      this.logger.error(`Failed to send OTP SMS to ${phone}:`, error);
      throw new Error('Failed to send SMS. Please try again later.');
    }
  }

  private async sendViaSmsProvider(phone: string, code: string): Promise<void> {
    const apiKey = this.configService.get<string>('sms.apiKey');

    if (!apiKey) {
      this.logger.warn('SMS API key not configured');
      this.logger.log(`📱 [SMS PRODUCTION] Would send OTP ${code} to ${phone}`);
      this.logger.warn(
        '⚠️  Real SMS provider not configured. Set SMS_SANDBOX=false and configure SMS_API_KEY.',
      );
      return;
    }

    // Example integration structure (uncomment and modify for your SMS provider):
    // const response = await fetch('https://api.sms-provider.com/send', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${apiKey}`,
    //   },
    //   body: JSON.stringify({
    //     receptor: phone,
    //     message: `Your verification code is: ${code}`,
    //   }),
    // });
    //
    // if (!response.ok) {
    //   const errorData = await response.json();
    //   throw new Error(`SMS Provider Error: ${errorData.message || response.statusText}`);
    // }
    //
    // const result = await response.json();
    // this.logger.log(`SMS sent successfully. Message ID: ${result.messageId}`);

    // Placeholder implementation
    this.logger.log(`📱 [SMS PRODUCTION] Would send OTP ${code} to ${phone}`);
    this.logger.warn(
      '⚠️  SMS provider integration not implemented. Add your provider integration code.',
    );
  }
}
