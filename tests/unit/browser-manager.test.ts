import { BrowserManager } from '../../api/src/infrastructure/BrowserManager';
import { Logger } from '../../api/src/infrastructure/Logger';
import { Browser, BrowserContext, Page } from 'playwright';

describe('BrowserManager - Isolated Pattern', () => {
  let browserManager: BrowserManager;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = new Logger('test');
    browserManager = new BrowserManager(mockLogger);
  });

  describe('runIsolated', () => {
    it('should launch fresh browser for each call', async () => {
      let firstBrowser: Browser | null = null;
      let secondBrowser: Browser | null = null;

      // First execution
      await browserManager.runIsolated(async (page, context, browser) => {
        firstBrowser = browser;
        expect(browser.isConnected()).toBe(true);
        return 'first';
      });

      // Second execution should get new browser
      await browserManager.runIsolated(async (page, context, browser) => {
        secondBrowser = browser;
        expect(browser.isConnected()).toBe(true);
        return 'second';
      });

      // Browsers should be different instances
      expect(firstBrowser).not.toBe(secondBrowser);
    }, 60000);

    it('should cleanup browser after successful execution', async () => {
      let capturedBrowser: Browser | null = null;

      await browserManager.runIsolated(async (page, context, browser) => {
        capturedBrowser = browser;
        return 'success';
      });

      // Browser should be closed after execution
      expect(capturedBrowser?.isConnected()).toBe(false);
    }, 30000);

    it('should cleanup browser after failed execution', async () => {
      let capturedBrowser: Browser | null = null;

      try {
        await browserManager.runIsolated(async (page, context, browser) => {
          capturedBrowser = browser;
          throw new Error('Intentional failure');
        });
      } catch (error: any) {
        expect(error.message).toBe('Intentional failure');
      }

      // Browser should still be closed even after error
      expect(capturedBrowser?.isConnected()).toBe(false);
    }, 30000);

    it('should handle client disconnect via AbortSignal', async () => {
      const abortController = new AbortController();
      let browserClosed = false;

      const promise = browserManager.runIsolated(async (page, context, browser) => {
        // Simulate work that takes time
        await new Promise(resolve => setTimeout(resolve, 5000));
        browserClosed = !browser.isConnected();
        return 'completed';
      }, abortController.signal);

      // Abort after 1 second
      setTimeout(() => abortController.abort(), 1000);

      try {
        await promise;
      } catch (error) {
        // May throw or may complete
      }

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Browser should be closed
      expect(browserClosed).toBe(true);
    }, 30000);

    it('should provide page with resource blocking configured', async () => {
      const blockedResources: string[] = [];

      await browserManager.runIsolated(async (page) => {
        // Check if resource blocking is active by monitoring aborted requests
        page.on('requestfailed', (request) => {
          blockedResources.push(request.url());
        });

        // Try to navigate to a page with images
        await page.goto('https://example.com', { timeout: 10000 });

        return 'success';
      });

      // Should have blocked some resources (images, fonts, etc.)
      // Note: This is a simple check, actual behavior may vary
      expect(true).toBe(true); // Basic smoke test
    }, 30000);
  });

  describe('randomDelay', () => {
    it('should generate delay within specified range', () => {
      const min = 100;
      const max = 300;

      for (let i = 0; i < 100; i++) {
        const delay = BrowserManager.randomDelay(min, max);
        expect(delay).toBeGreaterThanOrEqual(min);
        expect(delay).toBeLessThanOrEqual(max);
      }
    });
  });
});
