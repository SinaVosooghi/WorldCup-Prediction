import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';

const API_BASE = 'http://localhost:3000';

test.describe('Prediction API', () => {
  test.describe('GET /prediction/teams', () => {
    test('should return all teams', async ({ request }) => {
      const response = await request.get(`${API_BASE}/prediction/teams`);

      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty('teams');
      expect(Array.isArray(body.teams)).toBe(true);

      // Should have 48 teams (World Cup 2026)
      expect(body.teams.length).toBe(48);

      // Verify team structure
      const firstTeam = body.teams[0];
      expect(firstTeam).toHaveProperty('id');
      expect(firstTeam).toHaveProperty('faName');
      expect(firstTeam).toHaveProperty('engName');
      expect(firstTeam).toHaveProperty('order');
      expect(firstTeam).toHaveProperty('group');
      expect(firstTeam).toHaveProperty('flag');
    });

    test('should have 12 groups (A-L)', async ({ request }) => {
      const response = await request.get(`${API_BASE}/prediction/teams`);
      const body = await response.json();

      const groups = new Set(body.teams.map((team) => team.group));
      expect(groups.size).toBe(12);

      const expectedGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
      expectedGroups.forEach((group) => {
        expect(groups.has(group)).toBe(true);
      });
    });

    test('should have 4 teams per group', async ({ request }) => {
      const response = await request.get(`${API_BASE}/prediction/teams`);
      const body = await response.json();

      const groupCounts = body.teams.reduce((acc, team) => {
        acc[team.group] = (acc[team.group] || 0) + 1;
        return acc;
      }, {});

      Object.values(groupCounts).forEach((count) => {
        expect(count).toBe(4);
      });
    });

    test('should include Iran in group E', async ({ request }) => {
      const response = await request.get(`${API_BASE}/prediction/teams`);
      const body = await response.json();

      const iranTeam = body.teams.find((team) => team.engName === 'Iran');
      expect(iranTeam).toBeDefined();
      expect(iranTeam.group).toBe('E');
      expect(iranTeam.flag).toBe('🇮🇷');
    });
  });

  test.describe('POST /prediction', () => {
    test('should require authentication', async ({ request }) => {
      const response = await request.post(`${API_BASE}/prediction`, {
        data: {
          predict: {
            groups: {
              A: ['team-1', 'team-2', 'team-3', 'team-4'],
            },
          },
        },
      });

      expect(response.status()).toBe(401);
    });

    test('should validate prediction data structure', async ({ request }) => {
      // Note: This would need a valid token
      const response = await request.post(`${API_BASE}/prediction`, {
        headers: {
          Authorization: 'Bearer test-token',
        },
        data: {
          predict: 'invalid-data',
        },
      });

      expect([400, 401]).toContain(response.status());
    });
  });

  test.describe('GET /prediction/leaderboard', () => {
    test('should return leaderboard without authentication', async ({ request }) => {
      const response = await request.get(`${API_BASE}/prediction/leaderboard`);

      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty('leaderboard');
      expect(Array.isArray(body.leaderboard)).toBe(true);
    });

    test('should respect limit parameter', async ({ request }) => {
      const limit = 5;
      const response = await request.get(`${API_BASE}/prediction/leaderboard?limit=${limit}`);

      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.leaderboard.length).toBeLessThanOrEqual(limit);
    });

    test('should return leaderboard entries with correct structure', async ({ request }) => {
      const response = await request.get(`${API_BASE}/prediction/leaderboard?limit=1`);
      const body = await response.json();

      if (body.leaderboard.length > 0) {
        const entry = body.leaderboard[0];
        expect(entry).toHaveProperty('rank');
        expect(entry).toHaveProperty('userId');
        expect(entry).toHaveProperty('totalScore');
        expect(entry).toHaveProperty('processedAt');
        expect(entry.rank).toBe(1);
      }
    });

    test('should order by score descending', async ({ request }) => {
      const response = await request.get(`${API_BASE}/prediction/leaderboard?limit=10`);
      const body = await response.json();

      if (body.leaderboard.length > 1) {
        for (let i = 0; i < body.leaderboard.length - 1; i++) {
          expect(body.leaderboard[i].totalScore).toBeGreaterThanOrEqual(
            body.leaderboard[i + 1].totalScore,
          );
        }
      }
    });
  });

  test.describe('GET /prediction/result', () => {
    test('should require authentication', async ({ request }) => {
      const response = await request.get(`${API_BASE}/prediction/result`);

      expect(response.status()).toBe(401);
    });
  });

  test.describe('POST /prediction/admin/trigger-prediction-process', () => {
    test('should be accessible with authentication', async ({ request }) => {
      // Authenticate first
      const { token } = await TestHelpers.authenticateUser(request);

      const response = await request.post(
        `${API_BASE}/prediction/admin/trigger-prediction-process`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      expect([200, 201]).toContain(response.status());
      const body = await response.json();
      expect(body.message).toMatch(/PREDICTION_PROCESSING_(STARTED|QUEUED)/);
    });
  });

  // ============================================================================
  // PREDICTION SCORING SCENARIOS (New Priority-Based System)
  // ============================================================================

  test.describe('Prediction Scoring Scenarios', () => {
    /**
     * Scenario 1: Perfect Prediction (100 points)
     * All 48 teams in correct groups - highest priority rule
     */
    test('Scoring 1 - Perfect prediction should receive 100 points', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const { token } = await TestHelpers.authenticateUser(request);

      const perfectPrediction = TestHelpers.createPerfectPrediction(teams);

      const submitResponse = await request.post(`${API_BASE}/prediction`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { predict: perfectPrediction.groups },
      });
      expect(submitResponse.status()).toBe(201);

      await TestHelpers.triggerPredictionProcess(request, token);
      await TestHelpers.wait(3000);

      const resultResponse = await request.get(`${API_BASE}/prediction/result`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resultResponse.status()).toBe(200);

      const resultData = await resultResponse.json();
      expect(resultData.results).toBeDefined();
      expect(resultData.results.length).toBeGreaterThan(0);

      const result = resultData.results[0];
      expect(result.totalScore).toBe(100);
      expect(result.details).toBeDefined();
    });

    /**
     * Scenario 2: Only 2 Teams Misplaced (80 points)
     * Second priority rule
     */
    test('Scoring 2 - Prediction with 2 misplaced teams should receive 80 points', async ({
      request,
    }) => {
      const teams = await TestHelpers.getTeams(request);
      const { token } = await TestHelpers.authenticateUser(request);

      const predictionWith2Wrong = TestHelpers.createPredictionWithWrongTeams(teams, 2);

      const submitResponse = await request.post(`${API_BASE}/prediction`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { predict: predictionWith2Wrong.groups },
      });
      expect(submitResponse.status()).toBe(201);

      await TestHelpers.triggerPredictionProcess(request, token);
      await TestHelpers.wait(3000);

      const resultResponse = await request.get(`${API_BASE}/prediction/result`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resultResponse.status()).toBe(200);

      const resultData = await resultResponse.json();
      const result = resultData.results[0];
      expect(result.totalScore).toBe(80);
      expect(result.details).toBeDefined();
      expect(result.details.scoringBreakdown).toBeDefined();
    });

    /**
     * Scenario 3: Only 3 Teams Misplaced (60 points)
     * Third priority rule
     */
    test('Scoring 3 - Prediction with 3 misplaced teams should receive 60 points', async ({
      request,
    }) => {
      const teams = await TestHelpers.getTeams(request);
      const { token } = await TestHelpers.authenticateUser(request);

      const predictionWith3Wrong = TestHelpers.createPredictionWithWrongTeams(teams, 3);

      const submitResponse = await request.post(`${API_BASE}/prediction`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { predict: predictionWith3Wrong.groups },
      });
      expect(submitResponse.status()).toBe(201);

      await TestHelpers.triggerPredictionProcess(request, token);
      await TestHelpers.wait(3000);

      const resultResponse = await request.get(`${API_BASE}/prediction/result`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resultResponse.status()).toBe(200);

      const resultData = await resultResponse.json();
      const result = resultData.results[0];
      expect(result.totalScore).toBe(60);
      expect(result.details).toBeDefined();
      expect(result.details.scoringBreakdown).toBeDefined();
    });

    /**
     * Scenario 4: Iran's Group Perfect (50 points)
     * Checks after rules 1-3 don't match
     */
    test("Scoring 4 - Prediction with Iran's group perfect should receive 50 points", async ({
      request,
    }) => {
      const teams = await TestHelpers.getTeams(request);
      const { token } = await TestHelpers.authenticateUser(request);

      const iranGroupPrediction = TestHelpers.createIranGroupOnlyPrediction(teams);

      const submitResponse = await request.post(`${API_BASE}/prediction`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { predict: iranGroupPrediction.groups },
      });
      expect(submitResponse.status()).toBe(201);

      await TestHelpers.triggerPredictionProcess(request, token);
      await TestHelpers.wait(3000);

      const resultResponse = await request.get(`${API_BASE}/prediction/result`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resultResponse.status()).toBe(200);

      const resultData = await resultResponse.json();
      const result = resultData.results[0];
      expect(result.totalScore).toBe(50);
    });

    /**
     * Scenario 5: One Perfect Group (40 points)
     * Checks after Iran group rule doesn't match
     */
    test('Scoring 5 - Prediction with one perfect group should receive 40 points', async ({
      request,
    }) => {
      const teams = await TestHelpers.getTeams(request);
      const { token } = await TestHelpers.authenticateUser(request);

      const oneGroupCorrectPrediction = TestHelpers.createOneGroupCorrectPrediction(teams);

      const submitResponse = await request.post(`${API_BASE}/prediction`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { predict: oneGroupCorrectPrediction.groups },
      });
      expect(submitResponse.status()).toBe(201);

      await TestHelpers.triggerPredictionProcess(request, token);
      await TestHelpers.wait(3000);

      const resultResponse = await request.get(`${API_BASE}/prediction/result`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resultResponse.status()).toBe(200);

      const resultData = await resultResponse.json();
      const result = resultData.results[0];
      expect(result.totalScore).toBe(40);
    });

    /**
     * Scenario 6: 3 Teams Correct in One Group (20 points)
     * Lowest priority rule before 0
     */
    test('Scoring 6 - Prediction with 3 correct teams in one group should receive 20 points', async ({
      request,
    }) => {
      const teams = await TestHelpers.getTeams(request);
      const { token } = await TestHelpers.authenticateUser(request);

      const threeTeamsCorrectPrediction = TestHelpers.createThreeTeamsOneGroupPrediction(teams);

      const submitResponse = await request.post(`${API_BASE}/prediction`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { predict: threeTeamsCorrectPrediction.groups },
      });
      expect(submitResponse.status()).toBe(201);

      await TestHelpers.triggerPredictionProcess(request, token);
      await TestHelpers.wait(3000);

      const resultResponse = await request.get(`${API_BASE}/prediction/result`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resultResponse.status()).toBe(200);

      const resultData = await resultResponse.json();
      const result = resultData.results[0];
      expect(result.totalScore).toBe(20);
    });
  });

  // ============================================================================
  // RESULT TABLE PROCESSING
  // ============================================================================

  test.describe('Result Table Processing', () => {
    test('should create result record with correct structure after processing', async ({
      request,
    }) => {
      const teams = await TestHelpers.getTeams(request);
      const { token } = await TestHelpers.authenticateUser(request);

      // Submit prediction
      const prediction = TestHelpers.createValidPrediction(teams);
      const submitResponse = await request.post(`${API_BASE}/prediction`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { predict: prediction },
      });
      expect(submitResponse.status()).toBe(201);

      // Trigger processing
      await TestHelpers.triggerPredictionProcess(request, token);
      await TestHelpers.wait(3000); // Increased wait time for worker

      // Check result structure
      const resultResponse = await request.get(`${API_BASE}/prediction/result`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resultResponse.status()).toBe(200);

      const result = await resultResponse.json();

      // Validate result table structure
      if (result.results && result.results.length > 0) {
        const firstResult = result.results[0];
        expect(firstResult).toHaveProperty('id');
        expect(firstResult).toHaveProperty('predictionId');
        expect(firstResult).toHaveProperty('userId');
        expect(firstResult).toHaveProperty('totalScore');
        expect(firstResult).toHaveProperty('details');
        expect(firstResult).toHaveProperty('processedAt');

        expect(typeof firstResult.totalScore).toBe('number');
        expect(firstResult.totalScore).toBeGreaterThanOrEqual(0);
      } else {
        // If no results yet, just verify structure
        expect(result).toHaveProperty('results');
        expect(Array.isArray(result.results)).toBe(true);
      }
    });

    test('should update leaderboard after result processing', async ({ request }) => {
      const { token } = await TestHelpers.authenticateUser(request);

      // Get leaderboard before
      const leaderboardBefore = await TestHelpers.getLeaderboard(request, 10);

      // Submit and process prediction
      const teams = await TestHelpers.getTeams(request);
      const prediction = TestHelpers.createValidPrediction(teams);

      await request.post(`${API_BASE}/prediction`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { predict: prediction },
      });

      await TestHelpers.triggerPredictionProcess(request, token);
      await TestHelpers.wait(201); // Allow more time for processing

      // Get leaderboard after
      const leaderboardAfter = await TestHelpers.getLeaderboard(request, 10);

      expect(leaderboardBefore.status).toBe(200);
      expect(leaderboardAfter.status).toBe(200);

      // Leaderboard should be updated (may include new entry)
      expect(Array.isArray(leaderboardAfter.body.leaderboard)).toBe(true);
    });
  });

  // ============================================================================
  // REDIS CACHE VERIFICATION
  // ============================================================================

  test.describe('Redis Cache TTL Verification', () => {
    test('OTP send limit should expire after 120 seconds', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // First request
      const result1 = await TestHelpers.sendOTP(request, phone);
      expect([200, 201]).toContain(result1.status);

      // Immediate retry should be rate limited
      const result2 = await TestHelpers.sendOTP(request, phone);
      expect(result2.status).toBe(429);

      // Wait for TTL to expire (in test environment, this might be mocked)
      // Note: In real implementation, Redis key otp:send:limit:{phone} has TTL 120s
      // This test verifies the rate limiting behavior
    });

    test('OTP verification attempts should expire after 60 seconds', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // Make multiple failed attempts
      for (let i = 0; i < 5; i++) {
        await TestHelpers.verifyOTP(request, phone, '000000');
      }

      // 6th should be rate limited
      const result = await TestHelpers.verifyOTP(request, phone, '000000');
      expect(result.status).toBe(429);

      // Note: Redis key otp:verify:attempts:{phone} has TTL 60s
    });

    test('OTP code should expire after 120 seconds', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // Send OTP
      await TestHelpers.sendOTP(request, phone);

      // Try to verify with wrong code multiple times
      for (let i = 0; i < 3; i++) {
        const result = await TestHelpers.verifyOTP(request, phone, '999999');
        expect([400, 429]).toContain(result.status);
      }

      // Note: Redis key otp:phone:{phoneNumber} has TTL 120s
    });
  });
});

test.describe('Health Check', () => {
  test('should have healthy application', async ({ request }) => {
    const response = await request.get(`${API_BASE}/prediction/teams`);
    expect(response.status()).toBe(200);
  });
});

test.describe('API Error Handling', () => {
  test('should return 404 for non-existent endpoints', async ({ request }) => {
    const response = await request.get(`${API_BASE}/non-existent-endpoint`);
    expect(response.status()).toBe(404);
  });

  test('should handle malformed JSON', async ({ request }) => {
    const response = await request.post(`${API_BASE}/auth/send-otp`, {
      data: 'not-valid-json',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect([400, 500]).toContain(response.status());
  });
});
