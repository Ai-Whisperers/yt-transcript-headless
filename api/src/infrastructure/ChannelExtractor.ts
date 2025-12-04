import { BrowserManager } from './BrowserManager';
import { Logger } from './Logger';

export interface ChannelInfo {
  channelId: string;
  channelUrl: string;
  channelHandle?: string;
  videoIds: string[];
  title?: string;
  videoCount: number;
}

/**
 * ChannelExtractor handles extraction of all video IDs from a YouTube channel.
 * Supports various channel URL formats:
 * - https://www.youtube.com/@username
 * - https://www.youtube.com/@username/videos
 * - https://www.youtube.com/channel/UCxxx
 * - https://www.youtube.com/c/ChannelName
 *
 * Extracts videos in chronological order (newest first, YouTube's default sorting)
 */
export class ChannelExtractor {
  private browserManager: BrowserManager;
  private logger: Logger;
  private timeout = 30000;

  constructor(browserManager: BrowserManager, logger: Logger) {
    this.browserManager = browserManager;
    this.logger = logger;
  }

  /**
   * Extract all video IDs from a YouTube channel
   */
  async extractVideoIds(channelUrl: string, abortSignal?: AbortSignal): Promise<ChannelInfo> {
    this.logger.info('Extracting video IDs from channel', { channelUrl });

    return await this.browserManager.runIsolated(async (page) => {
      // Normalize URL to /videos page
      const videosUrl = this.normalizeToVideosPage(channelUrl);

      // Navigate to channel videos page
      await page.goto(videosUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeout
      });

      await page.waitForLoadState('domcontentloaded', { timeout: this.timeout });

      // Wait for videos to load
      await page.waitForSelector('ytd-rich-item-renderer, ytd-grid-video-renderer', {
        timeout: 10000
      }).catch(() => {
        this.logger.warn('Channel videos not found with primary selector');
      });

      // Auto-scroll to load all videos
      await this.autoScrollChannel(page);

      // Extract video IDs and channel info
      const channelInfo = await page.evaluate(() => {
        // Extract channel handle/ID from URL or page
        const url = new URL(window.location.href);
        let channelId = '';
        let channelHandle = '';

        // Try to get from URL path
        const pathParts = url.pathname.split('/').filter(p => p);
        if (pathParts[0] === 'channel') {
          channelId = pathParts[1] || '';
        } else if (pathParts[0] === 'c') {
          channelId = pathParts[1] || '';
        } else if (pathParts[0]?.startsWith('@')) {
          channelHandle = pathParts[0];
          channelId = channelHandle;
        }

        // Extract channel title
        const titleElement = document.querySelector('yt-formatted-string#text.ytd-channel-name') ||
                            document.querySelector('#channel-name yt-formatted-string');
        const title = titleElement?.textContent?.trim() || undefined;

        // Extract video IDs from channel videos grid
        // YouTube uses different renderers for channel pages
        const videoElements = document.querySelectorAll(
          'ytd-rich-item-renderer a#video-title-link, ' +
          'ytd-grid-video-renderer a#video-title, ' +
          'ytd-video-renderer a#video-title'
        );

        const videoIds: string[] = [];
        const seenIds = new Set<string>();

        videoElements.forEach((element) => {
          const href = element.getAttribute('href');
          if (href) {
            // Extract video ID from href (format: /watch?v=VIDEO_ID)
            const match = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            if (match && match[1] && !seenIds.has(match[1])) {
              videoIds.push(match[1]);
              seenIds.add(match[1]);
            }
          }
        });

        return {
          channelId,
          channelHandle,
          videoIds,
          title,
          videoCount: videoIds.length
        };
      });

      if (channelInfo.videoIds.length === 0) {
        this.logger.warn('No videos found in channel, trying alternative extraction');

        // Try alternative extraction method
        const altVideoIds = await this.extractVideoIdsAlternative(page);
        channelInfo.videoIds = altVideoIds;
        channelInfo.videoCount = altVideoIds.length;
      }

      this.logger.info('Successfully extracted channel video IDs', {
        channelId: channelInfo.channelId,
        channelHandle: channelInfo.channelHandle,
        videoCount: channelInfo.videoCount
      });

      return {
        ...channelInfo,
        channelUrl
      };

    }, abortSignal);
  }

  /**
   * Alternative extraction method for different channel layouts
   */
  private async extractVideoIdsAlternative(page: any): Promise<string[]> {
    return await page.evaluate(() => {
      const videoIds: string[] = [];
      const seenIds = new Set<string>();

      // Try different selectors for various YouTube layouts
      const selectors = [
        'a[href*="/watch?v="]',
        'ytd-rich-item-renderer',
        'ytd-grid-video-renderer',
        'ytd-video-renderer'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);

        elements.forEach((element) => {
          const href = element.getAttribute('href') ||
                      element.querySelector('a')?.getAttribute('href');

          if (href) {
            const match = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            if (match && match[1] && !seenIds.has(match[1])) {
              videoIds.push(match[1]);
              seenIds.add(match[1]);
            }
          }
        });

        if (videoIds.length > 0) {
          break;
        }
      }

      return videoIds;
    });
  }

  /**
   * Auto-scroll channel page to load all videos
   * YouTube's infinite scroll requires scrolling to load more content
   */
  private async autoScrollChannel(page: any): Promise<void> {
    try {
      this.logger.info('Auto-scrolling channel to load all videos');

      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          let noChangeCount = 0;
          let lastHeight = document.body.scrollHeight;
          const maxScrollAttempts = 100; // Prevent infinite loops
          let scrollAttempts = 0;

          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, 500);
            totalHeight += 500;
            scrollAttempts++;

            // Check if height changed
            if (scrollHeight === lastHeight) {
              noChangeCount++;
            } else {
              noChangeCount = 0;
              lastHeight = scrollHeight;
            }

            // Stop if no new content loaded after 5 scrolls
            if (noChangeCount >= 5) {
              clearInterval(timer);
              resolve();
            }

            // Stop if reached max scroll attempts
            if (scrollAttempts >= maxScrollAttempts) {
              clearInterval(timer);
              resolve();
            }

            // Timeout after scrolling 2x the initial height
            if (totalHeight >= scrollHeight * 2) {
              clearInterval(timer);
              resolve();
            }
          }, 500);

          // Absolute timeout (60 seconds for channels with many videos)
          setTimeout(() => {
            clearInterval(timer);
            resolve();
          }, 60000);
        });
      });

      this.logger.info('Channel auto-scroll completed');
    } catch (error: any) {
      this.logger.warn('Auto-scroll failed, continuing with loaded videos', {
        error: error.message
      });
    }
  }

  /**
   * Normalize channel URL to /videos page
   */
  private normalizeToVideosPage(url: string): string {
    try {
      const parsedUrl = new URL(url);

      // If already ends with /videos, return as is
      if (parsedUrl.pathname.endsWith('/videos')) {
        return url;
      }

      // Remove trailing slash
      let pathname = parsedUrl.pathname.replace(/\/$/, '');

      // Add /videos
      pathname += '/videos';

      parsedUrl.pathname = pathname;
      return parsedUrl.toString();
    } catch {
      // If URL parsing fails, try simple string manipulation
      const normalized = url.replace(/\/$/, '');
      return normalized.endsWith('/videos') ? normalized : `${normalized}/videos`;
    }
  }

  /**
   * Check if URL is a valid YouTube channel URL
   */
  static isChannelUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const validHosts = ['www.youtube.com', 'youtube.com', 'm.youtube.com'];

      if (!validHosts.includes(parsedUrl.hostname)) {
        return false;
      }

      const path = parsedUrl.pathname;

      // Check for various channel URL formats
      return (
        path.startsWith('/@') ||           // @username
        path.startsWith('/channel/') ||    // /channel/UCxxx
        path.startsWith('/c/') ||          // /c/ChannelName
        path.startsWith('/user/')          // /user/username (legacy)
      );
    } catch {
      return false;
    }
  }

  /**
   * Extract channel identifier from URL
   */
  static extractChannelIdentifier(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/').filter(p => p);

      if (pathParts.length > 0) {
        // Return first path component (e.g., "@username", "UCxxx", etc.)
        return pathParts[0];
      }

      return null;
    } catch {
      return null;
    }
  }
}
