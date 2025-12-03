import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Logger } from './Logger';
import { metricsCollector } from './middleware/observability';
import { wait } from './utils/async-helpers';

export interface PooledContext {
  context: BrowserContext;
  inUse: boolean;
  createdAt: number;
  useCount: number;
}

export interface BrowserPoolStats {
  browserActive: boolean;
  totalContexts: number;
  availableContexts: number;
  inUseContexts: number;
  waitingRequests: number;
  totalAcquisitions: number;
  totalReleases: number;
}

/**
 * BrowserPool manages a pool of reusable browser contexts for efficient batch processing.
 * Instead of launching a new browser for each extraction, contexts are reused from the pool.
 *
 * Key features:
 * - Single browser instance with multiple contexts
 * - Configurable pool size (concurrency limit)
 * - Automatic context cleanup and recycling
 * - Graceful shutdown support
 */
export class BrowserPool {
  private browser: Browser | null = null;
  private contexts: PooledContext[] = [];
  private waitQueue: Array<{
    resolve: (ctx: PooledContext) => void;
    reject: (err: Error) => void;
    timeoutId: NodeJS.Timeout;
  }> = [];

  private readonly maxContexts: number;
  private readonly maxContextAge: number;
  private readonly maxContextUses: number;
  private readonly acquireTimeout: number;
  private readonly stealthEnabled: boolean;
  private logger: Logger;
  private isShuttingDown: boolean = false;

  // Statistics
  private stats = {
    totalAcquisitions: 0,
    totalReleases: 0
  };

  constructor(options: {
    maxContexts?: number;
    maxContextAge?: number;
    maxContextUses?: number;
    acquireTimeout?: number;
    logger?: Logger;
  } = {}) {
    this.maxContexts = options.maxContexts || parseInt(process.env.POOL_MAX_CONTEXTS || '5', 10);
    this.maxContextAge = options.maxContextAge || parseInt(process.env.POOL_CONTEXT_MAX_AGE || '300000', 10); // 5 min
    this.maxContextUses = options.maxContextUses || parseInt(process.env.POOL_CONTEXT_MAX_USES || '10', 10);
    this.acquireTimeout = options.acquireTimeout || parseInt(process.env.POOL_ACQUIRE_TIMEOUT || '30000', 10);
    this.stealthEnabled = process.env.ENABLE_STEALTH !== 'false';
    this.logger = options.logger || new Logger('browser-pool');

    this.logger.info('BrowserPool initialized', {
      maxContexts: this.maxContexts,
      maxContextAge: this.maxContextAge,
      maxContextUses: this.maxContextUses,
      acquireTimeout: this.acquireTimeout,
      stealthEnabled: this.stealthEnabled
    });
  }

  /**
   * Initialize the browser instance
   */
  async initialize(): Promise<void> {
    if (this.browser) {
      this.logger.warn('Browser already initialized');
      return;
    }

    this.logger.info('Launching browser for pool');
    const launchStart = Date.now();

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

    const launchDuration = Date.now() - launchStart;
    metricsCollector.recordBrowserLaunch(launchDuration);
    this.logger.info('Browser launched for pool', { launchDurationMs: launchDuration });

    // Handle browser disconnect
    this.browser.on('disconnected', () => {
      this.logger.warn('Browser disconnected unexpectedly');
      this.browser = null;
      this.contexts = [];
    });
  }

  /**
   * Acquire a context from the pool
   * Returns an existing available context or creates a new one if pool has capacity
   */
  async acquire(): Promise<{ context: BrowserContext; page: Page; release: () => Promise<void> }> {
    if (this.isShuttingDown) {
      throw new Error('Pool is shutting down');
    }

    // Initialize browser if needed
    if (!this.browser) {
      await this.initialize();
    }

    this.stats.totalAcquisitions++;

    // Try to find an available context
    let pooledContext = this.findAvailableContext();

    if (!pooledContext) {
      // No available context - either create new or wait
      if (this.contexts.length < this.maxContexts) {
        pooledContext = await this.createPooledContext();
      } else {
        // Pool is full, wait for a context to become available
        pooledContext = await this.waitForContext();
      }
    }

    pooledContext.inUse = true;
    pooledContext.useCount++;

    // Create a new page in the context
    const page = await pooledContext.context.newPage();

    // Apply resource blocking
    await page.route('**/*.{png,jpg,jpeg,webp,svg,gif,ico,woff,woff2,ttf,eot}', route => route.abort());
    await page.route('**/{ads,analytics,tracking}/**', route => route.abort());

    this.logger.info('Context acquired from pool', {
      useCount: pooledContext.useCount,
      totalContexts: this.contexts.length,
      availableContexts: this.contexts.filter(c => !c.inUse).length
    });

    // Create release function
    const release = async () => {
      await this.release(pooledContext!, page);
    };

    return { context: pooledContext.context, page, release };
  }

