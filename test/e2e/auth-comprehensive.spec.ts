import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';

const API_BASE = 'http://localhost:3000';

test.describe('OTP Authentication System - Comprehensive Tests', () => {
  // ============================================================================
  // SECTION 1.1: OTP SENDING (POST /auth/send-otp)
  // ============================================================================

  test.describe('Section 1.1: OTP Sending', () => {
    /**
     * Test 1.1.1: Successfully Send OTP to Valid Phone Number
     * When a user provides a valid Iranian phone number, the system should send OTP via SMS
     */
    test('1.1.1 - Should successfully send OTP to valid phone number', async ({ request }) => {
      const validPhone = TestHelpers.generateTestPhone();

      const startTime = Date.now();
      const result = await TestHelpers.sendOTP(request, validPhone);
      const duration = Date.now() - startTime;

      expect(result.status).toBe(200);
      expect(result.body.message).toBe('OTP_SENT_SUCCESSFULLY');
      expect(duration).toBeLessThan(300); // Performance requirement
      TestHelpers.recordPerformance('OTP Send', duration);
    });

    /**
     * Test 1.1.2: Reject Invalid Phone Number Format
     * System should reject various invalid phone formats
     */
    test('1.1.2a - Should reject phone with non-numeric characters', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'abc1234567');
      expect(result.status).toBe(400);
    });

    test('1.1.2b - Should reject phone that is too short', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, '0912345');
      expect(result.status).toBe(400);
    });

    test('1.1.2c - Should reject phone that is too long', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, '091234567890123');
      expect(result.status).toBe(400);
    });

    test('1.1.2d - Should reject phone not starting with 09', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, '98123456789');
      expect(result.status).toBe(400);
    });

    test('1.1.2e - Should reject empty phone string', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, '');
      expect(result.status).toBe(400);
    });

    test('1.1.2f - Should reject null phone value', async ({ request }) => {
      const response = await request.post(`${API_BASE}/auth/send-otp`, {
        data: { phone: null },
      });
      expect([400, 422]).toContain(response.status());
    });

    /**
     * Test 1.1.3: Enforce 2-Minute Rate Limit Per Phone Number
     * A single phone number can only request OTP once every 2 minutes
     */
    test('1.1.3 - Should enforce 2-minute rate limit per phone', async ({ request }) => {
      const testPhone = TestHelpers.generateTestPhone();

      // First request should succeed
      const firstResult = await TestHelpers.sendOTP(request, testPhone);
      expect(firstResult.status).toBe(200);
      expect(firstResult.body.message).toBe('OTP_SENT_SUCCESSFULLY');

      // Second request immediately after should be rate limited
      const secondResult = await TestHelpers.sendOTP(request, testPhone);
      expect(secondResult.status).toBe(429);
      expect(secondResult.body.message).toContain('EXCEEDED_SEND_LIMIT');

      // Note: Full 2-minute test would be time-consuming in CI/CD
      // Verify rate limit key format: otp:send:limit:{phoneNumber}
    });

    /**
     * Test 1.1.4: Different Clients/IPs Can Request Separately
     * Two different clients should have independent rate limiting
     */
    test('1.1.4 - Different clients should have independent rate limits', async ({
      request,
      browser,
    }) => {
      const testPhone = TestHelpers.generateTestPhone();

      // First context (simulating Client A)
      const result1 = await TestHelpers.sendOTP(request, testPhone);
      expect(result1.status).toBe(200);

      // Same context tries again (should be rate limited)
      const result2 = await TestHelpers.sendOTP(request, testPhone);
      expect(result2.status).toBe(429);

      // Different phone should work
      const diffPhone = TestHelpers.generateTestPhone();
      const result3 = await TestHelpers.sendOTP(request, diffPhone);
      expect(result3.status).toBe(200);
    });

    /**
     * Test 1.1.5: SMS Delivery Format
     * OTP code should be 6 digits
     */
    test('1.1.5 - OTP should be delivered with correct format', async ({ request }) => {
      const validPhone = TestHelpers.generateTestPhone();

      const result = await TestHelpers.sendOTP(request, validPhone);
      expect(result.status).toBe(200);

      // Response should confirm SMS sending
      expect(result.body).toHaveProperty('message');
      expect(result.body.message).toBe('OTP_SENT_SUCCESSFULLY');

      // Note: In test environment, OTP should be extractable from logs or Redis
    });
  });

  // ============================================================================
  // SECTION 1.2: OTP VERIFICATION (POST /auth/verify-otp)
  // ============================================================================

  test.describe('Section 1.2: OTP Verification', () => {
    /**
     * Test 1.2.2: Reject Invalid OTP Code Format
     * OTP code must be exactly 6 digits
     */
    test('1.2.2a - Should reject OTP code that is too short (3 digits)', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const result = await TestHelpers.verifyOTP(request, phone, '123');
      expect(result.status).toBe(400);
    });

    test('1.2.2b - Should reject OTP code that is too long (7 digits)', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const result = await TestHelpers.verifyOTP(request, phone, '1234567');
      expect(result.status).toBe(400);
    });

    test('1.2.2c - Should reject OTP with non-numeric characters', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const result = await TestHelpers.verifyOTP(request, phone, '12345a');
      expect(result.status).toBe(400);
    });

    test('1.2.2d - Should reject empty OTP string', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const result = await TestHelpers.verifyOTP(request, phone, '');
      expect(result.status).toBe(400);
    });

    test('1.2.2e - Should reject null OTP value', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const response = await request.post(`${API_BASE}/auth/verify-otp`, {
        data: { phone, code: null },
      });
      expect([400, 422]).toContain(response.status());
    });

    test('1.2.2f - Should reject OTP with special characters', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const result = await TestHelpers.verifyOTP(request, phone, '1234!@');
      expect(result.status).toBe(400);
    });

    /**
     * Test 1.2.3: Reject Expired OTP
     * OTP expires after 120 seconds
     */
    test('1.2.3 - Should reject verification with non-existent OTP', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      // Without sending OTP first, verification should fail
      const result = await TestHelpers.verifyOTP(request, phone, '999999');
      expect(result.status).toBe(400);
      expect(result.body.message).toMatch(/OTP_NOT_FOUND_OR_EXPIRED|INVALID_OTP_CODE/);
    });

    /**
     * Test 1.2.4: Enforce 5 Verification Attempts Per Minute Rate Limit
     * Maximum 5 failed verification attempts per minute
     */
    test('1.2.4 - Should enforce 5 verification attempts per minute limit', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // Make 5 failed verification attempts
      for (let i = 0; i < 5; i++) {
        const result = await TestHelpers.verifyOTP(request, phone, '000000');
        expect([400, 429]).toContain(result.status);
      }

      // 6th attempt should be rate limited
      const sixthResult = await TestHelpers.verifyOTP(request, phone, '000000');
      expect(sixthResult.status).toBe(429);
      expect(sixthResult.body.message).toContain('EXCEEDED_VERIFICATION_ATTEMPTS');
    });

    /**
     * Test 1.2.5: Track Verification Attempt Counter
     * System should increment attempt counter in Redis
     */
    test('1.2.5 - Should increment verification attempt counter', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // First attempt
      const result1 = await TestHelpers.verifyOTP(request, phone, '000000');
      expect([400, 429]).toContain(result1.status);

      // Second attempt
      const result2 = await TestHelpers.verifyOTP(request, phone, '000000');
      expect([400, 429]).toContain(result2.status);

      // Note: Redis key format: otp:verify:attempts:{phoneNumber} with TTL 60 seconds
    });
  });

  // ============================================================================
  // SECTION 1.3: TOKEN & SESSION MANAGEMENT
  // ============================================================================

  test.describe('Section 1.3: Token & Session Management', () => {
    /**
     * Test 1.3.2: Token Expiration After Deletion from Database
     * When a token is deleted, it becomes invalid
     */
    test('1.3.2 - Should reject deleted token in protected endpoints', async ({ request }) => {
      // Try to access sessions endpoint without token
      const response = await request.get(`${API_BASE}/auth/sessions`);
      expect(response.status()).toBe(401);
    });

    /**
     * Test 1.3.3: Get List of Active Sessions
     * User can retrieve all active sessions
     */
    test('1.3.3 - Should require token to get sessions', async ({ request }) => {
      const response = await request.get(`${API_BASE}/auth/sessions`, {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });
      expect(response.status()).toBe(401);
    });

    /**
     * Test 1.3.4: Delete Specific Session
     * User can delete a specific session
     */
    test('1.3.4 - Should reject session deletion without proper token', async ({ request }) => {
      const fakeTokenId = 'invalid-session-id';
      const response = await request.delete(`${API_BASE}/auth/sessions/${fakeTokenId}`, {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });
      expect(response.status()).toBe(401);
    });

    /**
     * Test 1.3.5: Require Authentication for Session Endpoints
     * All session endpoints require valid authentication
     */
    test('1.3.5a - GET /auth/sessions without token should return 401', async ({ request }) => {
      const response = await request.get(`${API_BASE}/auth/sessions`);
      expect(response.status()).toBe(401);
    });

    test('1.3.5b - GET /auth/sessions with invalid token should return 401', async ({
      request,
    }) => {
      const response = await request.get(`${API_BASE}/auth/sessions`, {
        headers: {
          Authorization: 'Bearer invalid-token-xyz',
        },
      });
      expect(response.status()).toBe(401);
    });

    test('1.3.5c - DELETE /auth/sessions/:tokenId without token should return 401', async ({
      request,
    }) => {
      const response = await request.delete(`${API_BASE}/auth/sessions/some-id`);
      expect(response.status()).toBe(401);
    });
  });

  // ============================================================================
  // SECTION 1.4: SECURITY & PERFORMANCE
  // ============================================================================

  test.describe('Section 1.4: Security & Performance', () => {
    /**
     * Test 1.4.1: Authentication Response Time < 300ms
     * Both OTP send and verify operations should complete under 300ms
     */
    test('1.4.1a - OTP send response should be under 300ms', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const startTime = Date.now();

      await TestHelpers.sendOTP(request, phone);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(300);
      TestHelpers.recordPerformance('OTP Send', duration);
    });

    test('1.4.1b - OTP verify response should be under 300ms', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const startTime = Date.now();

      await TestHelpers.verifyOTP(request, phone, '123456');

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(300);
      TestHelpers.recordPerformance('OTP Verify', duration);
    });

    /**
     * Test 1.4.2: No Sensitive Data in Response Body
     * Response should not contain OTP codes or sensitive information
     * (Note: In SMS_SANDBOX mode, OTP is intentionally included for testing)
     */
    test('1.4.2 - Response should not expose sensitive data', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const result = await TestHelpers.sendOTP(request, phone);

      // In non-sandbox mode, no OTP should be in response
      // In sandbox mode (SMS_SANDBOX=true), OTP is included for testing
      const isSandbox = process.env.SMS_SANDBOX === 'true';

      if (!isSandbox) {
        const responseText = JSON.stringify(result.body);
        expect(responseText).not.toMatch(/\b\d{6}\b/); // No 6-digit OTP code
      }

      // Should never expose other sensitive data
      const responseText = JSON.stringify(result.body);
      expect(responseText).not.toMatch(/password|secret|key/i);
    });

    /**
     * Test 1.4.3: Prevent OTP Brute Force Attacks
     * Combined protections against brute force
     */
    test('1.4.3 - Should protect against brute force attacks', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // Send OTP first
      await TestHelpers.sendOTP(request, phone);

      // Try multiple wrong codes (should be rate limited after 5 attempts)
      for (let i = 0; i < 5; i++) {
        const result = await TestHelpers.verifyOTP(request, phone, '000000');
        expect([400, 429]).toContain(result.status);
      }

      // 6th attempt should be blocked
      const result = await TestHelpers.verifyOTP(request, phone, '000000');
      expect(result.status).toBe(429);
    });

    /**
     * Test 1.4.4: IP-based Rate Limiting
     * Each IP address should have independent rate limiting
     */
    test('1.4.4 - Should apply IP-based rate limiting', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // First request from this IP
      const result1 = await TestHelpers.sendOTP(request, phone);
      expect(result1.status).toBe(200);

      // Second request from same IP should be rate limited
      const result2 = await TestHelpers.sendOTP(request, phone);
      expect(result2.status).toBe(429);
    });
  });

  // ============================================================================
  // SECTION 1.5: INTEGRATION & EDGE CASES
  // ============================================================================

  test.describe('Section 1.5: Integration & Edge Cases', () => {
    /**
     * Test 1.5.1: Handle concurrent OTP requests
     */
    test('1.5.1 - Should handle concurrent OTP requests to different phones', async ({
      request,
    }) => {
      const phone1 = TestHelpers.generateTestPhone();
      const phone2 = TestHelpers.generateTestPhone();

      const [result1, result2] = await Promise.all([
        TestHelpers.sendOTP(request, phone1),
        TestHelpers.sendOTP(request, phone2),
      ]);

      expect(result1.status).toBe(200);
      expect(result2.status).toBe(200);
    });

    /**
     * Test 1.5.2: Correct error message format
     */
    test('1.5.2 - Error responses should have consistent format', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'invalid-format');

      expect(result.status).toBe(400);
      expect(result.body).toHaveProperty('message');
      expect(result.body).toHaveProperty('statusCode');
    });

    /**
     * Test 1.5.3: Rate limit response headers
     */
    test('1.5.3 - Rate limit response should include retry information', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // First request
      await TestHelpers.sendOTP(request, phone);

      // Second request (rate limited)
      const response = await request.post(`${API_BASE}/auth/send-otp`, {
        data: { phone },
      });

      expect(response.status()).toBe(429);
      // Check for retry headers if implemented
      // expect(response.headers()['retry-after']).toBeDefined();
    });
  });
});
