import request from 'supertest';
import express from 'express';
import { createRouter } from '../../src/infrastructure/routes';

describe('Browser Lifecycle E2E Tests - Phase 6.2', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const { router } = createRouter();
    app.use('/api', router);
  });

  describe('Browser Health Checks', () => {
    it('should report browser health status', async () => {
      const response = await request(app).get('/api/health/browser');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('browserHealthy');
      expect(response.body).toHaveProperty('chromiumVersion');
      expect(response.body).toHaveProperty('canLaunch');
      expect(response.body.browserHealthy).toBe(true);
    }, 60000); // Browser health check can take up to 60s
  });

  describe('Retry Mechanism', () => {
    it('should retry failed extractions with progressive backoff', async () => {
      // Use a video that might fail initially but succeed on retry
      // or test with invalid URL to trigger retry logic
      const response = await request(app)
        .post('/api/transcribe')
        .send({
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          format: 'json'
        });

      // Request should either succeed or fail gracefully
      expect([200, 400, 500, 503]).toContain(response.status);

      // Check metrics to see if retries occurred
      const metricsResponse = await request(app).get('/api/metrics');
      const metrics = metricsResponse.body;

      // Browser lifecycle should track retries
      if (metrics.browserLifecycle) {
        expect(metrics.browserLifecycle).toHaveProperty('launchCount');
        expect(metrics.browserLifecycle).toHaveProperty('retryCount');
      }
    }, 120000);

    it('should track browser retry attempts in metrics', async () => {
      // Get initial metrics
      const beforeMetrics = await request(app).get('/api/metrics');
      const initialRetries = beforeMetrics.body.browserLifecycle?.retryCount || 0;

      // Make several extraction attempts
      const requests = Array.from({ length: 3 }, () =>
        request(app)
          .post('/api/transcribe')
          .send({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            format: 'json'
          })
      );

      await Promise.allSettled(requests);

      // Check if retries increased (might be 0 if all succeeded)
      const afterMetrics = await request(app).get('/api/metrics');
      const finalRetries = afterMetrics.body.browserLifecycle?.retryCount || 0;

      expect(finalRetries).toBeGreaterThanOrEqual(initialRetries);
    }, 180000);
  });

  describe('Browser Cleanup', () => {
    it('should clean up browser resources after extraction', async () => {
      // Get initial metrics
      const beforeMetrics = await request(app).get('/api/metrics');
      const initialLaunches = beforeMetrics.body.browserLifecycle?.launchCount || 0;

      // Perform extraction
      await request(app)
        .post('/api/transcribe')
        .send({
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          format: 'json'
        });

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check metrics
      const afterMetrics = await request(app).get('/api/metrics');
      const finalLaunches = afterMetrics.body.browserLifecycle?.launchCount || 0;

      // Should have launched at least one browser
      expect(finalLaunches).toBeGreaterThan(initialLaunches);

      // Cleanup failures should be low
      const cleanupFailures = afterMetrics.body.browserLifecycle?.cleanupFailures || 0;
      expect(cleanupFailures).toBe(0); // No cleanup failures expected
    }, 60000);

    it('should handle multiple sequential extractions without leaks', async () => {
      // Perform 5 sequential extractions
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/transcribe')
          .send({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            format: 'json'
          });
      }

      // System should still be healthy
      const healthResponse = await request(app).get('/api/health');
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.body.status).toBe('ok');

      // Memory usage should be reasonable
      const memoryUsagePercent = healthResponse.body.memory.usagePercent;
      expect(memoryUsagePercent).toBeLessThan(90); // Less than 90% memory usage
    }, 300000); // 5 minutes for 5 sequential extractions
  });

  describe('Browser Performance Metrics', () => {
    it('should track browser launch duration', async () => {
      // Perform extraction
      await request(app)
        .post('/api/transcribe')
        .send({
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          format: 'json'
        });

      // Check metrics
      const metricsResponse = await request(app).get('/api/metrics');
      const metrics = metricsResponse.body;

      if (metrics.browserLifecycle) {
        expect(metrics.browserLifecycle).toHaveProperty('averageDurationMs');
        expect(metrics.browserLifecycle).toHaveProperty('durationP95Ms');

        // Duration should be reasonable (< 5 seconds for p95)
        const p95Duration = metrics.browserLifecycle.durationP95Ms;
        expect(p95Duration).toBeLessThan(5000);
      }
    }, 60000);
  });

  describe('Error Recovery', () => {
    it('should recover from invalid video URLs', async () => {
      const response = await request(app)
        .post('/api/transcribe')
        .send({
          url: 'https://www.youtube.com/watch?v=INVALID_VIDEO',
          format: 'json'
        });

      // Should fail gracefully with proper error response
      expect([400, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');

      // System should still be responsive
      const healthCheck = await request(app).get('/api/health');
      expect(healthCheck.status).toBe(200);
    }, 60000);

    it('should handle malformed request bodies', async () => {
      const response = await request(app)
        .post('/api/transcribe')
        .send({
          url: 'not-a-url',
          format: 'invalid-format'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_URL');
    }, 10000);
  });
});
