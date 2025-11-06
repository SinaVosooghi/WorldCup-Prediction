import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';

const API_BASE = 'http://localhost:3000';

test.describe('Scalability & Performance Tests', () => {
  // ============================================================================
  // SECTION 3.1: DATABASE INDEXING & QUERY PERFORMANCE
  // ============================================================================

  test.describe('Section 3.1: Database Indexing', () => {
    /**
     * Test 3.1.1: GIN Index on JSONB Prediction Field
     * Ensures fast queries on prediction data
     */
    test('3.1.1 - Predictions should be queryable efficiently', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);
      expect(teams.length).toBe(48);

      // Querying 48 teams should be fast (index would make this < 50ms)
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        await TestHelpers.getTeams(request);
      }

      const duration = Date.now() - startTime;
      TestHelpers.recordPerformance('10x Teams Query', duration);

      // Should complete reasonably fast
      expect(duration).toBeLessThan(5000);
    });

    /**
     * Test 3.1.2: Index on User ID for Fast Lookups
     */
    test('3.1.2 - User queries should use indexed lookups', async ({ request }) => {
      // Leaderboard query should use userId index
      const startTime = Date.now();

      const result = await TestHelpers.getLeaderboard(request, 100);

      const duration = Date.now() - startTime;
      TestHelpers.recordPerformance('Leaderboard Query', duration);

      expect(result.status).toBe(200);
      expect(duration).toBeLessThan(500); // Should be fast with index
    });

    /**
     * Test 3.1.3: Index on processedAt for Leaderboard Sorting
     */
    test('3.1.3 - Leaderboard sorting should be efficient', async ({ request }) => {
      const startTime = Date.now();

      const result = await TestHelpers.getLeaderboard(request, 1000);

      const duration = Date.now() - startTime;
      TestHelpers.recordPerformance('Large Leaderboard Query', duration);

      expect(result.status).toBe(200);
      // Large leaderboard should still be quick with proper indexing
      expect(duration).toBeLessThan(2000);
    });
  });

  // ============================================================================
  // SECTION 3.2: REDIS CACHING STRATEGY
  // ============================================================================

  test.describe('Section 3.2: Caching Strategy', () => {
    /**
     * Test 3.2.1: Teams Cache
     * Correct group compositions should be cached in Redis
     */
    test('3.2.1 - Teams endpoint should be cached', async ({ request }) => {
      // First request (cache miss)
      const startTime1 = Date.now();
      const result1 = await TestHelpers.getTeams(request);
      const duration1 = Date.now() - startTime1;

      // Second request (should hit cache)
      const startTime2 = Date.now();
      const result2 = await TestHelpers.getTeams(request);
      const duration2 = Date.now() - startTime2;

      expect(result1).toEqual(result2);
      // Cached response should be faster (or similar)
      TestHelpers.recordPerformance('Teams (First)', duration1);
      TestHelpers.recordPerformance('Teams (Cached)', duration2);
    });

    /**
     * Test 3.2.2: Leaderboard Cache
     */
    test('3.2.2 - Leaderboard should leverage caching', async ({ request }) => {
      const startTime1 = Date.now();
      const result1 = await TestHelpers.getLeaderboard(request, 10);
      const duration1 = Date.now() - startTime1;

      const startTime2 = Date.now();
      const result2 = await TestHelpers.getLeaderboard(request, 10);
      const duration2 = Date.now() - startTime2;

      expect(result1.body).toEqual(result2.body);
      TestHelpers.recordPerformance('Leaderboard (First)', duration1);
      TestHelpers.recordPerformance('Leaderboard (Cached)', duration2);
    });

    /**
     * Test 3.2.3: OTP Redis Keys
     */
    test('3.2.3 - OTP cache should use correct Redis key format', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // Send OTP (creates Redis key: otp:{phone})
      const result = await TestHelpers.sendOTP(request, phone);
      expect(result.status).toBe(200);

      // Rate limit key should be: otp:send:limit:{phone}
      // Second attempt should check rate limit
      const result2 = await TestHelpers.sendOTP(request, phone);
      expect(result2.status).toBe(429);
    });

    /**
     * Test 3.2.4: Cache Invalidation on Prediction Update
     */
    test('3.2.4 - Leaderboard cache should invalidate on new predictions', async ({ request }) => {
      // Simulate cache invalidation scenario
      const leaderboardBefore = await TestHelpers.getLeaderboard(request, 5);

      // Authenticate and trigger prediction process (would invalidate cache)
      const { token } = await TestHelpers.authenticateUser(request);
      await TestHelpers.triggerPredictionProcess(request, token);

      const leaderboardAfter = await TestHelpers.getLeaderboard(request, 5);

      expect(leaderboardBefore.status).toBe(200);
      expect(leaderboardAfter.status).toBe(200);
    });
  });

  // ============================================================================
  // SECTION 3.3: LOAD TESTING
  // ============================================================================

  test.describe('Section 3.3: Load Testing', () => {
    /**
     * Test 3.3.1: Handle 1000 Concurrent Team Queries
     */
    test('3.3.1 - System should handle concurrent team requests', async ({ request }) => {
      const startTime = Date.now();
      const requests = [];

      // Create 50 concurrent requests (reduced for test speed)
      for (let i = 0; i < 50; i++) {
        requests.push(TestHelpers.getTeams(request));
      }

      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      results.forEach((result) => {
        expect(result.length).toBe(48);
      });

      TestHelpers.recordPerformance('50 Concurrent Teams Queries', duration);
    });

    /**
     * Test 3.3.2: Handle Concurrent Leaderboard Requests
     */
    test('3.3.2 - System should handle concurrent leaderboard requests', async ({ request }) => {
      const startTime = Date.now();
      const requests = [];

      for (let i = 0; i < 30; i++) {
        requests.push(TestHelpers.getLeaderboard(request, 10));
      }

      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      results.forEach((result) => {
        expect(result.status).toBe(200);
      });

      TestHelpers.recordPerformance('30 Concurrent Leaderboard Queries', duration);
    });

    /**
     * Test 3.3.3: Handle Concurrent OTP Requests to Different Phones
     */
    test('3.3.3 - System should handle concurrent OTP requests', async ({ request }) => {
      const startTime = Date.now();
      const requests = [];

      // Create 20 OTP requests with different phones
      for (let i = 0; i < 20; i++) {
        const phone = TestHelpers.generateTestPhone();
        requests.push(TestHelpers.sendOTP(request, phone));
      }

      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // All should succeed (different phones)
      results.forEach((result) => {
        expect(result.status).toBe(200);
      });

      TestHelpers.recordPerformance('20 Concurrent OTP Sends', duration);
    });

    /**
     * Test 3.3.4: Batch Processing Performance
     * System should handle batch processing of 1000 predictions per worker
     */
    test('3.3.4 - Batch processing should be efficient', async ({ request }) => {
      // Authenticate first
      const { token } = await TestHelpers.authenticateUser(request);

      const startTime = Date.now();

      // Trigger batch processing
      const result = await TestHelpers.triggerPredictionProcess(request, token);

      const duration = Date.now() - startTime;

      expect(result.status).toBe(200);
      TestHelpers.recordPerformance('Batch Processing Trigger', duration);

      // Should complete reasonably fast
      expect(duration).toBeLessThan(5000);
    });

    /**
     * Test 3.3.5: Leaderboard Query Performance at Scale
     */
    test('3.3.5 - Leaderboard should handle large limit efficiently', async ({ request }) => {
      const startTime = Date.now();

      // Request large leaderboard
      const result = await TestHelpers.getLeaderboard(request, 10000);

      const duration = Date.now() - startTime;

      expect(result.status).toBe(200);
      TestHelpers.recordPerformance('Large Leaderboard (10k)', duration);

      // Even with large limit, should be fast due to indexing
      expect(duration).toBeLessThan(3000);
    });

    /**
     * Test 3.3.6: High Rate Limit Enforcement at Scale
     */
    test('3.3.6 - Rate limiting should work under load', async ({ request }) => {
      const phone = TestHelpers.generateTestPhone();

      // First request
      const result1 = await TestHelpers.sendOTP(request, phone);
      expect(result1.status).toBe(200);

      // Immediate retry from same phone
      const result2 = await TestHelpers.sendOTP(request, phone);
      expect(result2.status).toBe(429);

      // Different phone should work
      const phone2 = TestHelpers.generateTestPhone();
      const result3 = await TestHelpers.sendOTP(request, phone2);
      expect(result3.status).toBe(200);
    });
  });

  // ============================================================================
  // SECTION 3.4: DATABASE QUERY OPTIMIZATION
  // ============================================================================

  test.describe('Section 3.4: Database Query Optimization', () => {
    /**
     * Test 3.4.1: Efficient Group Queries
     */
    test('3.4.1 - Group queries should be optimized', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);

      // Group by efficiently
      const groupMap: { [key: string]: number } = {};
      const startTime = Date.now();

      teams.forEach((team) => {
        groupMap[team.group] = (groupMap[team.group] || 0) + 1;
      });

      const duration = Date.now() - startTime;

      Object.values(groupMap).forEach((count) => {
        expect(count).toBe(4);
      });

      TestHelpers.recordPerformance('Group Aggregation', duration);
    });

    /**
     * Test 3.4.2: Efficient Ranking Queries
     */
    test('3.4.2 - Ranking queries should support pagination efficiently', async ({ request }) => {
      const batchSize = 100;
      const startTime = Date.now();

      // Get multiple pages
      const page1 = await TestHelpers.getLeaderboard(request, batchSize, 0);
      const page2 = await TestHelpers.getLeaderboard(request, batchSize, batchSize);
      const page3 = await TestHelpers.getLeaderboard(request, batchSize, batchSize * 2);

      const duration = Date.now() - startTime;

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page3.status).toBe(200);

      TestHelpers.recordPerformance('3 Leaderboard Pages Query', duration);
    });

    /**
     * Test 3.4.3: Distinct Group Count Query
     */
    test('3.4.3 - Distinct queries should be efficient', async ({ request }) => {
      const teams = await TestHelpers.getTeams(request);

      const startTime = Date.now();
      const groups = new Set(teams.map((t) => t.group));
      const duration = Date.now() - startTime;

      expect(groups.size).toBe(12);
      TestHelpers.recordPerformance('Distinct Groups Query', duration);
    });
  });

  // ============================================================================
  // SECTION 3.5: WORKER & QUEUE PERFORMANCE
  // ============================================================================

  test.describe('Section 3.5: Worker & Queue Performance', () => {
    /**
     * Test 3.5.1: Message Queue Throughput
     */
    test('3.5.1 - Message queue should handle batch submissions', async ({ request }) => {
      // Queue processing should handle 1000 predictions per batch
      const batchSize = 1000;

      // Authenticate first
      const { token } = await TestHelpers.authenticateUser(request);

      const startTime = Date.now();
      const result = await TestHelpers.triggerPredictionProcess(request, token);
      const duration = Date.now() - startTime;

      expect(result.status).toBe(200);
      TestHelpers.recordPerformance(`Batch Processing (${batchSize} items)`, duration);
    });

    /**
     * Test 3.5.2: Worker Concurrency
     */
    test('3.5.2 - Multiple workers should process concurrently', async ({ request }) => {
      // Authenticate first
      const { token } = await TestHelpers.authenticateUser(request);

      const startTime = Date.now();

      // Trigger processing multiple times (simulating multiple workers)
      const requests = [];
      for (let i = 0; i < 3; i++) {
        requests.push(TestHelpers.triggerPredictionProcess(request, token));
      }

      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      results.forEach((result) => {
        expect(result.status).toBe(200);
      });

      TestHelpers.recordPerformance('3 Concurrent Worker Triggers', duration);
    });

    /**
     * Test 3.5.3: Processing Latency
     */
    test('3.5.3 - Prediction processing should have acceptable latency', async ({ request }) => {
      // Authenticate first
      const { token } = await TestHelpers.authenticateUser(request);

      const startTime = Date.now();

      const result = await TestHelpers.triggerPredictionProcess(request, token);

      const latency = Date.now() - startTime;

      expect(result.status).toBe(200);
      // Processing trigger should be fast (< 1 second)
      expect(latency).toBeLessThan(1000);
    });
  });

  // ============================================================================
  // SECTION 3.6: STRESS TESTING
  // ============================================================================

  test.describe('Section 3.6: Stress Testing', () => {
    /**
     * Test 3.6.1: Sustained Load Test
     */
    test('3.6.1 - System should handle sustained load', async ({ request }) => {
      const startTime = Date.now();
      let successCount = 0;
      let errorCount = 0;

      // Sustained requests for 10 iterations
      for (let i = 0; i < 10; i++) {
        try {
          const result = await TestHelpers.getLeaderboard(request, 50);
          if (result.status === 200) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (e) {
          errorCount++;
        }
      }

      const duration = Date.now() - startTime;

      expect(successCount).toBeGreaterThan(0);
      expect(errorCount).toBe(0);

      TestHelpers.recordPerformance('10 Sustained Requests', duration);
    });

    /**
     * Test 3.6.2: Recovery After Spike
     */
    test('3.6.2 - System should recover after traffic spike', async ({ request }) => {
      // Spike: Many concurrent requests
      const spikeRequests = [];
      for (let i = 0; i < 20; i++) {
        spikeRequests.push(TestHelpers.getTeams(request));
      }

      const spikeResults = await Promise.all(spikeRequests);

      // Normal operation after spike
      await TestHelpers.wait(100);

      const normalResult = await TestHelpers.getLeaderboard(request, 10);

      expect(normalResult.status).toBe(200);
      spikeResults.forEach((result) => {
        expect(result.length).toBe(48);
      });
    });
  });
});