  /**
   * Release a context back to the pool
   */
  private async release(pooledContext: PooledContext, page: Page): Promise<void> {
    this.stats.totalReleases++;

    try {
      // Close the page
      await page.close().catch(() => {});

      // Check if context should be recycled
      const shouldRecycle =
        pooledContext.useCount >= this.maxContextUses ||
        Date.now() - pooledContext.createdAt > this.maxContextAge;

      if (shouldRecycle) {
        this.logger.info('Recycling context', {
          useCount: pooledContext.useCount,
          age: Date.now() - pooledContext.createdAt
        });
        await this.removeContext(pooledContext);
      } else {
        pooledContext.inUse = false;
      }

      // Process waiting requests
      this.processWaitQueue();

    } catch (error: any) {
      this.logger.error('Error releasing context', error);
      await this.removeContext(pooledContext);
    }

    this.logger.info('Context released to pool', {
      totalContexts: this.contexts.length,
      availableContexts: this.contexts.filter(c => !c.inUse).length
    });
  }

  /**
   * Find an available context in the pool
   */
  private findAvailableContext(): PooledContext | null {
    return this.contexts.find(c => !c.inUse) || null;
  }

  /**
   * Create a new pooled context
   */
  private async createPooledContext(): Promise<PooledContext> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    this.logger.info('Creating new pooled context', {
      currentContexts: this.contexts.length,
      maxContexts: this.maxContexts
    });

    const context = await this.browser.newContext({
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
    if (this.stealthEnabled) {
      await this.applyStealth(context);
    }

    const pooledContext: PooledContext = {
      context,
      inUse: false,
      createdAt: Date.now(),
      useCount: 0
    };

    this.contexts.push(pooledContext);
    return pooledContext;
  }

  /**
   * Wait for a context to become available
   */
  private waitForContext(): Promise<PooledContext> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.waitQueue.findIndex(w => w.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error('Timeout waiting for available context'));
      }, this.acquireTimeout);

      this.waitQueue.push({ resolve, reject, timeoutId });

      this.logger.info('Request queued for context', {
        waitingRequests: this.waitQueue.length
      });
    });
  }

  /**
   * Process the wait queue when a context becomes available
   */
  private async processWaitQueue(): Promise<void> {
    if (this.waitQueue.length === 0) return;

    const availableContext = this.findAvailableContext();
    if (availableContext) {
      const waiter = this.waitQueue.shift();
      if (waiter) {
        clearTimeout(waiter.timeoutId);
        waiter.resolve(availableContext);
      }
    } else if (this.contexts.length < this.maxContexts) {
      // Create new context for waiting request
      try {
        const newContext = await this.createPooledContext();
        const waiter = this.waitQueue.shift();
        if (waiter) {
          clearTimeout(waiter.timeoutId);
          waiter.resolve(newContext);
        }
      } catch (error: any) {
        const waiter = this.waitQueue.shift();
        if (waiter) {
          clearTimeout(waiter.timeoutId);
          waiter.reject(error);
        }
      }
    }
  }

  /**
   * Remove a context from the pool
   */
  private async removeContext(pooledContext: PooledContext): Promise<void> {
    const index = this.contexts.indexOf(pooledContext);
    if (index !== -1) {
      this.contexts.splice(index, 1);
    }

    try {
      await pooledContext.context.close();
    } catch (error: any) {
      this.logger.warn('Error closing context', { error: error.message });
    }
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
    });
  }

  /**
   * Get pool statistics
   */
  getStats(): BrowserPoolStats {
    return {
      browserActive: this.browser !== null,
      totalContexts: this.contexts.length,
      availableContexts: this.contexts.filter(c => !c.inUse).length,
      inUseContexts: this.contexts.filter(c => c.inUse).length,
      waitingRequests: this.waitQueue.length,
      totalAcquisitions: this.stats.totalAcquisitions,
      totalReleases: this.stats.totalReleases
    };
  }

  /**
   * Graceful shutdown - close all contexts and browser
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.info('Shutting down browser pool');

    // Reject all waiting requests
    for (const waiter of this.waitQueue) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(new Error('Pool is shutting down'));
    }
    this.waitQueue = [];

    // Close all contexts
    for (const pooledContext of this.contexts) {
      try {
        await pooledContext.context.close();
      } catch (error: any) {
        this.logger.warn('Error closing context during shutdown', { error: error.message });
      }
    }
    this.contexts = [];

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error: any) {
        this.logger.warn('Error closing browser during shutdown', { error: error.message });
      }
      this.browser = null;
    }

    this.logger.info('Browser pool shutdown complete');
  }

  /**
   * Check if pool is healthy
   */
  isHealthy(): boolean {
    return this.browser !== null && !this.isShuttingDown;
  }
}

// Singleton instance for shared pool
let sharedPool: BrowserPool | null = null;

export function getSharedBrowserPool(logger?: Logger): BrowserPool {
  if (!sharedPool) {
    sharedPool = new BrowserPool({ logger });
  }
  return sharedPool;
}

export async function shutdownSharedPool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.shutdown();
    sharedPool = null;
  }
}
