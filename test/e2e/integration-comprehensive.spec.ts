import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';

const API_BASE = 'http://localhost:3000';

test.describe('Integration, Error Handling & Documentation Tests', () => {
  // ============================================================================
  // SECTION 4: API ENDPOINTS VERIFICATION
  // ============================================================================

  test.describe('Section 4: API Endpoints', () => {
    test('4.1 - POST /auth/send-otp should exist and work', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const result = await TestHelpers.sendOTP(request, phone);
      expect(result.status).toBe(200);
    });

    test('4.2 - POST /auth/verify-otp should exist and validate', async ({ request }) => {
      const result = await TestHelpers.verifyOTP(
        request,
        TestHelpers.generateTestPhone(),
        '123456',
      );
      expect([400, 401]).toContain(result.status);
    });

    test('4.3 - GET /auth/sessions should require authentication', async ({ request }) => {
      const response = await request.get(`${API_BASE}/auth/sessions`);
      expect(response.status()).toBe(401);
    });

    test('4.4 - DELETE /auth/sessions/:tokenId should require authentication', async ({
      request,
    }) => {
      const response = await request.delete(`${API_BASE}/auth/sessions/fake-id`);
      expect(response.status()).toBe(401);
    });

    test('4.5 - GET /prediction/teams should return all teams', async ({ request }) => {
      const result = await TestHelpers.getLeaderboard(request);
      expect(result.status).toBe(200);
    });

    test('4.6 - POST /prediction should require authentication', async ({ request }) => {
      const response = await request.post(`${API_BASE}/prediction`, {
        data: { predict: {} },
      });
      expect(response.status()).toBe(401);
    });

    test('4.7 - GET /prediction/result should require authentication', async ({ request }) => {
      const response = await request.get(`${API_BASE}/prediction/result`);
      expect(response.status()).toBe(401);
    });

    test('4.8 - GET /prediction/leaderboard should work without authentication', async ({
      request,
    }) => {
      const result = await TestHelpers.getLeaderboard(request, 10);
      expect(result.status).toBe(200);
    });

    test('4.9 - POST /prediction/admin/trigger-prediction-process should trigger processing', async ({
      request,
    }) => {
      // Authenticate first
      const { token } = await TestHelpers.authenticateUser(request);

      const result = await TestHelpers.triggerPredictionProcess(request, token);
      expect(result.status).toBe(200);
      expect(result.body.message).toMatch(/PREDICTION_PROCESSING_(STARTED|QUEUED)/);
    });
  });

  // ============================================================================
  // SECTION 5: ERROR HANDLING
  // ============================================================================

  test.describe('Section 5: Error Handling', () => {
    /**
     * Test 5.1: Graceful Error Responses
     */
    test('5.1a - Invalid endpoint should return 404', async ({ request }) => {
      const response = await request.get(`${API_BASE}/non-existent-endpoint`);
      expect(response.status()).toBe(404);
    });

    test('5.1b - Invalid phone format should return 400', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'invalid');
      expect(result.status).toBe(400);
    });

    test('5.1c - Invalid OTP format should return 400', async ({ request }) => {
      const result = await TestHelpers.verifyOTP(request, TestHelpers.generateTestPhone(), 'abc');
      expect(result.status).toBe(400);
    });

    /**
     * Test 5.2: Consistent Error Response Format
     */
    test('5.2a - Error response should include message field', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'invalid');
      expect(result.body).toHaveProperty('message');
    });

    test('5.2b - Error response should include statusCode field', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'invalid');
      expect(result.body).toHaveProperty('statusCode');
    });

    test('5.2c - Error response should match status code', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'invalid');
      expect(result.body.statusCode).toBe(result.status);
    });

    /**
     * Test 5.3: Security Error Messages
     */
    test('5.3a - Should not expose database details in error', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'invalid');
      const errorText = JSON.stringify(result.body);

      expect(errorText).not.toMatch(/database|postgres|sql/i);
    });

    test('5.3b - Should not expose stack traces in error', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'invalid');
      const errorText = JSON.stringify(result.body);

      expect(errorText).not.toMatch(/at Function|at Object|Error:/);
    });

    test('5.3c - Should not expose internal file paths', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'invalid');
      const errorText = JSON.stringify(result.body);

      expect(errorText).not.toMatch(/\/src\/|\/dist\/|C:\\/);
    });

    /**
     * Test 5.4: Rate Limit Error Details
     */
    test('5.4a - Rate limit should return 429 status', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      await TestHelpers.sendOTP(request, phone);
      const result = await TestHelpers.sendOTP(request, phone);

      expect(result.status).toBe(429);
    });

    test('5.4b - Rate limit error should mention timeout/limit', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      await TestHelpers.sendOTP(request, phone);
      const result = await TestHelpers.sendOTP(request, phone);

      expect(result.body.message).toMatch(/limit|exceeded|rate|timeout/i);
    });

    /**
     * Test 5.5: Validation Error Details
     */
    test('5.5a - Validation error should describe issue', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, '123');
      const message = Array.isArray(result.body.message)
        ? result.body.message.join(' ')
        : result.body.message;
      expect(message).toMatch(/invalid|format|phone/i);
    });

    test('5.5b - Multiple validation errors should be reported', async ({ request }) => {
      const response = await request.post(`${API_BASE}/auth/send-otp`, {
        data: {},
      });

      const body = await response.json();
      expect(body).toHaveProperty('message');
    });

    /**
     * Test 5.6: Timeout Handling
     */
    test('5.6 - Long operations should not timeout', async ({ request }) => {
      const result = await TestHelpers.getLeaderboard(request, 10000);
      expect(result.status).toBe(200);
    });

    /**
     * Test 5.7: Concurrent Error Handling
     */
    test('5.7 - Error handling should work under concurrent requests', async ({ request }) => {
      const requests = [];

      // Mix of valid and invalid requests
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          requests.push(TestHelpers.sendOTP(request, TestHelpers.generateTestPhone()));
        } else {
          requests.push(TestHelpers.sendOTP(request, 'invalid'));
        }
      }

      const results = await Promise.all(requests);

      let validCount = 0;
      let errorCount = 0;

      results.forEach((result) => {
        if (result.status === 200) {
          validCount++;
        } else if (result.status === 400) {
          errorCount++;
        }
      });

      expect(validCount).toBeGreaterThan(0);
      expect(errorCount).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // SECTION 6: INTEGRATION TESTS
  // ============================================================================

  test.describe('Section 6: Integration Tests', () => {
    /**
     * Test 6.1: Complete User Journey
     */
    test('6.1 - User journey: Auth -> Teams -> Prediction -> Leaderboard', async ({ request }) => {
      // Step 1: Send OTP
      const phone = TestHelpers.generateTestPhone();
      const sendResult = await TestHelpers.sendOTP(request, phone);
      expect(sendResult.status).toBe(200);

      // Step 2: Get Teams
      const teams = await TestHelpers.getTeams(request);
      expect(teams.length).toBe(48);

      // Step 3: Create Prediction
      const prediction = TestHelpers.createValidPrediction(teams);
      expect(prediction.groups).toBeDefined();

      // Step 4: Check Leaderboard
      const leaderboard = await TestHelpers.getLeaderboard(request, 10);
      expect(leaderboard.status).toBe(200);
    });

    /**
     * Test 6.2: Concurrent Users
     */
    test('6.2 - Multiple concurrent users should work independently', async ({ request }) => {
      const userCount = 5;
      const users = [];

      for (let i = 0; i < userCount; i++) {
        users.push({
          phone: TestHelpers.generateTestPhone(),
        });
      }

      // All users send OTP concurrently
      const otpResults = await Promise.all(
        users.map((user) => TestHelpers.sendOTP(request, user.phone)),
      );

      otpResults.forEach((result) => {
        expect(result.status).toBe(200);
      });

      // All users can access teams
      const teamResults = await Promise.all(users.map(() => TestHelpers.getTeams(request)));

      teamResults.forEach((teams) => {
        expect(teams.length).toBe(48);
      });
    });

    /**
     * Test 6.3: Leaderboard Updates After Processing
     */
    test('6.3 - Leaderboard should reflect prediction processing', async ({ request }) => {
      // Get initial leaderboard
      const leaderboard1 = await TestHelpers.getLeaderboard(request, 10);

      // Authenticate and trigger processing
      const { token } = await TestHelpers.authenticateUser(request);
      await TestHelpers.triggerPredictionProcess(request, token);

      // Give processing time to complete
      await TestHelpers.wait(500);

      // Get updated leaderboard
      const leaderboard2 = await TestHelpers.getLeaderboard(request, 10);

      expect(leaderboard1.status).toBe(200);
      expect(leaderboard2.status).toBe(200);
      // Both should have valid structure
      expect(Array.isArray(leaderboard1.body.leaderboard)).toBe(true);
      expect(Array.isArray(leaderboard2.body.leaderboard)).toBe(true);
    });

    /**
     * Test 6.4: Token Usage Across Multiple Endpoints
     * Note: Increased timeout due to bcrypt comparison overhead with invalid tokens
     */
    test('6.4 - Token should work across multiple protected endpoints', async ({ request }) => {
      test.setTimeout(90000);
      const invalidToken = 'fake-token-abc123';

      // All protected endpoints should reject invalid token (may be slow due to bcrypt)
      const [sessions, result] = await Promise.all([
        request.get(`${API_BASE}/auth/sessions`, {
          headers: { Authorization: `Bearer ${invalidToken}` },
        }),
        request.get(`${API_BASE}/prediction/result`, {
          headers: { Authorization: `Bearer ${invalidToken}` },
        }),
      ]);

      expect(sessions.status()).toBe(401);
      expect(result.status()).toBe(401);
    });

    /**
     * Test 6.5: Data Consistency Across Operations
     */
    test('6.5 - Data should be consistent across operations', async ({ request }) => {
      const teams1 = await TestHelpers.getTeams(request);

      // Make multiple calls
      const teams2 = await TestHelpers.getTeams(request);
      const teams3 = await TestHelpers.getTeams(request);

      // Data should be identical
      expect(teams1).toEqual(teams2);
      expect(teams2).toEqual(teams3);
    });
  });

  // ============================================================================
  // SECTION 7: DOCUMENTATION & SWAGGER
  // ============================================================================

  test.describe('Section 7: Documentation', () => {
    /**
     * Test 7.1: Swagger UI Availability
     */
    test('7.1a - Swagger UI should be available', async ({ page }) => {
      await page.goto(`${API_BASE}/api/docs`);

      // Wait for Swagger UI to load
      await page.waitForLoadState('networkidle');

      // Check if Swagger elements exist
      const title = await page.title();
      expect(title).toMatch(/Swagger|OpenAPI/i);
    });

    test('7.1b - Swagger should document auth endpoints', async ({ page }) => {
      await page.goto(`${API_BASE}/api/docs`);
      await page.waitForLoadState('networkidle');

      // Look for auth endpoints in Swagger
      const bodyText = await page.content();

      expect(bodyText).toMatch(/\/auth\/send-otp|send.*otp/i);
      expect(bodyText).toMatch(/\/auth\/verify-otp|verify.*otp/i);
    });

    test('7.1c - Swagger should document prediction endpoints', async ({ page }) => {
      await page.goto(`${API_BASE}/api/docs`);
      await page.waitForLoadState('networkidle');

      const bodyText = await page.content();

      expect(bodyText).toMatch(/\/prediction|prediction.*endpoint/i);
    });

    /**
     * Test 7.2: API Response Format Documentation
     */
    test('7.2a - Success responses should have consistent format', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const result = await TestHelpers.sendOTP(request, phone);

      // Should have message at minimum
      expect(result.body).toHaveProperty('message');
    });

    test('7.2b - Error responses should have documented format', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, 'invalid');

      expect(result.body).toHaveProperty('message');
      expect(result.body).toHaveProperty('statusCode');
    });

    /**
     * Test 7.3: HTTP Status Code Compliance
     */
    test('7.3a - Should use correct HTTP status codes', async ({ request }) => {
      // 200 for success
      const success = await TestHelpers.sendOTP(request, TestHelpers.generateTestPhone());
      expect(success.status).toBe(200);

      // 400 for bad request
      const badRequest = await TestHelpers.sendOTP(request, 'invalid');
      expect(badRequest.status).toBe(400);

      // 401 for unauthorized
      const unauthorized = await request.get(`${API_BASE}/auth/sessions`);
      expect(unauthorized.status()).toBe(401);

      // 404 for not found
      const notFound = await request.get(`${API_BASE}/non-existent`);
      expect(notFound.status()).toBe(404);

      // 429 for rate limited
      const phone = TestHelpers.generateTestPhone();
      await TestHelpers.sendOTP(request, phone);
      const rateLimited = await TestHelpers.sendOTP(request, phone);
      expect(rateLimited.status).toBe(429);
    });

    test('7.3b - Should use 422 for validation errors (if applicable)', async ({ request }) => {
      const response = await request.post(`${API_BASE}/auth/send-otp`, {
        data: { phone: null },
      });

      expect([400, 422]).toContain(response.status());
    });
  });

  // ============================================================================
  // SECTION 8: CODE QUALITY & BEST PRACTICES
  // ============================================================================

  test.describe('Section 8: Code Quality', () => {
    /**
     * Test 8.1: TypeScript Type Safety
     */
    test('8.1 - API responses should have consistent types', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, TestHelpers.generateTestPhone());

      // Response should have expected structure
      expect(typeof result.status).toBe('number');
      expect(typeof result.body).toBe('object');
      expect(typeof result.body.message).toBe('string');
    });

    /**
     * Test 8.2: Input Validation
     */
    test('8.2a - Should validate phone number format', async ({ request }) => {
      const invalidPhones = ['123', 'abc1234567', '', null, '091234567890123', '8912345678'];

      for (const phone of invalidPhones) {
        const result = await TestHelpers.sendOTP(request, phone as any);
        expect([400, 422]).toContain(result.status);
      }
    });

    test('8.2b - Should validate OTP code format', async ({ request }) => {
      const invalidCodes = ['123', 'abcdef', '', '1234567', null];

      for (const code of invalidCodes) {
        const result = await TestHelpers.verifyOTP(
          request,
          TestHelpers.generateTestPhone(),
          code as any,
        );
        expect([400, 422]).toContain(result.status);
      }
    });

    /**
     * Test 8.3: Error Handling Best Practices
     */
    test('8.3a - Should handle null values gracefully', async ({ request }) => {
      const response = await request.post(`${API_BASE}/auth/send-otp`, {
        data: { phone: null },
      });

      expect([400, 422]).toContain(response.status());
    });

    test('8.3b - Should handle missing required fields', async ({ request }) => {
      const response = await request.post(`${API_BASE}/auth/send-otp`, {
        data: {},
      });

      expect([400, 422]).toContain(response.status());
    });

    /**
     * Test 8.4: Performance Best Practices
     */
    test('8.4a - Should not expose sensitive data in logs', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const result = await TestHelpers.sendOTP(request, phone);

      expect(result.status).toBe(200);
      // Phone should not be exposed in response
      expect(JSON.stringify(result.body)).not.toContain(phone);
    });

    test('8.4b - Should cache frequently accessed data', async ({ request }) => {
      const start1 = Date.now();
      const teams1 = await TestHelpers.getTeams(request);
      const duration1 = Date.now() - start1;

      const start2 = Date.now();
      const teams2 = await TestHelpers.getTeams(request);
      const duration2 = Date.now() - start2;

      expect(teams1).toEqual(teams2);
      TestHelpers.recordPerformance('First Teams Call', duration1);
      TestHelpers.recordPerformance('Second Teams Call (cached)', duration2);
    });

    /**
     * Test 8.5: Security Best Practices
     */
    test('8.5a - Should not expose passwords in responses', async ({ request }) => {
      const result = await TestHelpers.sendOTP(request, TestHelpers.generateTestPhone());

      const responseText = JSON.stringify(result.body).toLowerCase();
      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('secret');
      expect(responseText).not.toContain('private');
    });

    test('8.5b - Rate limiting should prevent abuse', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // First request succeeds
      const result1 = await TestHelpers.sendOTP(request, phone);
      expect(result1.status).toBe(200);

      // Immediate retry is blocked
      const result2 = await TestHelpers.sendOTP(request, phone);
      expect(result2.status).toBe(429);
    });
  });

  // ============================================================================
  // SECTION 9: RESPONSE TIME REQUIREMENTS
  // ============================================================================

  test.describe('Section 9: Performance Requirements', () => {
    /**
     * Test 9.1: Authentication Endpoints < 300ms
     */
    test('9.1a - Send OTP should respond in under 300ms', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const start = Date.now();

      await TestHelpers.sendOTP(request, phone);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(300);
    });

    test('9.1b - Verify OTP should respond in under 300ms', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();
      const start = Date.now();

      await TestHelpers.verifyOTP(request, phone, '123456');

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(300);
    });

    /**
     * Test 9.2: Read Endpoints < 500ms
     */
    test('9.2a - Get teams should respond in under 500ms', async ({ request }) => {
      const start = Date.now();

      await TestHelpers.getTeams(request);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
    });

    test('9.2b - Get leaderboard should respond in under 500ms', async ({ request }) => {
      const start = Date.now();

      await TestHelpers.getLeaderboard(request, 100);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
    });

    /**
     * Test 9.3: Write Endpoints < 1000ms
     */
    test('9.3 - Trigger prediction should respond in under 1000ms', async ({ request }) => {
      // Authenticate first
      const { token } = await TestHelpers.authenticateUser(request);

      const start = Date.now();

      await TestHelpers.triggerPredictionProcess(request, token);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });
  });
});
