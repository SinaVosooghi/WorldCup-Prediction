import { BaseSmsProvider } from './base-sms.provider';

/**
 * Mock SMS provider for development and testing
 * Logs SMS messages instead of actually sending them
 */
export class MockSmsProvider extends BaseSmsProvider {
  constructor() {
    super('MockSmsProvider');
  }

  async sendOtpSms(phone: string, code: string): Promise<void> {
    if (!this.validatePhoneNumber(phone)) {
      throw new Error(`Invalid phone number format: ${phone}`);
    }

    if (!this.validateOtpCode(code)) {
      throw new Error(`Invalid OTP code format: ${code}`);
    }

    // Mock implementation - log instead of sending
    this.logger.log(`📱 [SMS MOCK] Sending OTP to: ${phone}`);
    this.logger.log(`🔐 [SMS MOCK] OTP Code: ${code}`);
    this.logger.log(`💬 [SMS MOCK] Message: Your verification code is: ${code}`);

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
