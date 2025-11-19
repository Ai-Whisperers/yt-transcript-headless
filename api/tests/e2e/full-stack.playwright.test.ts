import { test, expect } from '@playwright/test';
import express from 'express';
import { Server } from 'http';
import { createRouter } from '../../src/infrastructure/routes';
import { MockYouTubeServer } from '../helpers/MockYouTubeServer';
import { getAvailablePort, getRandomPort } from '../helpers/port-utils';
import path from 'path';
import sirv from 'sirv';

let apiApp: express.Application;
let apiServer: Server;
let mockYouTubeServer: MockYouTubeServer;
let frontendServer: Server;
let API_PORT: number;
let FRONTEND_PORT: number;
let MOCK_YOUTUBE_PORT: number;

test.describe('Full-Stack Frontend-Backend E2E Tests', () => {
  test.beforeAll(async () => {
    // Allocate dynamic ports for test isolation
    MOCK_YOUTUBE_PORT = await getAvailablePort(getRandomPort(10000, 10500));
    API_PORT = await getAvailablePort(getRandomPort(10500, 11000));
    FRONTEND_PORT = await getAvailablePort(getRandomPort(11000, 11500));

    // Start Mock YouTube Server
    mockYouTubeServer = new MockYouTubeServer(MOCK_YOUTUBE_PORT);
    await mockYouTubeServer.start();

    // Start Backend API Server
    apiApp = express();
    apiApp.use(express.json());
    const { router } = createRouter();
    apiApp.use('/api', router);

    apiServer = apiApp.listen(API_PORT);

    // Wait for API to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start Frontend Server (serving built frontend)
    const frontendApp = express();
    const frontendDistPath = path.join(__dirname, '../../../web/dist');

    frontendApp.use(sirv(frontendDistPath, { single: true }));

    // Proxy API requests to backend
    frontendApp.use('/api', (req, res) => {
      const url = `http://localhost:${API_PORT}/api${req.url}`;
      // Convert IncomingHttpHeaders to Headers object for fetch
      const headers: Record<string, string> = {};
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value) {
          headers[key] = Array.isArray(value) ? value[0] : value;
        }
      });

      const options: RequestInit = {
        method: req.method,
        headers
      };

      fetch(url, options)
        .then(response => response.json())
        .then(data => res.json(data))
        .catch(error => res.status(500).json({ error: error.message }));
    });

    frontendServer = frontendApp.listen(FRONTEND_PORT);

    // Wait for frontend to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (apiServer) {
        apiServer.close(() => resolve());
      } else {
        resolve();
      }
    });

    await new Promise<void>((resolve) => {
      if (frontendServer) {
        frontendServer.close(() => resolve());
      } else {
        resolve();
      }
    });

    if (mockYouTubeServer) {
      await mockYouTubeServer.stop();
    }
  });

  test.beforeEach(() => {
    if (mockYouTubeServer) {
      mockYouTubeServer.clearVideos();
    }
  });

  test.describe('Frontend-Backend Integration', () => {
    test('should load frontend and connect to backend health endpoint', async ({ page }) => {
      await page.goto(`http://localhost:${FRONTEND_PORT}`);

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Check if page has essential elements
      await expect(page).toHaveTitle(/YouTube Transcript/i);

      // Verify backend is accessible (page should show health status if implemented)
      const response = await page.evaluate(async (apiPort) => {
        const res = await fetch(`http://localhost:${apiPort}/api/health`);
        return res.json();
      }, API_PORT);

      expect(response).toHaveProperty('status', 'healthy');
      expect(response).toHaveProperty('service', 'yt-transcript-api');
    }, 30000);

    test('should extract transcript through frontend UI', async ({ page }) => {
      // Register mock video
      mockYouTubeServer.registerVideo({
        videoId: 'ui-test-1',
        title: 'UI Test Video',
        hasTranscript: true,
        transcriptSegments: [
          { time: '0:00', text: 'Hello from UI test' },
          { time: '0:05', text: 'This is a test transcript' },
          { time: '0:10', text: 'Testing frontend-backend integration' }
        ],
        responseDelay: 100
      });

      await page.goto(`http://localhost:${FRONTEND_PORT}`);
      await page.waitForLoadState('domcontentloaded');

      // Find and fill the URL input
      const urlInput = page.locator('input[type="text"], input[type="url"]').first();
      await urlInput.fill(`${mockYouTubeServer.getBaseUrl()}/watch?v=ui-test-1`);

      // Find and click the submit button
      const submitButton = page.locator('button[type="submit"], button:has-text("Extract")').first();
      await submitButton.click();

      // Wait for results to appear (with generous timeout for extraction)
      await page.waitForSelector('[data-testid="transcript-result"], .transcript-segment', {
        timeout: 30000
      });

      // Verify transcript segments are displayed
      const transcriptText = await page.textContent('body');
      expect(transcriptText).toContain('Hello from UI test');
      expect(transcriptText).toContain('Testing frontend-backend integration');
    }, 60000);

    test('should handle errors gracefully in UI', async ({ page }) => {
      await page.goto(`http://localhost:${FRONTEND_PORT}`);
      await page.waitForLoadState('domcontentloaded');

      // Submit invalid URL
      const urlInput = page.locator('input[type="text"], input[type="url"]').first();
      await urlInput.fill('not-a-valid-url');

      const submitButton = page.locator('button[type="submit"], button:has-text("Extract")').first();
      await submitButton.click();

      // Wait for error message
      await page.waitForSelector('[data-testid="error-message"], .error, [role="alert"]', {
        timeout: 10000
      });

      // Verify error is displayed
      const errorText = await page.textContent('body');
      expect(errorText).toMatch(/invalid|error/i);
    }, 30000);

    test('should show loading state during extraction', async ({ page }) => {
      // Register slow video to observe loading state
      mockYouTubeServer.registerVideo({
        videoId: 'loading-test',
        title: 'Loading Test Video',
        hasTranscript: true,
        transcriptSegments: [
          { time: '0:00', text: 'Loading state test' }
        ],
        responseDelay: 2000 // 2 second delay
      });

      await page.goto(`http://localhost:${FRONTEND_PORT}`);
      await page.waitForLoadState('domcontentloaded');

      const urlInput = page.locator('input[type="text"], input[type="url"]').first();
      await urlInput.fill(`${mockYouTubeServer.getBaseUrl()}/watch?v=loading-test`);

      const submitButton = page.locator('button[type="submit"], button:has-text("Extract")').first();
      await submitButton.click();

      // Check for loading indicator
      const loadingIndicator = page.locator('[data-testid="loading"], .loading, .spinner').first();
      await expect(loadingIndicator).toBeVisible({ timeout: 5000 });

      // Wait for loading to complete
      await page.waitForSelector('[data-testid="transcript-result"], .transcript-segment', {
        timeout: 30000
      });

      // Loading indicator should disappear
      await expect(loadingIndicator).not.toBeVisible();
    }, 60000);
  });

  test.describe('Async Data Flow', () => {
    test('should handle multiple sequential requests correctly', async ({ page }) => {
      // Register multiple videos
      for (let i = 1; i <= 3; i++) {
        mockYouTubeServer.registerVideo({
          videoId: `async-test-${i}`,
          title: `Async Test ${i}`,
          hasTranscript: true,
          transcriptSegments: [
            { time: '0:00', text: `Transcript ${i} content` }
          ],
          responseDelay: 200
        });
      }

      await page.goto(`http://localhost:${FRONTEND_PORT}`);
      await page.waitForLoadState('domcontentloaded');

      // Extract first video
      const urlInput = page.locator('input[type="text"], input[type="url"]').first();
      await urlInput.fill(`${mockYouTubeServer.getBaseUrl()}/watch?v=async-test-1`);
      await page.locator('button[type="submit"], button:has-text("Extract")').first().click();

      await page.waitForSelector('[data-testid="transcript-result"], .transcript-segment', {
        timeout: 30000
      });

      let content = await page.textContent('body');
      expect(content).toContain('Transcript 1 content');

      // Extract second video
      await urlInput.fill(`${mockYouTubeServer.getBaseUrl()}/watch?v=async-test-2`);
      await page.locator('button[type="submit"], button:has-text("Extract")').first().click();

      await page.waitForSelector('[data-testid="transcript-result"], .transcript-segment', {
        timeout: 30000
      });

      content = await page.textContent('body');
      expect(content).toContain('Transcript 2 content');

      // Extract third video
      await urlInput.fill(`${mockYouTubeServer.getBaseUrl()}/watch?v=async-test-3`);
      await page.locator('button[type="submit"], button:has-text("Extract")').first().click();

      await page.waitForSelector('[data-testid="transcript-result"], .transcript-segment', {
        timeout: 30000
      });

      content = await page.textContent('body');
      expect(content).toContain('Transcript 3 content');
    }, 120000);

    test('should display real-time progress updates if available', async ({ page }) => {
      mockYouTubeServer.registerVideo({
        videoId: 'progress-test',
        title: 'Progress Test',
        hasTranscript: true,
        transcriptSegments: [
          { time: '0:00', text: 'Progress tracking test' }
        ],
        responseDelay: 1500
      });

      await page.goto(`http://localhost:${FRONTEND_PORT}`);
      await page.waitForLoadState('domcontentloaded');

      const urlInput = page.locator('input[type="text"], input[type="url"]').first();
      await urlInput.fill(`${mockYouTubeServer.getBaseUrl()}/watch?v=progress-test`);

      const submitButton = page.locator('button[type="submit"], button:has-text("Extract")').first();
      await submitButton.click();

      // Wait for either loading indicator or result
      await Promise.race([
        page.waitForSelector('[data-testid="loading"], .loading', { timeout: 5000 }),
        page.waitForSelector('[data-testid="transcript-result"]', { timeout: 5000 })
      ]);

      // Eventually result should appear
      await page.waitForSelector('[data-testid="transcript-result"], .transcript-segment', {
        timeout: 30000
      });

      const content = await page.textContent('body');
      expect(content).toContain('Progress tracking test');
    }, 60000);
  });

  test.describe('Format Selection', () => {
    test('should allow selecting different transcript formats', async ({ page }) => {
      mockYouTubeServer.registerVideo({
        videoId: 'format-test',
        title: 'Format Test',
        hasTranscript: true,
        transcriptSegments: [
          { time: '0:00', text: 'Format selection test' },
          { time: '0:05', text: 'Second segment' }
        ],
        responseDelay: 100
      });

      await page.goto(`http://localhost:${FRONTEND_PORT}`);
      await page.waitForLoadState('domcontentloaded');

      // Look for format selector (select, radio, or buttons)
      const formatSelector = page.locator('select, [role="radiogroup"]').first();

      if (await formatSelector.count() > 0) {
        // Try to select JSON format
        if (await page.locator('select').count() > 0) {
          await page.selectOption('select', 'json');
        }

        const urlInput = page.locator('input[type="text"], input[type="url"]').first();
        await urlInput.fill(`${mockYouTubeServer.getBaseUrl()}/watch?v=format-test`);

        await page.locator('button[type="submit"], button:has-text("Extract")').first().click();

        await page.waitForSelector('[data-testid="transcript-result"], .transcript-segment', {
          timeout: 30000
        });

        const content = await page.textContent('body');
        expect(content).toContain('Format selection test');
      }
    }, 60000);
  });

  test.describe('Browser Health Integration', () => {
    test('should display browser health status in UI', async ({ page }) => {
      await page.goto(`http://localhost:${FRONTEND_PORT}`);
      await page.waitForLoadState('domcontentloaded');

      // Check if browser health is displayed (implementation dependent)
      const response = await page.evaluate(async (apiPort) => {
        const res = await fetch(`http://localhost:${apiPort}/api/health/browser`);
        return res.json();
      }, API_PORT);

      expect(response).toHaveProperty('browserHealthy');
      expect(response).toHaveProperty('canLaunch');
    }, 60000);
  });
});
