import Redis from 'ioredis';

/**
 * Test helper for extracting OTP codes from Redis during E2E tests.
 * This allows full auth flow testing without needing to mock the SMS service.
 */
export class OtpTestHelper {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD,
    });
  }

  /**
   * Extracts the OTP code from Redis for a given phone number.
   *
   * @param phone - Phone number to get OTP for
   * @returns The OTP code, or null if not found
   */
  async getOtpCode(phone: string): Promise<string | null> {
    const otpKey = `otp:phone:${phone}`;
    const otpDataStr = await this.redis.get(otpKey);

    if (!otpDataStr) {
      return null;
    }

    const otpData = JSON.parse(otpDataStr);
    return otpData.code;
  }

  /**
   * Waits for an OTP to be available in Redis.
   * Useful when OTP send is async.
   *
   * @param phone - Phone number to wait for
   * @param maxWaitMs - Maximum time to wait in milliseconds
   * @returns The OTP code
   * @throws Error if OTP not found within timeout
   */
  async waitForOtp(phone: string, maxWaitMs: number = 5000): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const code = await this.getOtpCode(phone);
      if (code) {
        return code;
      }
      await this.sleep(100);
    }

    throw new Error(`OTP not found for ${phone} within ${maxWaitMs}ms`);
  }

  /**
   * Clears the OTP for a phone number (cleanup after test).
   *
   * @param phone - Phone number to clear OTP for
   */
  async clearOtp(phone: string): Promise<void> {
    const otpKey = `otp:phone:${phone}`;
    await this.redis.del(otpKey);
  }

  /**
   * Closes the Redis connection.
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
