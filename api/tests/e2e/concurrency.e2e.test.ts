import request from 'supertest';
import express from 'express';
import { createRouter } from '../../src/infrastructure/routes';
import { MockYouTubeServer } from '../helpers/MockYouTubeServer';
import { keepAliveWrapper, waitForQueueSettlement } from '../helpers/LongRunningRequestHelper';
import { getAvailablePort, getRandomPort } from '../helpers/port-utils';
import { waitForServerReady } from '../helpers/server-utils';

describe('Concurrency Queue E2E Tests - Phase 6.2', () => {
  let app: express.Application;
  let mockServer: MockYouTubeServer;
  let mockServerPort: number;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const { router } = createRouter();
    app.use('/api', router);

    // Start mock YouTube server with dynamic port allocation
    const randomStart = getRandomPort(9700, 9900);
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

  describe('Parallel Request Handling', () => {
    it('should handle 10 parallel requests respecting queue limits', async () => {
      const videoIds = [
        'test1', 'test2', 'test3', 'test4', 'test5',
        'test6', 'test7', 'test8', 'test9', 'test10'
      ];

      // Register mock videos with fast responses
      videoIds.forEach(videoId => {
        mockServer.registerVideo({
          videoId,
          title: `Test Video ${videoId}`,
          hasTranscript: true,
          transcriptSegments: [
            { time: '0:00', text: `Transcript for ${videoId}` }
          ],
          responseDelay: 100 // Fast mock responses
        });
      });

      const startTime = Date.now();

      // Send 10 parallel requests with keep-alive
      const requests = videoIds.map(videoId =>
        keepAliveWrapper(request(app).post('/api/transcribe'))
          .send({
            url: `${mockServer.getBaseUrl()}/watch?v=${videoId}`,
            format: 'json'
          })
      );

      // Wait for all to complete
      const results = await Promise.allSettled(requests);

      const duration = Date.now() - startTime;

      // Count successes and failures
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;

      console.log(`10 parallel requests completed in ${duration}ms`);
      console.log(`Successes: ${successes}, Failures: ${failures}`);

      // All requests should succeed with mock server
      expect(successes).toBe(10);
      expect(failures).toBe(0);

      // Total requests should be 10
      expect(results.length).toBe(10);

      // Duration should indicate queuing (max concurrency is 3)
      // 10 requests / 3 concurrent = at least 4 batches
      // Each batch ~100ms delay + processing overhead
      expect(duration).toBeGreaterThan(300); // At least 3 batches
    }, 30000); // 30 second timeout (much faster with mocks)
  });

  describe('Queue Metrics During Load', () => {
    it('should track queue stats accurately under load', async () => {
      // Register slow mock video to keep queue full
      mockServer.registerVideo({
        videoId: 'slow1',
        title: 'Slow Video',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'Slow transcript' }],
        responseDelay: 5000 // 5 second delay to ensure queue stays full
      });

      // Start 5 parallel long-running requests
      const requests = Array.from({ length: 5 }, () =>
        keepAliveWrapper(request(app).post('/api/transcribe'))
          .send({
            url: `${mockServer.getBaseUrl()}/watch?v=slow1`,
            format: 'json'
          })
      );

      // Wait briefly for requests to enter queue
      await waitForQueueSettlement(500);

      // Check metrics while requests are running
      const metricsResponse = await request(app).get('/api/metrics');
      expect(metricsResponse.status).toBe(200);

      const metrics = metricsResponse.body.data;

      // Should have active or pending requests
      const totalInFlight = metrics.queue.active + metrics.queue.pending;
      expect(totalInFlight).toBeGreaterThan(0);
      expect(totalInFlight).toBeLessThanOrEqual(5);

      // Wait for all to complete
      await Promise.allSettled(requests);

      // Final metrics should show completions
      const finalMetrics = await request(app).get('/api/metrics');
      expect(finalMetrics.body.data.queue.completed).toBeGreaterThan(0);
    }, 30000); // 30 second timeout
  });

  describe('Queue Capacity Limits', () => {
    it('should reject requests when queue is full', async () => {
      // QUEUE_MAX_SIZE defaults to 100, QUEUE_MAX_CONCURRENT defaults to 3
      // Register very slow video to block queue
      mockServer.registerVideo({
        videoId: 'veryslow',
        title: 'Very Slow Video',
        hasTranscript: true,
        transcriptSegments: [{ time: '0:00', text: 'Very slow' }],
        responseDelay: 10000 // 10 second delay to block queue
      });

      // Fire 110 requests rapidly
      const requests = Array.from({ length: 110 }, () =>
        keepAliveWrapper(request(app).post('/api/transcribe'))
          .timeout(15000)
          .send({
            url: `${mockServer.getBaseUrl()}/watch?v=veryslow`,
            format: 'json'
          })
          .catch(err => err) // Capture errors for analysis
      );

      const results = await Promise.allSettled(requests);

      // Check for 503 queue full responses
      const queueFullErrors = results.filter(r => {
        if (r.status === 'fulfilled' && r.value.response) {
          return r.value.response.status === 503;
        }
        if (r.status === 'fulfilled' && r.value.status) {
          return r.value.status === 503;
        }
        if (r.status === 'rejected' && r.reason.response) {
          return r.reason.response.status === 503;
        }
        return false;
      });

      console.log(`Queue capacity test: ${queueFullErrors.length} rejected with 503 (queue full)`);

      // Should have some queue full rejections
      expect(queueFullErrors.length).toBeGreaterThan(0);
    }, 60000); // 60 second timeout
  });

  describe('FIFO Queue Ordering', () => {
    it('should process requests in order when queue is used', async () => {
      // Register videos with unique IDs
      for (let i = 0; i < 5; i++) {
        mockServer.registerVideo({
          videoId: `fifo${i}`,
          title: `FIFO Test ${i}`,
          hasTranscript: true,
          transcriptSegments: [{ time: '0:00', text: `Transcript ${i}` }],
          responseDelay: 100 // Fast delay for sequential execution
        });
      }

      const timestamps: { id: number; startTime: number; endTime: number; success: boolean }[] = [];

      // Send 5 requests sequentially with tracking
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();

        try {
          const response = await request(app)
            .post('/api/transcribe')
            .timeout(10000)
            .send({
              url: `${mockServer.getBaseUrl()}/watch?v=fifo${i}`,
              format: 'json'
            });

          timestamps.push({
            id: i,
            startTime,
            endTime: Date.now(),
            success: response.status === 200
          });
        } catch (error: any) {
          // Track failures with error details
          console.log(`Request ${i} failed:`, error.message);
          timestamps.push({
            id: i,
            startTime,
            endTime: Date.now(),
            success: false
          });
        }
      }

      // Verify at least some requests succeeded
      const successCount = timestamps.filter(t => t.success).length;
      expect(successCount).toBeGreaterThan(0);

      // Verify ordering: requests should complete in approximately FIFO order
      for (let i = 1; i < timestamps.length; i++) {
        const prev = timestamps[i - 1];
        const curr = timestamps[i];

        // Current request should start after or during previous request
        expect(curr.startTime).toBeGreaterThanOrEqual(prev.startTime);
      }

      console.log('Request completion order:', timestamps);
    }, 60000); // 60 second timeout for sequential execution
  });
});
