import { Page } from 'playwright';
import { TranscriptSegment } from '../domain/TranscriptSegment';
import { BrowserPool } from './BrowserPool';
import { Logger } from './Logger';
import { wait } from './utils/async-helpers';
import { BrowserManager } from './BrowserManager';

/**
 * PooledTranscriptExtractor uses the BrowserPool for efficient batch extraction.
 * Instead of launching a new browser for each video, it reuses contexts from the pool.
 */
export class PooledTranscriptExtractor {
  private browserPool: BrowserPool;
  private logger: Logger;
  private maxRetries = 3;
  private timeout = 30000;

  constructor(browserPool: BrowserPool, logger: Logger) {
    this.browserPool = browserPool;
    this.logger = logger;
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
      await this.expandDescription(page);

      // Open transcript panel
      await this.openTranscript(page);

      // Extract transcript segments
      const transcript = await this.extractTranscriptSegments(page);

      this.logger.info(`Successfully extracted ${transcript.length} segments`, { videoUrl });
      return transcript;

    } finally {
      // Always release context back to pool
      await release();
    }
  }

  private async expandDescription(page: Page): Promise<void> {
    try {
      const showMoreSelectors = [
        'tp-yt-paper-button#expand',
        'button[aria-label*="Show more"]',
        'yt-formatted-string:text("Show more")',
        'tp-yt-paper-button[aria-expanded="false"]'
      ];

      for (const selector of showMoreSelectors) {
        const showMoreButton = page.locator(selector).first();
        if (await showMoreButton.isVisible({ timeout: 3000 })) {
          this.logger.info('Clicking "Show more" button');
          await showMoreButton.click({ delay: BrowserManager.randomDelay(100, 300) });
          await wait(BrowserManager.randomDelay(500, 1000));
          return;
        }
      }

      this.logger.info('No "Show more" button found or not needed');
    } catch (error) {
      this.logger.warn('Could not expand description, continuing anyway');
    }
  }

  private async openTranscript(page: Page): Promise<void> {
    const transcriptSelectors = [
      'button[aria-label*="transcript" i]',
      'button[aria-label*="Transcript" i]',
      'button[title*="transcript" i]',
      'button[title*="Transcript" i]',
      'yt-button-shape button:has-text("Show transcript")',
      'button:has-text("Show transcript")',
      '[aria-label="More actions"] + ytd-menu-popup-renderer button:has-text("transcript")',
      'ytd-menu-service-item-renderer:has-text("Show transcript")'
    ];

    // First, check if we need to open the three-dot menu
    const moreActionsButton = page.locator('button[aria-label="More actions"]').first();
    if (await moreActionsButton.isVisible({ timeout: 3000 })) {
      this.logger.info('Opening more actions menu');
      await moreActionsButton.click({ delay: BrowserManager.randomDelay(200, 400) });
      await wait(BrowserManager.randomDelay(500, 1000));
    }

    // Try to find and click transcript button
    let transcriptOpened = false;
    for (const selector of transcriptSelectors) {
      try {
        const transcriptButton = page.locator(selector).first();
        if (await transcriptButton.isVisible({ timeout: 2000 })) {
          this.logger.info(`Clicking transcript button: ${selector}`);
          await transcriptButton.click({ delay: BrowserManager.randomDelay(200, 500) });
          transcriptOpened = true;
          break;
        }
      } catch (error) {
        // Try next selector
      }
    }

    if (!transcriptOpened) {
      throw new Error('Could not find transcript button');
    }

    // Wait for transcript panel to appear
    await page.waitForSelector('ytd-transcript-segment-list-renderer, ytd-transcript-renderer', {
      timeout: 10000
    });

    this.logger.info('Transcript panel opened');
    await wait(BrowserManager.randomDelay(1000, 2000));
  }

  private async extractTranscriptSegments(page: Page): Promise<TranscriptSegment[]> {
    // Auto-scroll to load all segments
    await this.autoScrollTranscript(page);

    // Extract segments
    const segments = await page.evaluate(() => {
      const segmentElements = document.querySelectorAll(
        'ytd-transcript-segment-renderer, ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer'
      );

      const transcript: { time: string; text: string }[] = [];

      segmentElements.forEach((element) => {
        const timeElement = element.querySelector(
          '.segment-timestamp, .ytd-transcript-segment-renderer[slot="timestamp"], .cue-time'
        );
        const textElement = element.querySelector(
          '.segment-text, yt-formatted-string.ytd-transcript-segment-renderer, .cue yt-formatted-string'
        );

        if (!timeElement || !textElement) {
          const fullText = element.textContent?.trim() || '';
          const timeMatch = fullText.match(/^(\d+:\d+)/);
          if (timeMatch) {
            const time = timeMatch[1];
            const text = fullText.replace(timeMatch[0], '').trim();
            if (text) {
              transcript.push({ time, text });
            }
          }
        } else {
          const time = timeElement.textContent?.trim() || '';
          const text = textElement.textContent?.trim() || '';

          if (time && text) {
            transcript.push({ time, text });
          }
        }
      });

      return transcript;
    });

    if (segments.length === 0) {
      this.logger.warn('Primary extraction failed, trying alternative method');
      const alternativeSegments = await this.extractTranscriptAlternative(page);

      if (alternativeSegments.length === 0) {
        this.logger.error('Both extraction methods returned no segments');
        throw new Error('No transcript segments found after trying all extraction methods');
      }

      return alternativeSegments;
    }

    return segments;
  }

  private async extractTranscriptAlternative(page: Page): Promise<TranscriptSegment[]> {
    const segments = await page.evaluate(() => {
      const transcript: { time: string; text: string }[] = [];

      const containers = [
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"]',
        'ytd-transcript-renderer',
        '[aria-label*="Transcript"]'
      ];

      for (const containerSelector of containers) {
        const container = document.querySelector(containerSelector);
        if (container) {
          const items = container.querySelectorAll('[class*="cue"], [class*="segment"]');
          items.forEach((item) => {
            const text = item.textContent?.trim() || '';
            const timeMatch = text.match(/^(\d+:\d+)/);
            if (timeMatch) {
              const time = timeMatch[1];
              const content = text.replace(timeMatch[0], '').trim();
              if (content) {
                transcript.push({ time, text: content });
              }
            }
          });
          if (transcript.length > 0) break;
        }
      }

      return transcript;
    });

    return segments;
  }

  private async autoScrollTranscript(page: Page): Promise<void> {
    try {
      const transcriptContainer = await page.evaluateHandle(() => {
        const selectors = [
          'ytd-transcript-segment-list-renderer',
          'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"]',
          '[role="list"][class*="transcript"]'
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) return element;
        }

        return null;
      });

      if (transcriptContainer) {
        await page.evaluate((container: any) => {
          if (!container) return;

          return new Promise<void>((resolve) => {
            let totalHeight = 0;
            const distance = 400;
            const timer = setInterval(() => {
              const scrollHeight = container.scrollHeight;
              container.scrollBy(0, distance);
              totalHeight += distance;

              if (totalHeight >= scrollHeight - container.clientHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 200 + Math.random() * 200);

            setTimeout(() => {
              clearInterval(timer);
              resolve();
            }, 10000);
          });
        }, transcriptContainer);
      }
    } catch (error) {
      this.logger.warn('Auto-scroll failed, continuing with available segments');
    }
  }
}
