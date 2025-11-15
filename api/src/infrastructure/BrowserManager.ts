import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Logger } from './Logger';

export class BrowserManager {
  private browser: Browser | null = null;
  private logger: Logger | null = null;

  constructor(logger?: Logger) {
    this.logger = logger || null;
  }

  async launch(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      this.logger?.info('Reusing existing browser instance');
      return this.browser;
    }

    // Reset browser if it was closed/disconnected
    if (this.browser) {
      this.logger?.warn('Browser was disconnected, relaunching...');
      this.browser = null;
    }

    this.logger?.info('Launching new browser instance');
    this.browser = await chromium.launch({
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

    return this.browser;
  }

  async createContext(): Promise<BrowserContext> {
    const browser = await this.launch();

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

    // Apply stealth techniques
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

    return context;
  }

  async createPage(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();

    // Block unnecessary resources for faster loading
    await page.route('**/*.{png,jpg,jpeg,webp,svg,gif,ico,woff,woff2,ttf,eot}', route => route.abort());
    await page.route('**/{ads,analytics,tracking}/**', route => route.abort());

    return page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Generate random delay for human-like behavior
   */
  static randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Auto-scroll implementation for dynamic content loading
   */
  static async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 800;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 300 + Math.random() * 400);
      });
    });
  }
}