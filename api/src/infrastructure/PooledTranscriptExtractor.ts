import { TranscriptSegment } from '../domain/TranscriptSegment';
import { BrowserPool } from './BrowserPool';
import { Logger } from './Logger';
import { TranscriptExtractionStrategy } from './TranscriptExtractionStrategy';
import { wait } from './utils/async-helpers';
import { BrowserManager } from './BrowserManager';

/**
 * PooledTranscriptExtractor uses the BrowserPool for efficient batch extraction.
 * Instead of launching a new browser for each video, it reuses contexts from the pool.
 */
export class PooledTranscriptExtractor {
  private browserPool: BrowserPool;
  private logger: Logger;
  private strategy: TranscriptExtractionStrategy;
  private maxRetries = 3;
  private timeout = 30000;

  constructor(browserPool: BrowserPool, logger: Logger) {
    this.browserPool = browserPool;
    this.logger = logger;
    this.strategy = new TranscriptExtractionStrategy(logger);
  }

  /**
   * Extract transcript using a pooled browser context
   */
  async extract(videoUrl: string, abortSignal?: AbortSignal): Promise<TranscriptSegment[]> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.maxRetries) {
      attempt++;
      this.logger.info(`Pooled extraction attempt ${attempt}/${this.maxRetries}`, { videoUrl });

      try {
        const transcript = await this.attemptExtraction(videoUrl, abortSignal);
        if (transcript && transcript.length > 0) {
          return transcript;
        }
      } catch (error: any) {
        lastError = error;
        this.logger.warn(`Pooled extraction attempt ${attempt} failed: ${error.message}`, { videoUrl });

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
    // Acquire context from pool
    const { page, release } = await this.browserPool.acquire();

    try {
      // Check if aborted before starting
      if (abortSignal?.aborted) {
        throw new Error('Extraction aborted');
      }

      // Navigate to video
      this.logger.info(`Navigating to: ${videoUrl}`);
      await page.goto(videoUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeout
      });

      await page.waitForLoadState('domcontentloaded', { timeout: this.timeout });

      // Wait for page to be interactive
      await wait(BrowserManager.randomDelay(2000, 3000));

      // Try to expand description
      await this.strategy.expandDescription(page);

      // Open transcript panel
      await this.strategy.openTranscript(page);

      // Extract transcript segments
      const transcript = await this.strategy.extractTranscriptSegments(page);

      this.logger.info(`Successfully extracted ${transcript.length} segments`, { videoUrl });
      return transcript;

    } finally {
      // Always release context back to pool
      await release();
    }
  }
}
