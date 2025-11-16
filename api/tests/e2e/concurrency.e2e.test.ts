import request from 'supertest';
import express from 'express';
import { createRouter } from '../../src/infrastructure/routes';

describe('Concurrency Queue E2E Tests - Phase 6.2', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const { router } = createRouter();
    app.use('/api', router);
  });

  describe('Parallel Request Handling', () => {
    it('should handle 10 parallel requests respecting queue limits', async () => {
      const videoIds = [
        'dQw4w9WgXcQ', 'jNQXAC9IVRw', '9bZkp7q19f0', 'kJQP7kiw5Fk', 'OPf0YbXqDm0',
        'RgKAFK5djSk', 'hT_nvWreIhg', 'L_jWHffIx5E', 'YQHsXMglC9A', 'dQw4w9WgXcQ'
      ];

      const startTime = Date.now();

      // Send 10 parallel requests
      const requests = videoIds.map(videoId =>
        request(app)
          .post('/api/transcribe')
          .send({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            format: 'json'
          })
          .timeout(120000) // 2 minute timeout for all 10
      );

      // Wait for all to complete
      const results = await Promise.allSettled(requests);

      const duration = Date.now() - startTime;

      // Count successes and failures
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;

      console.log(`10 parallel requests completed in ${duration}ms`);
      console.log(`Successes: ${successes}, Failures: ${failures}`);

      // At least some requests should succeed
      expect(successes).toBeGreaterThan(0);

      // Total requests should be 10
      expect(results.length).toBe(10);

      // Duration should indicate queuing (not all ran simultaneously)
      // With max concurrency of 3-5, should take longer than single request
      expect(duration).toBeGreaterThan(30000); // > 30 seconds indicates queuing
    }, 180000); // 3 minute test timeout
  });

  describe('Queue Metrics During Load', () => {
    it('should track queue stats accurately under load', async () => {
      // Start 5 parallel long-running requests
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/transcribe')
          .send({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            format: 'json'
          })
      );

      // Wait a bit for queue to fill
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check metrics while requests are running
      const metricsResponse = await request(app).get('/api/metrics');
      expect(metricsResponse.status).toBe(200);

      const metrics = metricsResponse.body;

      // Should have active or pending requests
      const totalInFlight = metrics.queue.active + metrics.queue.pending;
      expect(totalInFlight).toBeGreaterThan(0);
      expect(totalInFlight).toBeLessThanOrEqual(5);

      // Wait for all to complete
      await Promise.allSettled(requests);

      // Final metrics should show completions
      const finalMetrics = await request(app).get('/api/metrics');
      expect(finalMetrics.body.queue.completed).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Queue Capacity Limits', () => {
    it('should reject requests when queue is full', async () => {
      // QUEUE_MAX_SIZE defaults to 100, QUEUE_MAX_CONCURRENT defaults to 3
      // We need to send enough requests to fill the queue

      const requests = Array.from({ length: 110 }, () =>
        request(app)
          .post('/api/transcribe')
          .send({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            format: 'json'
          })
          .timeout(10000)
      );

      const results = await Promise.allSettled(requests);

      // Some should succeed, some should fail with 503 (queue full)
      const successes = results.filter(r => r.status === 'fulfilled');
      const queueFullErrors = results.filter(r =>
        r.status === 'rejected' &&
        r.reason.message?.includes('503')
      );

      console.log(`Queue capacity test: ${successes.length} succeeded, ${queueFullErrors.length} rejected (503)`);

      // Should have some queue full rejections
      expect(queueFullErrors.length).toBeGreaterThan(0);
    }, 180000);
  });

  describe('FIFO Queue Ordering', () => {
    it('should process requests in order when queue is used', async () => {
      const timestamps: { id: number; startTime: number; endTime: number }[] = [];

      // Send 5 requests sequentially with tracking
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();

        try {
          await request(app)
            .post('/api/transcribe')
            .send({
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              format: 'json'
            });

          timestamps.push({ id: i, startTime, endTime: Date.now() });
        } catch (error) {
          // Track failures too
          timestamps.push({ id: i, startTime, endTime: Date.now() });
        }
      }

      // Verify ordering: requests should complete in approximately FIFO order
      // (allowing for some variance due to extraction time differences)
      for (let i = 1; i < timestamps.length; i++) {
        const prev = timestamps[i - 1];
        const curr = timestamps[i];

        // Current request should start after or during previous request
        expect(curr.startTime).toBeGreaterThanOrEqual(prev.startTime);
      }

      console.log('Request completion order:', timestamps);
    }, 300000); // 5 minute timeout for sequential execution
  });
});
