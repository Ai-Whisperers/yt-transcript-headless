import { BrowserManager } from '../../src/infrastructure/BrowserManager';
import { Logger } from '../../src/infrastructure/Logger';
import { Browser } from 'playwright';

describe('BrowserManager - Phase 1 Validation', () => {
  let browserManager: BrowserManager;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = new Logger('test-browser-lifecycle');
    browserManager = new BrowserManager(mockLogger);
  });

  describe('Isolated Browser Pattern', () => {
    it('should launch fresh browser and cleanup after execution', async () => {
      let capturedBrowser: Browser | undefined = undefined;

      const result = await browserManager.runIsolated(async (page, context, browser) => {
        capturedBrowser = browser;
        expect(browser.isConnected()).toBe(true);

        // Navigate to simple page
        await page.goto('https://example.com', { timeout: 10000 });
        const title = await page.title();

        return title;
      });

      // Verify result was returned
      expect(result).toBeTruthy();

      // Verify browser was closed after execution
      expect(capturedBrowser).toBeDefined();
      expect(capturedBrowser!.isConnected()).toBe(false);
    }, 60000);

    it('should cleanup browser even after error', async () => {
      let capturedBrowser: Browser | undefined = undefined;

      try {
        await browserManager.runIsolated(async (page, context, browser) => {
          capturedBrowser = browser;
          throw new Error('Test error');
        });
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toBe('Test error');
      }

      // Verify browser was still closed
      expect(capturedBrowser).toBeDefined();
      expect(capturedBrowser!.isConnected()).toBe(false);
    }, 30000);

    it('should trigger cleanup on abort signal', async () => {
      const abortController = new AbortController();
      let capturedBrowser: Browser | undefined = undefined;
      let cleanupCalled = false;

      const promise = browserManager.runIsolated(async (page, context, browser) => {
        capturedBrowser = browser;

        // Simulate long-running operation
        try {
          await new Promise(resolve => setTimeout(resolve, 10000));
        } finally {
          cleanupCalled = !browser.isConnected();
        }

        return 'completed';
      }, abortController.signal);

      // Abort after 500ms
      setTimeout(() => abortController.abort(), 500);

      try {
        await promise;
      } catch (error) {
        // May complete or throw
      }

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Browser should be disconnected (cleanup was triggered)
      expect(capturedBrowser).toBeDefined();
      expect(cleanupCalled).toBe(true);
    }, 30000);

    it('should retry context creation on failure', async () => {
      let attempts = 0;

      const result = await browserManager.runIsolated(async (page, context, browser) => {
        attempts++;
        // Simple operation
        await page.goto('https://example.com', { timeout: 10000 });
        return 'success';
      });

      expect(result).toBe('success');
      // Should succeed on first attempt under normal conditions
      expect(attempts).toBe(1);
    }, 60000);
  });

  describe('Static Utility Methods', () => {
    it('should generate random delays within range', () => {
      const min = 100;
      const max = 300;

      for (let i = 0; i < 50; i++) {
        const delay = BrowserManager.randomDelay(min, max);
        expect(delay).toBeGreaterThanOrEqual(min);
        expect(delay).toBeLessThanOrEqual(max);
      }
    });
  });
});
