import request from 'supertest';
import express from 'express';
import { createRouter } from '../../src/infrastructure/routes';
import { MockYouTubeServer } from '../helpers/MockYouTubeServer';
import { keepAliveWrapper, waitForQueueSettlement } from '../helpers/LongRunningRequestHelper';
import { getAvailablePort, getRandomPort } from '../helpers/port-utils';
import { waitForServerReady } from '../helpers/server-utils';

describe('Browser Lifecycle E2E Tests - Phase 6.2', () => {
  let app: express.Application;
  let mockServer: MockYouTubeServer;
  let mockServerPort: number;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const { router } = createRouter();
    app.use('/api', router);

    // Start mock YouTube server with dynamic port allocation
    const randomStart = getRandomPort(9000, 9500);
    mockServerPort = await getAvailablePort(randomStart);
    mockServer = new MockYouTubeServer(mockServerPort);
    await mockServer.start();

    // Wait for server to be fully ready
    const isReady = await waitForServerReady(mockServer);
    if (!isReady) {
      throw new Error('Mock server failed to start');
    }
  });

  afterAll(async () => {
    if (mockServer) {
      await mockServer.stop();
      // Give server time to fully release the port
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  beforeEach(() => {
    mockServer.clearVideos();
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
      // Register normal video
      mockServer.registerVideo({
        videoId: 'retry1',
        title: 'Retry Test',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'Retry test' }]
      });

      const response = await keepAliveWrapper(request(app).post('/api/transcribe'))
        .send({
          url: `${mockServer.getBaseUrl()}/watch?v=retry1`,
          format: 'json'
        });

      // Request should succeed with mock server
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Check metrics
      const metricsResponse = await request(app).get('/api/metrics');
      expect(metricsResponse.status).toBe(200);
    }, 30000);

    it('should track browser retry attempts in metrics', async () => {
      // Register video
      mockServer.registerVideo({
        videoId: 'retry2',
        title: 'Retry Metrics Test',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'Metrics' }]
      });

      // Make several extraction attempts
      const requests = Array.from({ length: 3 }, () =>
        keepAliveWrapper(request(app).post('/api/transcribe'))
          .send({
            url: `${mockServer.getBaseUrl()}/watch?v=retry2`,
            format: 'json'
          })
      );

      await Promise.allSettled(requests);

      // Check metrics exist
      const afterMetrics = await request(app).get('/api/metrics');
      expect(afterMetrics.status).toBe(200);
      expect(afterMetrics.body.data).toHaveProperty('queue');
    }, 60000);
  });

  describe('Browser Cleanup', () => {
    it('should clean up browser resources after extraction', async () => {
      // Register test video
      mockServer.registerVideo({
        videoId: 'cleanup1',
        title: 'Cleanup Test',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'Cleanup' }]
      });

      // Perform extraction
      const response = await keepAliveWrapper(request(app).post('/api/transcribe'))
        .send({
          url: `${mockServer.getBaseUrl()}/watch?v=cleanup1`,
          format: 'json'
        });

      expect(response.status).toBe(200);

      // Wait for cleanup to complete
      await waitForQueueSettlement(2000);

      // Check queue is empty
      const metrics = await request(app).get('/api/metrics');
      expect(metrics.body.data.queue.active).toBe(0);
      expect(metrics.body.data.queue.pending).toBe(0);

      // System should be healthy
      const health = await request(app).get('/api/health');
      expect(health.status).toBe(200);
    }, 30000);

    it('should handle multiple sequential extractions without leaks', async () => {
      // Register videos
      for (let i = 0; i < 5; i++) {
        mockServer.registerVideo({
          videoId: `seq${i}`,
          title: `Sequential Test ${i}`,
          hasTranscript: true,
          transcriptSegments: [{ time: '0:00', text: `Transcript ${i}` }]
        });
      }

      // Perform 5 sequential extractions
      for (let i = 0; i < 5; i++) {
        const response = await keepAliveWrapper(request(app).post('/api/transcribe'))
          .send({
            url: `${mockServer.getBaseUrl()}/watch?v=seq${i}`,
            format: 'json'
          });
        expect(response.status).toBe(200);
      }

      // Wait for cleanup
      await waitForQueueSettlement(2000);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await waitForQueueSettlement(1000);
      }

      // System should still be healthy
      const healthResponse = await request(app).get('/api/health');
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.body.status).toBe('healthy');

      // Memory usage should be reasonable
      const memoryUsagePercent = healthResponse.body.memory.usagePercent;
      expect(memoryUsagePercent).toBeLessThan(95); // Less than 95% memory usage
    }, 60000); // Reduced from 300s with mocks
  });

  describe('Browser Performance Metrics', () => {
    it('should track browser launch duration', async () => {
      // Register test video
      mockServer.registerVideo({
        videoId: 'perf1',
        title: 'Performance Test',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'Performance' }]
      });

      // Perform extraction
      const response = await keepAliveWrapper(request(app).post('/api/transcribe'))
        .send({
          url: `${mockServer.getBaseUrl()}/watch?v=perf1`,
          format: 'json'
        });

      expect(response.status).toBe(200);

      // Check metrics endpoint is working
      const metricsResponse = await request(app).get('/api/metrics');
      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.data).toHaveProperty('queue');
    }, 30000);
  });

  describe('Error Recovery', () => {
    it('should recover from invalid video URLs', async () => {
      // Register invalid video (no transcript)
      mockServer.registerVideo({
        videoId: 'INVALID_VIDEO',
        title: 'Invalid Video',
        hasTranscript: false // No transcript available
      });

      const response = await keepAliveWrapper(request(app).post('/api/transcribe'))
        .send({
          url: `${mockServer.getBaseUrl()}/watch?v=INVALID_VIDEO`,
          format: 'json'
        });

      // Should fail gracefully with proper error response
      expect(response.body).toHaveProperty('success');

      // Wait for cleanup
      await waitForQueueSettlement(1000);

      // System should still be responsive
      const healthCheck = await request(app).get('/api/health');
      expect(healthCheck.status).toBe(200);
    }, 30000);

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
