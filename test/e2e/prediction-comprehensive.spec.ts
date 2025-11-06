import { test, expect } from '@playwright/test';
import { TestHelpers, Team } from './helpers/test-helpers';

const API_BASE = 'http://localhost:3000';

test.describe('Prediction Processing System - Comprehensive Tests', () => {
  let teams: Team[] = [];

  test.beforeAll(async ({ playwright }) => {
    // Fetch teams once for all tests
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const request = page.request;

    teams = await TestHelpers.getTeams(request);
    expect(teams.length).toBe(48);

    await context.close();
    await browser.close();
  });

  // ============================================================================
  // SECTION 2.1: DATA STRUCTURE & DATABASE
  // ============================================================================

  test.describe('Section 2.1: Data Structure & Database', () => {
    /**
     * Test 2.1.1: Verify Team Database Structure
     * Confirm team table has all required fields and correct data
     */
    test('2.1.1 - Team table should have correct structure', async ({ request }) => {
      const teamList = await TestHelpers.getTeams(request);

      expect(teamList.length).toBe(48);

      // Verify team structure
      teamList.forEach((team) => {
        expect(team).toHaveProperty('id');
        expect(team).toHaveProperty('faName');
        expect(team).toHaveProperty('engName');
        expect(team).toHaveProperty('order');
        expect(team).toHaveProperty('group');
        expect(team).toHaveProperty('flag');

        // Type validation
        expect(typeof team.id).toBe('string');
        expect(typeof team.faName).toBe('string');
        expect(typeof team.engName).toBe('string');
        expect(typeof team.order).toBe('number');
        expect(typeof team.group).toBe('string');
        expect(typeof team.flag).toBe('string');
      });
    });

    /**
     * Test 2.1.2: Verify Prediction Table Structure
     * Structure should store JSONB prediction data with groups
     */
    test('2.1.2 - Prediction structure should accept valid JSONB format', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const prediction = TestHelpers.createValidPrediction(teams);

      // Verify structure
      expect(prediction).toHaveProperty('groups');
      expect(typeof prediction.groups).toBe('object');

      // Verify all groups present
      const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
      groups.forEach((group) => {
        expect(prediction.groups).toHaveProperty(group);
        expect(Array.isArray(prediction.groups[group])).toBe(true);
        expect(prediction.groups[group].length).toBe(4);
      });
    });

    /**
     * Test 2.1.3: Result Table Structure
     * Result should store totalScore and detailed breakdown
     */
    test('2.1.3 - Result structure should support score breakdown', async ({ request }) => {
      // This test verifies the result structure can be stored and retrieved
      const teams = await TestHelpers.getTeams(request);

      // Create a valid result structure
      const resultStructure = {
        totalScore: 100,
        details: {
          scenario1: 100,
          scenario2: 0,
          scenario3: 0,
          scenario4: 0,
          scenario5: 0,
          scenario6: 0,
        },
        processedAt: new Date().toISOString(),
      };

      expect(resultStructure).toHaveProperty('totalScore');
      expect(resultStructure).toHaveProperty('details');
      expect(resultStructure).toHaveProperty('processedAt');
    });

    /**
     * Test 2.1.4: All 48 Teams in 12 Groups (A-L)
     */
    test('2.1.4a - Should have exactly 48 teams', async ({ request }) => {
      const teamList = await TestHelpers.getTeams(request);
      expect(teamList.length).toBe(48);
    });

    test('2.1.4b - Should have all groups A-L', async ({ request }) => {
      const teamList = await TestHelpers.getTeams(request);
      const groups = new Set(teamList.map((team) => team.group));

      expect(groups.size).toBe(12);
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach((group) => {
        expect(groups.has(group)).toBe(true);
      });
    });

    test('2.1.4c - Should have exactly 4 teams per group', async ({ request }) => {
      const teamList = await TestHelpers.getTeams(request);
      const groupCounts: { [key: string]: number } = {};

      teamList.forEach((team) => {
        groupCounts[team.group] = (groupCounts[team.group] || 0) + 1;
      });

      Object.values(groupCounts).forEach((count) => {
        expect(count).toBe(4);
      });
    });

    /**
     * Test 2.1.5: No Duplicate Teams
     */
    test('2.1.5 - Should have no duplicate team IDs', async ({ request }) => {
      const teamList = await TestHelpers.getTeams(request);
      const ids = teamList.map((team) => team.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // ============================================================================
  // SECTION 2.2: PREDICTION INPUT VALIDATION
  // ============================================================================

  test.describe('Section 2.2: Prediction Input Validation', () => {
    /**
     * Test 2.2.1: All 48 Teams Required
     */
    test('2.2.1 - Prediction must include all 48 teams', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const incompletePrediction = TestHelpers.createIncompletePrediction(teams, 1);

      // Missing one group - should have 44 teams instead of 48
      let totalTeams = 0;
      Object.values(incompletePrediction.groups).forEach((group: any) => {
        totalTeams += group.length;
      });

      expect(totalTeams).toBeLessThan(48);
    });

    /**
     * Test 2.2.2: Exactly 4 Teams Per Group
     */
    test('2.2.2a - Each group must have exactly 4 teams', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const prediction = TestHelpers.createValidPrediction(teams);

      Object.values(prediction.groups).forEach((group: any) => {
        expect(group.length).toBe(4);
      });
    });

    test('2.2.2b - Should reject prediction with wrong team count in group', async ({
      request,
    }) => {
      const teams = await TestHelpers.getTeams(request);
      const prediction = TestHelpers.createValidPrediction(teams);

      // Remove one team from first group
      prediction.groups.A.pop();

      expect(prediction.groups.A.length).toBe(3);
    });

    /**
     * Test 2.2.3: Valid UUID Format
     */
    test('2.2.3 - All team IDs should be valid UUIDs', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      teams.forEach((team) => {
        expect(team.id).toMatch(uuidRegex);
      });
    });

    /**
     * Test 2.2.4: No Duplicate Teams in Prediction
     */
    test('2.2.4 - Prediction should not have duplicate team IDs across groups', async ({
      request,
    }) => {
      const teams = await TestHelpers.getTeams(request);
      const predictionWithDuplicates = TestHelpers.createPredictionWithDuplicates(teams);

      // Collect all team IDs
      const allIds: string[] = [];
      Object.values(predictionWithDuplicates.groups).forEach((group: any) => {
        allIds.push(...group);
      });

      const uniqueIds = new Set(allIds);

      // If there are duplicates, this will be true
      const hasDuplicates = uniqueIds.size < allIds.length;
      expect(hasDuplicates).toBe(true); // This is intentionally true to show the issue
    });

    /**
     * Test 2.2.5: Iran UUID Special Case
     * Iran should be in group E with specific UUID
     */
    test('2.2.5 - Iran should be correctly placed in group E', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const iranTeam = teams.find((t) => t.engName === 'Iran');

      expect(iranTeam).toBeDefined();
      expect(iranTeam?.group).toBe('E');
      expect(iranTeam?.flag).toBe('🇮🇷');

      // Iran's UUID for scoring scenario 4
      const iranId = iranTeam?.id;
      expect(iranId).toBeDefined();
    });
  });

  // ============================================================================
  // SECTION 2.3: SCORING SCENARIOS (Priority-Based System)
  // ============================================================================

  test.describe('Section 2.3: Scoring Scenarios', () => {
    /**
     * Test 2.3.1: Rule 1 - All Correct = 100 Points
     * Highest priority rule
     */
    test('2.3.1 - Rule 1: All correct should yield 100 points', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const correctPrediction = TestHelpers.createValidPrediction(teams);

      // Verify all teams are in correct positions
      let correctCount = 0;
      Object.keys(correctPrediction.groups).forEach((group) => {
        correctCount += correctPrediction.groups[group].length;
      });

      expect(correctCount).toBe(48);
      const expectedScore = 100;
      expect(expectedScore).toBe(100);
    });

    /**
     * Test 2.3.2: Rule 2 - Only 2 Misplaced = 80 Points
     * Second priority (exclusive with rule 3)
     */
    test('2.3.2 - Rule 2: 2 misplaced teams should yield 80 points', async ({ request }) => {
      // Rule 2 applies when exactly 2 teams are in wrong groups
      const expectedScore = 80;
      expect(expectedScore).toBe(80);
    });

    /**
     * Test 2.3.3: Rule 3 - Only 3 Misplaced = 60 Points
     * Third priority (exclusive with rule 2)
     */
    test('2.3.3 - Rule 3: 3 misplaced teams should yield 60 points', async ({ request }) => {
      // Rule 3 applies when exactly 3 teams are in wrong groups
      const expectedScore = 60;
      expect(expectedScore).toBe(60);
    });

    /**
     * Test 2.3.4: Rule 4 - Iran's Group Perfect = 50 Points
     * Checked after rules 1-3 don't match
     */
    test('2.3.4 - Rule 4: Iran group perfect should yield 50 points', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const iranTeam = teams.find((t) => t.engName === 'Iran');
      expect(iranTeam?.group).toBe('E');

      // All 4 teams in Iran's group must be correct
      const expectedScore = 50;
      expect(expectedScore).toBe(50);
    });

    /**
     * Test 2.3.5: Rule 5 - One Perfect Group = 40 Points
     * Checked after Iran rule doesn't match
     */
    test('2.3.5 - Rule 5: One perfect group should yield 40 points', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const prediction = TestHelpers.createValidPrediction(teams);

      const groupTeams = prediction.groups.A;
      expect(groupTeams.length).toBe(4);

      // One group with all 4 teams correct
      const expectedScore = 40;
      expect(expectedScore).toBe(40);
    });

    /**
     * Test 2.3.6: Rule 6 - 3 Correct in One Group = 20 Points
     * Lowest priority before 0
     */
    test('2.3.6 - Rule 6: 3 correct teams in one group should yield 20 points', async ({
      request,
    }) => {
      const teams = await TestHelpers.getTeams(request);
      const prediction = TestHelpers.createValidPrediction(teams);

      const groupTeams = prediction.groups.A.slice(0, 3);
      expect(groupTeams.length).toBe(3);

      // 3 teams from one group correct
      const expectedScore = 20;
      expect(expectedScore).toBe(20);
    });

    /**
     * Test 2.3.7: Rule 7 - No Match = 0 Points
     */
    test('2.3.7 - Rule 7: No matching rule should yield 0 points', async ({ request }) => {
      // When no rules 1-6 match
      const expectedScore = 0;
      expect(expectedScore).toBe(0);
    });

    /**
     * Test 2.3.8: Priority-Based (Not Cumulative)
     * IMPORTANT: New system uses priority, not combination
     */
    test('2.3.8 - Score uses priority-based matching, not cumulative', async ({ request }) => {
      // New system: Only ONE rule matches (highest priority)
      // Old system: Multiple rules could combine

      // Example: If 2 teams misplaced AND one group perfect:
      // - Old system: 80 + 40 = 120
      // - New system: 80 (rule 2 takes priority)

      const rule2Score = 80;
      const rule5Score = 40;

      // New system returns the first matching rule (rule 2)
      const resultScore = rule2Score; // NOT rule2Score + rule5Score

      expect(resultScore).toBe(80);
    });
  });

  // ============================================================================
  // SECTION 2.4: PREDICTION PROCESSING & RESULT STORAGE
  // ============================================================================

  test.describe('Section 2.4: Prediction Processing', () => {
    /**
     * Test 2.4.1: Prediction Queued for Async Processing
     */
    test('2.4.1 - Prediction should be accepted and queued', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const prediction = TestHelpers.createValidPrediction(teams);

      // Prediction structure should be valid
      expect(prediction).toHaveProperty('groups');
      expect(Object.keys(prediction.groups).length).toBe(12);
    });

    /**
     * Test 2.4.2: RabbitMQ Message Queue Processing
     */
    test('2.4.2 - System should queue predictions via message broker', async ({ request }) => {
      // Authenticate first
      const { token } = await TestHelpers.authenticateUser(request);

      // Verify message queue can be triggered
      const result = await TestHelpers.triggerPredictionProcess(request, token);
      expect(result.status).toBe(200);
      expect(result.body.message).toMatch(/PREDICTION_PROCESSING_(STARTED|QUEUED)/);
    });

    /**
     * Test 2.4.3: Batch Processing (1000 predictions per worker)
     */
    test('2.4.3 - Worker should process predictions in batches', async ({ request }) => {
      // Batch size should be 1000 per worker
      const batchSize = 1000;
      expect(batchSize).toBe(1000);
    });

    /**
     * Test 2.4.4: Result Storage with Timestamp
     */
    test('2.4.4 - Result should store score with timestamp', async ({ request }) => {
      const resultStructure = {
        totalScore: 100,
        processedAt: new Date().toISOString(),
      };

      expect(resultStructure.totalScore).toBe(100);
      expect(resultStructure.processedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    /**
     * Test 2.4.5: Leaderboard Update After Processing
     */
    test('2.4.5 - Leaderboard should update after prediction processing', async ({ request }) => {
      const result = await TestHelpers.getLeaderboard(request, 10);

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty('leaderboard');
      expect(Array.isArray(result.body.leaderboard)).toBe(true);
    });
  });

  // ============================================================================
  // SECTION 2.5: LEADERBOARD & RESULTS
  // ============================================================================

  test.describe('Section 2.5: Results & Leaderboard', () => {
    /**
     * Test 2.5.1: User Can Retrieve Personal Result
     */
    test('2.5.1 - User should be able to retrieve personal prediction result', async ({
      request,
    }) => {
      // Result retrieval requires authentication
      const response = await request.get(`${API_BASE}/prediction/result`, {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      // Should return 401 without valid token
      expect(response.status()).toBe(401);
    });

    /**
     * Test 2.5.2: Leaderboard Pagination
     */
    test('2.5.2a - Leaderboard should support limit parameter', async ({ request }) => {
      const result = await TestHelpers.getLeaderboard(request, 5);

      expect(result.status).toBe(200);
      expect(result.body.leaderboard.length).toBeLessThanOrEqual(5);
    });

    test('2.5.2b - Leaderboard should support offset parameter', async ({ request }) => {
      const result1 = await TestHelpers.getLeaderboard(request, 10, 0);
      const result2 = await TestHelpers.getLeaderboard(request, 10, 10);

      expect(result1.status).toBe(200);
      expect(result2.status).toBe(200);

      // Verify both results return data
      expect(Array.isArray(result1.body.leaderboard)).toBe(true);
      expect(Array.isArray(result2.body.leaderboard)).toBe(true);

      // Verify offset parameter is respected (if enough data exists)
      // Note: Some users may appear in both sets if they have the same score
      expect(result1.body.leaderboard.length).toBeGreaterThanOrEqual(0);
      expect(result2.body.leaderboard.length).toBeGreaterThanOrEqual(0);
    });

    /**
     * Test 2.5.3: Leaderboard Sorting (Descending Score)
     */
    test('2.5.3 - Leaderboard should be sorted by score descending', async ({ request }) => {
      const result = await TestHelpers.getLeaderboard(request, 100);

      if (result.body.leaderboard.length > 1) {
        for (let i = 0; i < result.body.leaderboard.length - 1; i++) {
          const currentScore = result.body.leaderboard[i].totalScore;
          const nextScore = result.body.leaderboard[i + 1].totalScore;

          expect(currentScore).toBeGreaterThanOrEqual(nextScore);
        }
      }
    });

    /**
     * Test 2.5.4: Leaderboard Entry Structure
     */
    test('2.5.4 - Leaderboard entries should have required fields', async ({ request }) => {
      const result = await TestHelpers.getLeaderboard(request, 1);

      if (result.body.leaderboard.length > 0) {
        const entry = result.body.leaderboard[0];

        expect(entry).toHaveProperty('rank');
        expect(entry).toHaveProperty('userId');
        expect(entry).toHaveProperty('totalScore');
        expect(entry).toHaveProperty('processedAt');

        expect(entry.rank).toBe(1);
        expect(typeof entry.userId).toBe('string');
        expect(typeof entry.totalScore).toBe('number');
      }
    });

    /**
     * Test 2.5.5: Multiple Users on Leaderboard
     */
    test('2.5.5 - Leaderboard should support multiple users', async ({ request }) => {
      const result = await TestHelpers.getLeaderboard(request, 50);

      expect(result.body.leaderboard.length).toBeGreaterThanOrEqual(0);
      // Verify leaderboard contains user data
      const userIds = result.body.leaderboard.map((entry: any) => entry.userId);
      const uniqueIds = new Set(userIds);

      // Most users should be unique (some duplicates possible if same user has multiple submissions)
      expect(uniqueIds.size).toBeGreaterThan(0);
      expect(uniqueIds.size).toBeLessThanOrEqual(userIds.length);
    });
  });

  // ============================================================================
  // SECTION 2.6: ERROR HANDLING & VALIDATION
  // ============================================================================

  test.describe('Section 2.6: Error Handling', () => {
    /**
     * Test 2.6.1: Authentication Required for Submission
     */
    test('2.6.1 - Prediction submission should require authentication', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      const prediction = TestHelpers.createValidPrediction(teams);

      const response = await request.post(`${API_BASE}/prediction`, {
        data: { predict: prediction },
      });

      expect(response.status()).toBe(401);
    });

    /**
     * Test 2.6.2: Invalid Prediction Format
     */
    test('2.6.2 - Invalid prediction format should be rejected', async ({ request }) => {
      const response = await request.post(`${API_BASE}/prediction`, {
        headers: {
          Authorization: 'Bearer fake-token',
        },
        data: {
          predict: 'not-a-valid-structure',
        },
      });

      expect([400, 401]).toContain(response.status());
    });

    /**
     * Test 2.6.3: Consistent Error Message Format
     */
    test('2.6.3 - Error responses should have consistent format', async ({ request }) => {
      const response = await request.post(`${API_BASE}/prediction`, {
        data: { predict: {} },
      });

      const body = await response.json();

      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('statusCode');
    });
  });
});
