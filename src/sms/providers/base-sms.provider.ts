import { Logger } from '@nestjs/common';

/**
 * Base abstract class for SMS providers
 * Implements the Strategy pattern for different SMS providers
 */
export abstract class BaseSmsProvider {
  protected readonly logger: Logger;

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Send an OTP SMS to the specified phone number
   * @param phone - Phone number to send SMS to
   * @param code - OTP code to send
   * @throws Error if SMS sending fails
   */
  abstract sendOtpSms(phone: string, code: string): Promise<void>;

  /**
   * Validate phone number format (basic validation)
   * @param phone - Phone number to validate
   * @returns true if valid
   */
  protected validatePhoneNumber(phone: string): boolean {
    // Basic validation - can be enhanced based on requirements
    return phone && phone.length >= 10;
  }

  /**
   * Validate OTP code format
   * @param code - OTP code to validate
   * @returns true if valid
   */
  protected validateOtpCode(code: string): boolean {
    return code && code.length >= 4 && /^\d+$/.test(code);
  }
}
