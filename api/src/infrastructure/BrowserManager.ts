import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Logger } from './Logger';
import { metricsCollector } from './middleware/observability';
import { wait } from './utils/async-helpers';

export class BrowserManager {
  private logger: Logger;
  private stealthEnabled: boolean;

  constructor(logger: Logger) {
    this.logger = logger;
    // Feature flag for stealth techniques (default: true for backward compatibility)
    this.stealthEnabled = process.env.ENABLE_STEALTH !== 'false';
    this.logger.info('BrowserManager initialized', {
      stealthEnabled: this.stealthEnabled
    });
  }

  /**
   * Run a callback inside an isolated, disposable browser instance.
   * The browser always dies after the callback (success OR failure).
   *
   * @param work - Async callback that receives page, context, and browser
   * @param abortSignal - Optional signal to abort and kill browser on client disconnect
   * @returns Result of the work callback
   */
  async runIsolated<T>(
    work: (page: Page, context: BrowserContext, browser: Browser) => Promise<T>,
    abortSignal?: AbortSignal
  ): Promise<T> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    const cleanup = async () => {
      this.logger.info('Starting browser cleanup');
      try {
        if (page) {
          await page.close().catch((err) => {
            this.logger.warn('Failed to close page', err);
            metricsCollector.recordBrowserCleanupFailure();
          });
        }
        if (context) {
          await context.close().catch((err) => {
            this.logger.warn('Failed to close context', err);
            metricsCollector.recordBrowserCleanupFailure();
          });
        }
      } finally {
        if (browser) {
          await browser.close().catch((err) => {
            this.logger.error('Failed to close browser', err);
            metricsCollector.recordBrowserCleanupFailure();
          });
        }
        this.logger.info('Browser cleanup completed');
      }
    };

    // Kill browser if request aborted (client disconnected)
    const abortHandler = () => {
      this.logger.warn('Request aborted by client - killing browser');
      cleanup().catch((err) => {
        this.logger.error('Cleanup failed after abort', err);
      });
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', abortHandler);
    }

    try {
      // Launch fresh browser instance
      this.logger.info('Launching fresh browser instance');
      const launchStart = Date.now();
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-size=1920,1080',
          '--start-maximized',
          '--disable-web-security',
          '--allow-running-insecure-content',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process'
        ],
      });
      const launchDuration = Date.now() - launchStart;
      metricsCollector.recordBrowserLaunch(launchDuration);
      this.logger.info('Browser launched', { launchDurationMs: launchDuration });

      // Create context with retry wrapper
      context = await this.createContextWithRetry(browser, 3);

      // Create page
      page = await context.newPage();

      // Attach crash listeners
      page.on('crash', () => {
        this.logger.error('Page crashed during extraction');
      });

      page.on('close', () => {
        this.logger.warn('Page closed unexpectedly');
      });

      context.on('close', () => {
        this.logger.warn('Context closed unexpectedly');
      });

      // Apply resource blocking
      await page.route('**/*.{png,jpg,jpeg,webp,svg,gif,ico,woff,woff2,ttf,eot}', route => route.abort());
      await page.route('**/{ads,analytics,tracking}/**', route => route.abort());

      // Execute the work callback
      this.logger.info('Executing work callback in isolated browser');
      return await work(page, context, browser);

    } catch (err: any) {
      this.logger.error('BrowserManager.runIsolated error', err);
      throw err;
    } finally {
      // Always cleanup, regardless of success or failure
      if (abortSignal) {
        abortSignal.removeEventListener('abort', abortHandler);
      }
      await cleanup();
    }
  }

  /**
   * Create browser context with retry logic for stability
   * Handles intermittent "Target closed" errors during context creation
   */
  private async createContextWithRetry(browser: Browser, maxRetries: number): Promise<BrowserContext> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      attempt++;
      try {
        this.logger.info(`Creating browser context (attempt ${attempt}/${maxRetries})`);

        const context = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          locale: 'en-US',
          timezoneId: 'America/New_York',
          permissions: ['geolocation'],
          geolocation: { latitude: 40.7128, longitude: -74.0060 },
          extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
        });

        // Apply stealth techniques (conditional based on feature flag)
        if (this.stealthEnabled) {
          await this.applyStealth(context);
          this.logger.info('Stealth techniques applied');
        } else {
          this.logger.info('Stealth techniques disabled (raw Chromium mode)');
        }

        this.logger.info('Browser context created successfully');
        return context;

      } catch (error: any) {
        lastError = error;
        this.logger.warn(`Context creation attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          metricsCollector.recordExtractionRetry();
          const delay = 2000 * attempt; // Progressive delay (2000ms per standard)
          this.logger.info(`Retrying context creation in ${delay}ms`);
          await wait(delay);
        }
      }
    }

    throw new Error(
      `Failed to create browser context after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Apply stealth techniques to avoid detection
   */
  private async applyStealth(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
      // Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' }
        ],
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Mock chrome object
      (window as any).chrome = {
        runtime: {},
        app: {
          InstallState: {
            DISABLED: 'disabled',
            INSTALLED: 'installed',
            NOT_INSTALLED: 'not_installed'
          },
          RunningState: {
            CANNOT_RUN: 'cannot_run',
            READY_TO_RUN: 'ready_to_run',
            RUNNING: 'running'
          }
        },
        webstore: {}
      };

      // Remove Playwright traces
      delete (window as any).__playwright__;
      delete (window as any).__playwright;
      delete (window as any).__playwrightInit;

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: 'prompt' } as PermissionStatus);
        }
        return originalQuery(parameters);
      };

      // Fix window.navigator getter issues
      const navigatorProxy = new Proxy(navigator, {
        has: () => true,
        get: (target: any, prop) => {
          if (prop === 'webdriver') return false;
          return target[prop];
        }
      });

      Object.defineProperty(window, 'navigator', {
        get: () => navigatorProxy,
        configurable: false
      });
    });
  }

  /**
   * Generate random delay for human-like behavior
   */
  static randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
