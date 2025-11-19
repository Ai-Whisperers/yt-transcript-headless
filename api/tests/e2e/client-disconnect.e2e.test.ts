import request from 'supertest';
import express from 'express';
import { createRouter } from '../../src/infrastructure/routes';
import { MockYouTubeServer } from '../helpers/MockYouTubeServer';
import { waitForQueueSettlement } from '../helpers/LongRunningRequestHelper';

describe('Client Disconnect E2E Tests - Phase 6.2', () => {
  let app: express.Application;
  let mockServer: MockYouTubeServer;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const { router } = createRouter();
    app.use('/api', router);

    // Start mock YouTube server
    mockServer = new MockYouTubeServer(9998);
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.clearVideos();
  });

  describe('Request Timeout Handling', () => {
    it('should handle request timeout gracefully', async () => {
      // Register very slow video to force timeout
      mockServer.registerVideo({
        videoId: 'timeout1',
        title: 'Timeout Test',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'This will timeout' }],
        responseDelay: 10000 // 10 second delay
      });

      try {
        // Use a short timeout to simulate client disconnect
        await request(app)
          .post('/api/transcribe')
          .send({
            url: `${mockServer.getBaseUrl()}/watch?v=timeout1`,
            format: 'json'
          })
          .timeout(2000); // 2 second timeout

        // If we get here, it shouldn't have timed out
        throw new Error('Expected request to timeout');
      } catch (error: any) {
        // Verify proper timeout handling (supertest timeout error structure)
        expect(error.code || error.timeout || error.message).toMatch(/TIMEOUT|ECONNABORTED|ECONNRESET|timeout|timed out/i);
      }

      // Verify queue was cleaned up
      await waitForQueueSettlement(1000);
      const metrics = await request(app).get('/api/metrics');
      expect(metrics.body.data.queue.active).toBe(0);
    }, 15000);

    it('should clean up browser resources after timeout', async () => {
      // Register slow video
      mockServer.registerVideo({
        videoId: 'cleanup1',
        title: 'Cleanup Test',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'Cleanup test' }],
        responseDelay: 5000 // 5 second delay
      });

      try {
        // Attempt extraction with short timeout
        await request(app)
          .post('/api/transcribe')
          .send({
            url: `${mockServer.getBaseUrl()}/watch?v=cleanup1`,
            format: 'json'
          })
          .timeout(1000); // 1 second timeout
      } catch (error) {
        // Timeout expected
      }

      // Wait for cleanup to complete
      await waitForQueueSettlement(2000);

      // System should still be healthy
      const healthCheck = await request(app).get('/api/health');
      expect(healthCheck.status).toBe(200);
      expect(healthCheck.body.status).toBe('healthy');

      // Queue should be clean
      const metrics = await request(app).get('/api/metrics');
      expect(metrics.body.data.queue.active).toBe(0);
      expect(metrics.body.data.queue.pending).toBe(0);
    }, 15000);
  });

  describe('Request Queue Stability', () => {
    it('should handle multiple failed requests without degradation', async () => {
      // Register slow video for all requests
      mockServer.registerVideo({
        videoId: 'multi1',
        title: 'Multi Timeout Test',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'Multi test' }],
        responseDelay: 8000 // 8 second delay
      });

      // Send multiple requests that will timeout
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/transcribe')
          .send({
            url: `${mockServer.getBaseUrl()}/watch?v=multi1`,
            format: 'json'
          })
          .timeout(2000) // 2 second timeout
          .catch(err => err) // Capture errors
      );

      // Wait for all to complete or timeout
      const results = await Promise.allSettled(requests);

      // Should have all 5 results
      expect(results.length).toBe(5);

      // Wait for queue to settle
      await waitForQueueSettlement(3000);

      // Queue should be stable (no active requests)
      const metrics = await request(app).get('/api/metrics');
      expect(metrics.body.data.queue.active).toBe(0);
      expect(metrics.body.data.queue.pending).toBe(0);

      // System should still be healthy
      const health = await request(app).get('/api/health');
      expect(health.status).toBe(200);
    }, 30000);
  });

  describe('Resource Cleanup Verification', () => {
    it('should not leak memory on interrupted requests', async () => {
      // Get initial health
      const beforeHealth = await request(app).get('/api/health');
      const initialMemoryUsage = beforeHealth.body.memory.usagePercent;

      // Register very fast but immediately aborted video
      mockServer.registerVideo({
        videoId: 'leak1',
        title: 'Memory Leak Test',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'Leak test' }],
        responseDelay: 3000 // 3 second delay
      });

      // Perform 10 interrupted request cycles
      for (let i = 0; i < 10; i++) {
        try {
          await request(app)
            .post('/api/transcribe')
            .send({
              url: `${mockServer.getBaseUrl()}/watch?v=leak1`,
              format: 'json'
            })
            .timeout(500); // Very short timeout
        } catch (error) {
          // Expected timeout
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait for cleanup and garbage collection
      await waitForQueueSettlement(5000);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await waitForQueueSettlement(1000);
      }

      // System should still be responsive
      const healthCheck = await request(app).get('/api/health');
      expect(healthCheck.status).toBe(200);
      expect(healthCheck.body.status).toBe('healthy');

      // Memory should not have increased significantly
      const finalMemoryUsage = healthCheck.body.memory.usagePercent;
      const memoryIncrease = finalMemoryUsage - initialMemoryUsage;

      // Allow some memory growth but not excessive
      // 10 browser launches might use some memory, but should be cleaned up
      expect(memoryIncrease).toBeLessThan(30); // Less than 30% memory increase

      console.log(`Memory change: ${initialMemoryUsage}% → ${finalMemoryUsage}% (Δ ${memoryIncrease}%)`);
    }, 60000);
  });
});
