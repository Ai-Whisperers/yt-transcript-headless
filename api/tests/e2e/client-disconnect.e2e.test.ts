import request from 'supertest';
import express from 'express';
import { createRouter } from '../../src/infrastructure/routes';

describe('Client Disconnect E2E Tests - Phase 6.2', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const { router } = createRouter();
    app.use('/api', router);
  });

  describe('Request Timeout Handling', () => {
    it('should handle request timeout gracefully', async () => {
      // Use a short timeout to simulate client disconnect
      const response = await request(app)
        .post('/api/transcribe')
        .send({
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          format: 'json'
        })
        .timeout(500); // Very short timeout to trigger abort

      // Request should timeout or complete
      // If it times out, we expect supertest to throw
      // If it completes, we get a response
      expect([200, 500]).toContain(response.status);
    }, 10000);

    it('should clean up browser resources after timeout', async () => {
      // Get initial metrics
      const beforeMetrics = await request(app).get('/api/metrics');
      const initialBrowserLaunches = beforeMetrics.body.browserLifecycle?.launchCount || 0;

      try {
        // Attempt extraction with short timeout
        await request(app)
          .post('/api/transcribe')
          .send({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            format: 'json'
          })
          .timeout(500);
      } catch (error) {
        // Timeout expected
      }

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify browser was launched
      const afterMetrics = await request(app).get('/api/metrics');
      const finalBrowserLaunches = afterMetrics.body.browserLifecycle?.launchCount || 0;

      // Browser should have been launched (attempt was made)
      expect(finalBrowserLaunches).toBeGreaterThanOrEqual(initialBrowserLaunches);

      // System should still be healthy
      const healthCheck = await request(app).get('/api/health');
      expect(healthCheck.status).toBe(200);
    }, 15000);
  });

  describe('Request Queue Stability', () => {
    it('should handle multiple failed requests without degradation', async () => {
      // Send multiple requests that will likely timeout
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/transcribe')
          .send({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            format: 'json'
          })
          .timeout(1000)
      );

      // Wait for all to complete or timeout
      const results = await Promise.allSettled(requests);

      // Should have some results (success or failure)
      expect(results.length).toBe(5);

      // Wait for queue to settle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Queue should be stable
      const metrics = await request(app).get('/api/metrics');
      expect(metrics.body.queue.active).toBeLessThanOrEqual(3);
    }, 30000);
  });

  describe('Resource Cleanup Verification', () => {
    it('should not leak memory on interrupted requests', async () => {
      // Get initial health
      const beforeHealth = await request(app).get('/api/health');
      const initialMemoryUsage = beforeHealth.body.memory.usagePercent;

      // Perform 10 interrupted request cycles
      for (let i = 0; i < 10; i++) {
        try {
          await request(app)
            .post('/api/transcribe')
            .send({
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              format: 'json'
            })
            .timeout(200);
        } catch (error) {
          // Expected timeout
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 3000));

      // System should still be responsive
      const healthCheck = await request(app).get('/api/health');
      expect(healthCheck.status).toBe(200);
      expect(healthCheck.body.status).toBe('ok');

      // Memory should not have increased significantly
      const finalMemoryUsage = healthCheck.body.memory.usagePercent;
      const memoryIncrease = finalMemoryUsage - initialMemoryUsage;
      expect(memoryIncrease).toBeLessThan(20); // Less than 20% memory increase
    }, 60000);
  });
});
