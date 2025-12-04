import { TranscriptSegment } from '../domain/TranscriptSegment';
import { BrowserManager } from './BrowserManager';
import { Logger } from './Logger';
import { TranscriptExtractionStrategy } from './TranscriptExtractionStrategy';
import { wait } from './utils/async-helpers';

export class TranscriptExtractor {
  private browserManager: BrowserManager;
  private logger: Logger;
  private strategy: TranscriptExtractionStrategy;
  private maxRetries = 3;
  private timeout = 30000;

  constructor(browserManager: BrowserManager, logger: Logger) {
    this.browserManager = browserManager;
    this.logger = logger;
    this.strategy = new TranscriptExtractionStrategy(logger);
  }

  async extract(videoUrl: string, abortSignal?: AbortSignal): Promise<TranscriptSegment[]> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.maxRetries) {
      attempt++;
      this.logger.info(`Extraction attempt ${attempt}/${this.maxRetries}`);

      try {
        const transcript = await this.attemptExtraction(videoUrl, abortSignal);
        if (transcript && transcript.length > 0) {
          return transcript;
        }
      } catch (error: any) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt} failed: ${error.message}`);

        if (attempt < this.maxRetries) {
          await wait(2000 * attempt); // Progressive delay
        }
      }
    }

    throw new Error(
      `Failed to extract transcript after ${this.maxRetries} attempts: ${
        lastError?.message || 'Unknown error'
      }`
    );
  }

  private async attemptExtraction(videoUrl: string, abortSignal?: AbortSignal): Promise<TranscriptSegment[]> {
    // Use disposable browser instance via runIsolated
    return await this.browserManager.runIsolated(async (page) => {
      // Navigate to video
      this.logger.info(`Navigating to: ${videoUrl}`);
      await page.goto(videoUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeout
      });

      // Wait for page to be fully loaded (YouTube rate limiting protection)
      await page.waitForLoadState('domcontentloaded', { timeout: this.timeout });

      // Wait for page to be interactive
      await wait(BrowserManager.randomDelay(2000, 3000));

      // Attach page error listeners for debugging
      page.on('pageerror', (error) => {
        this.logger.error('Page JavaScript error', error);
      });

      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          this.logger.warn(`Page console [${msg.type()}]: ${msg.text()}`);
        }
      });

      // Try to expand description
      await this.strategy.expandDescription(page);

      // Open transcript panel
      await this.strategy.openTranscript(page);

      // Extract transcript segments
      const transcript = await this.strategy.extractTranscriptSegments(page);

      this.logger.info(`Successfully extracted ${transcript.length} segments`);
      return transcript;

    }, abortSignal);
  }
}
