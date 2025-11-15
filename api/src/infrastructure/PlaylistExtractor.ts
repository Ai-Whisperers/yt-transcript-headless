import { BrowserManager } from './BrowserManager';
import { Logger } from './Logger';

export interface PlaylistInfo {
  playlistId: string;
  playlistUrl: string;
  videoIds: string[];
  title?: string;
  videoCount: number;
}

export class PlaylistExtractor {
  private browserManager: BrowserManager;
  private logger: Logger;
  private timeout = 30000;

  constructor(browserManager: BrowserManager, logger: Logger) {
    this.browserManager = browserManager;
    this.logger = logger;
  }

  /**
   * Extract all video IDs from a YouTube playlist
   */
  async extractVideoIds(playlistUrl: string, abortSignal?: AbortSignal): Promise<PlaylistInfo> {
    this.logger.info('Extracting video IDs from playlist', { playlistUrl });

    return await this.browserManager.runIsolated(async (page) => {
      // Navigate to playlist page
      await page.goto(playlistUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeout
      });

      await page.waitForLoadState('domcontentloaded', { timeout: this.timeout });

      // Wait for playlist to load
      await page.waitForSelector('ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer', {
        timeout: 10000
      }).catch(() => {
        this.logger.warn('Playlist videos not found with primary selector');
      });

      // Auto-scroll to load all videos
      await this.autoScrollPlaylist(page);

      // Extract video IDs and playlist info
      const playlistInfo = await page.evaluate(() => {
        // Extract playlist ID from URL
        const url = new URL(window.location.href);
        const playlistId = url.searchParams.get('list') || '';

        // Extract playlist title
        const titleElement = document.querySelector('yt-formatted-string.ytd-playlist-header-renderer');
        const title = titleElement?.textContent?.trim() || undefined;

        // Extract video IDs from playlist
        const videoElements = document.querySelectorAll(
          'ytd-playlist-video-renderer a#video-title, ytd-playlist-panel-video-renderer a'
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
          playlistId,
          videoIds,
          title,
          videoCount: videoIds.length
        };
      });

      if (playlistInfo.videoIds.length === 0) {
        this.logger.warn('No videos found in playlist, trying alternative extraction');

        // Try alternative extraction method
        const altVideoIds = await this.extractVideoIdsAlternative(page);
        playlistInfo.videoIds = altVideoIds;
        playlistInfo.videoCount = altVideoIds.length;
      }

      this.logger.info('Successfully extracted playlist video IDs', {
        playlistId: playlistInfo.playlistId,
        videoCount: playlistInfo.videoCount
      });

      return {
        ...playlistInfo,
        playlistUrl
      };

    }, abortSignal);
  }

  /**
   * Alternative extraction method for different playlist layouts
   */
  private async extractVideoIdsAlternative(page: any): Promise<string[]> {
    return await page.evaluate(() => {
      const videoIds: string[] = [];
      const seenIds = new Set<string>();

      // Try different selectors
      const selectors = [
        'a[href*="/watch?v="]',
        'ytd-playlist-video-renderer',
        'ytd-playlist-panel-video-renderer'
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
   * Auto-scroll playlist to load all videos
   */
  private async autoScrollPlaylist(page: any): Promise<void> {
    try {
      this.logger.info('Auto-scrolling playlist to load all videos');

      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          let noChangeCount = 0;
          let lastHeight = document.body.scrollHeight;

          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, 500);
            totalHeight += 500;

            // Check if height changed
            if (scrollHeight === lastHeight) {
              noChangeCount++;
            } else {
              noChangeCount = 0;
              lastHeight = scrollHeight;
            }

            // Stop if no new content loaded after 3 scrolls
            if (noChangeCount >= 3) {
              clearInterval(timer);
              resolve();
            }

            // Timeout after 30 seconds
            if (totalHeight >= scrollHeight * 2) {
              clearInterval(timer);
              resolve();
            }
          }, 500);

          // Absolute timeout
          setTimeout(() => {
            clearInterval(timer);
            resolve();
          }, 30000);
        });
      });

      this.logger.info('Playlist auto-scroll completed');
    } catch (error: any) {
      this.logger.warn('Auto-scroll failed, continuing with loaded videos', {
        error: error.message
      });
    }
  }

  /**
   * Check if URL is a valid YouTube playlist URL
   */
  static isPlaylistUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const validHosts = ['www.youtube.com', 'youtube.com', 'm.youtube.com'];

      if (!validHosts.includes(parsedUrl.hostname)) {
        return false;
      }

      // Check for list parameter
      const listParam = parsedUrl.searchParams.get('list');
      return !!listParam && listParam.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Extract playlist ID from URL
   */
  static extractPlaylistId(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.searchParams.get('list');
    } catch {
      return null;
    }
  }
}
