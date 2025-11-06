import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';

const API_BASE = 'http://localhost:3000';
const TEST_PHONE = '09123456789';

test.describe('Authentication Flow', () => {
  test.describe('POST /auth/send-otp', () => {
    test('should send OTP successfully', async ({ request }) => {
      const response = await request.post(`${API_BASE}/auth/send-otp`, {
        data: {
          phone: TEST_PHONE,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.message).toBe('OTP_SENT_SUCCESSFULLY');
    });

    test('should validate phone number format', async ({ request }) => {
      const response = await request.post(`${API_BASE}/auth/send-otp`, {
        data: {
          phone: 'invalid-phone',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should rate limit consecutive requests', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // First request should succeed
      const firstResponse = await request.post(`${API_BASE}/auth/send-otp`, {
        data: { phone },
      });
      expect(firstResponse.status()).toBe(200);

      // Second request should be rate limited
      const secondResponse = await request.post(`${API_BASE}/auth/send-otp`, {
        data: { phone },
      });
      expect(secondResponse.status()).toBe(429);

      const body = await secondResponse.json();
      expect(body.message).toContain('EXCEEDED_SEND_LIMIT');
    });
  });

  test.describe('POST /auth/verify-otp', () => {
    test('should reject invalid OTP format', async ({ request }) => {
      const response = await request.post(`${API_BASE}/auth/verify-otp`, {
        data: {
          phone: TEST_PHONE,
          code: '123', // Invalid: should be 6 digits
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should reject expired OTP', async ({ request }) => {
      // This test assumes OTP has expired or doesn't exist
      const response = await request.post(`${API_BASE}/auth/verify-otp`, {
        data: {
          phone: TEST_PHONE,
          code: '999999',
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.message).toMatch(/OTP_NOT_FOUND_OR_EXPIRED|INVALID_OTP_CODE/);
    });

    test('should track verification attempts', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // Try multiple times with wrong code
      for (let i = 0; i < 6; i++) {
        const response = await request.post(`${API_BASE}/auth/verify-otp`, {
          data: {
            phone,
            code: '000000',
          },
        });

        if (i < 5) {
          expect([400, 429]).toContain(response.status());
        } else {
          // 6th attempt should be rate limited
          expect(response.status()).toBe(429);
          const body = await response.json();
          expect(body.message).toContain('EXCEEDED_VERIFICATION_ATTEMPTS');
        }
      }
    });
  });

  test.describe('Complete Auth Flow', () => {
    test('should complete full authentication flow', async ({ request }) => {
      // Complete auth flow using test helpers
      const { phone, token, otp } = await TestHelpers.authenticateUser(request);

      // Verify we got a valid token
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(20);

      // Use token to access protected endpoint
      const sessionsResponse = await request.get(`${API_BASE}/auth/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      expect(sessionsResponse.status()).toBe(200);

      // Step 2: In real test, you would:
      // - Extract OTP from Redis/logs in test mode
      // - Or use a test phone number that returns a known OTP
      // - Or mock the SMS service to capture the OTP

      // For demonstration, we'll show the verify structure
      // const verifyResponse = await request.post(`${API_BASE}/auth/verify-otp`, {
      //   data: {
      //     phone: TEST_PHONE,
      //     code: extractedOTP,
      //   },
      // });
      // expect(verifyResponse.status()).toBe(200);
      // const verifyBody = await verifyResponse.json();
      // expect(verifyBody).toHaveProperty('accessToken');
      // const accessToken = verifyBody.accessToken;

      // Step 3: Use token to access protected endpoint
      // const sessionsResponse = await request.get(`${API_BASE}/auth/sessions`, {
      //   headers: {
      //     Authorization: `Bearer ${accessToken}`,
      //   },
      // });
      // expect(sessionsResponse.status()).toBe(200);
    });
  });

  test.describe('Session Management', () => {
    test('should reject requests without token', async ({ request }) => {
      const response = await request.get(`${API_BASE}/auth/sessions`);
      expect(response.status()).toBe(401);
    });

    test('should reject requests with invalid token', async ({ request }) => {
      const response = await request.get(`${API_BASE}/auth/sessions`, {
        headers: {
          Authorization: 'Bearer invalid-token-12345',
        },
      });
      expect(response.status()).toBe(401);
    });
  });
});

test.describe('Swagger Documentation', () => {
  test('should serve Swagger UI at /api/docs', async ({ page }) => {
    await page.goto(`${API_BASE}/api/docs`);

    // Check if Swagger UI loaded
    await expect(page).toHaveTitle(/Swagger/i);

    // Check for API title
    const title = await page.locator('.title').textContent();
    expect(title).toContain('World Cup Prediction API');
  });
});
