import { Page } from 'playwright';
import { TranscriptSegment } from '../domain/TranscriptSegment';
import { Logger } from './Logger';
import { BrowserManager } from './BrowserManager';
import { wait } from './utils/async-helpers';

/**
 * TranscriptExtractionStrategy encapsulates the core transcript extraction logic.
 * This strategy is shared between TranscriptExtractor and PooledTranscriptExtractor
 * to eliminate code duplication and provide a single source of truth for extraction.
 *
 * Features:
 * - Multiple selector strategies for YouTube layout changes
 * - Auto-scroll for complete transcript loading
 * - Primary and alternative extraction methods
 * - Human-like interaction delays
 * - Robust error handling with fallbacks
 */
export class TranscriptExtractionStrategy {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Expand video description if "Show more" button is present
   * Tries multiple selector strategies for different YouTube layouts
   */
  async expandDescription(page: Page): Promise<void> {
    try {
      // Try different selectors for "Show more" button
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

  /**
   * Open transcript panel using multiple selector strategies
   * Handles both direct button access and menu-based access
   */
  async openTranscript(page: Page): Promise<void> {
    // Multiple selector strategies for transcript button
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

  /**
   * Extract transcript segments from the page
   * Uses auto-scroll to load all segments, then extracts them
   * Falls back to alternative method if primary extraction fails
   */
  async extractTranscriptSegments(page: Page): Promise<TranscriptSegment[]> {
    // Auto-scroll to load all segments
    await this.autoScrollTranscript(page);

    // Extract segments
    const segments = await page.evaluate(() => {
      const segmentElements = document.querySelectorAll(
        'ytd-transcript-segment-renderer, ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer'
      );

      const transcript: { time: string; text: string }[] = [];

      segmentElements.forEach((element) => {
        // Try different selectors for time and text
        const timeElement = element.querySelector(
          '.segment-timestamp, .ytd-transcript-segment-renderer[slot="timestamp"], .cue-time'
        );
        const textElement = element.querySelector(
          '.segment-text, yt-formatted-string.ytd-transcript-segment-renderer, .cue yt-formatted-string'
        );

        if (!timeElement || !textElement) {
          // Try alternative structure
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
      // Try alternative extraction method
      this.logger.warn('Primary extraction failed, trying alternative method');
      const alternativeSegments = await this.extractTranscriptAlternative(page);

      // Validate that alternative extraction returned segments
      if (alternativeSegments.length === 0) {
        this.logger.error('Both primary and alternative extraction methods returned no segments');
        throw new Error('No transcript segments found after trying all extraction methods');
      }

      return alternativeSegments;
    }

    return segments;
  }

  /**
   * Alternative extraction method for different YouTube layouts
   * Tries multiple container selectors and parsing strategies
   */
  async extractTranscriptAlternative(page: Page): Promise<TranscriptSegment[]> {
    // Alternative extraction for different YouTube layouts
    const segments = await page.evaluate(() => {
      const transcript: { time: string; text: string }[] = [];

      // Try to find transcript in different container
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

  /**
   * Auto-scroll transcript container to load all segments
   * Uses promise-based scrolling with timeout protection
   */
  async autoScrollTranscript(page: Page): Promise<void> {
    try {
      // Find transcript container
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
        // Scroll within the transcript container
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

            // Timeout after 10 seconds
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
