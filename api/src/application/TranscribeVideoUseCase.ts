import {
  TranscriptRequest,
  TranscriptResponse,
  TranscriptFormat,
  TranscriptSegment
} from '../domain/TranscriptSegment';
import { TranscriptExtractor } from '../infrastructure/TranscriptExtractor';
import { ILogger } from '../domain/ILogger';
import {
  InvalidUrlError,
  TranscriptNotFoundError,
  ExtractionFailedError
} from '../domain/errors';

export class TranscribeVideoUseCase {
  private extractor: TranscriptExtractor;
  private logger: ILogger;

  constructor(extractor: TranscriptExtractor, logger: ILogger) {
    this.extractor = extractor;
    this.logger = logger;
  }

  async execute(request: TranscriptRequest, abortSignal?: AbortSignal): Promise<TranscriptResponse> {
    const startTime = Date.now();

    // Validate YouTube URL
    if (!this.isValidYouTubeUrl(request.url)) {
      throw new InvalidUrlError(request.url);
    }

    // Set default format if not provided
    const format = request.format || TranscriptFormat.JSON;

    // Log extraction attempt
    this.logger.info('Starting transcript extraction', {
      videoUrl: request.url,
      format
    });

    try {
      // Extract transcript using Playwright with abort signal
      const transcript = await this.extractor.extract(request.url, abortSignal);

      if (!transcript || transcript.length === 0) {
        throw new TranscriptNotFoundError(request.url);
      }

      // Format the response based on requested format
      const response: TranscriptResponse = {
        success: true,
        data: {
          transcript,
          format,
          videoUrl: request.url,
          extractedAt: new Date().toISOString()
        }
      };

      // Add formatted outputs based on format
      if (format === TranscriptFormat.SRT) {
        response.data.srt = this.formatAsSRT(transcript);
      } else if (format === TranscriptFormat.TEXT) {
        response.data.text = this.formatAsText(transcript);
      }

      const duration = Date.now() - startTime;
      this.logger.info('Successfully extracted transcript', {
        videoUrl: request.url,
        segmentCount: transcript.length,
        duration
      });

      return response;

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Re-throw known errors
      if (error instanceof InvalidUrlError || error instanceof TranscriptNotFoundError) {
        throw error;
      }

      // Wrap unknown errors
      this.logger.error('Extraction failed', error, {
        videoUrl: request.url,
        duration
      });

      throw new ExtractionFailedError(
        error.message || 'Failed to extract transcript',
        request.url,
        undefined,
        { originalError: error.name }
      );
    }
  }

  private isValidYouTubeUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const validHosts = ['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'];

      // In test environment, allow localhost URLs for mock server
      const isTestEnvironment = process.env.NODE_ENV === 'test';
      if (isTestEnvironment && parsedUrl.hostname === 'localhost') {
        // Skip validation for localhost mock servers in tests
        return true;
      }

      // Check if protocol is HTTP or HTTPS
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        this.logger.warn('Invalid protocol for YouTube URL', { url, protocol: parsedUrl.protocol });
        return false;
      }

      // Check if hostname is valid
      if (!validHosts.includes(parsedUrl.hostname)) {
        this.logger.warn('Invalid YouTube hostname', { url, hostname: parsedUrl.hostname });
        return false;
      }

      // Validate video ID presence and format
      const videoId = this.extractVideoId(parsedUrl);
      if (!videoId) {
        this.logger.warn('No video ID found in URL', { url });
        return false;
      }

      // Validate video ID format (YouTube IDs are 11 characters, alphanumeric + - and _)
      const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
      if (!videoIdRegex.test(videoId)) {
        this.logger.warn('Invalid video ID format', { url, videoId });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn('Failed to parse URL', { url, error });
      return false;
    }
  }

  private extractVideoId(parsedUrl: URL): string | null {
    // Handle youtu.be short URLs (e.g., https://youtu.be/VIDEO_ID)
    if (parsedUrl.hostname === 'youtu.be') {
      const videoId = parsedUrl.pathname.slice(1).split('?')[0];
      return videoId || null;
    }

    // Handle regular YouTube URLs (e.g., https://www.youtube.com/watch?v=VIDEO_ID)
    const videoId = parsedUrl.searchParams.get('v');
    if (videoId) {
      return videoId;
    }

    // Handle embed URLs (e.g., https://www.youtube.com/embed/VIDEO_ID)
    if (parsedUrl.pathname.startsWith('/embed/')) {
      const videoId = parsedUrl.pathname.split('/embed/')[1]?.split('?')[0];
      return videoId || null;
    }

    // Handle /v/ URLs (legacy format)
    if (parsedUrl.pathname.startsWith('/v/')) {
      const videoId = parsedUrl.pathname.split('/v/')[1]?.split('?')[0];
      return videoId || null;
    }

    return null;
  }

  private formatAsSRT(transcript: TranscriptSegment[]): string {
    return transcript.map((segment, index) => {
      const nextTime = transcript[index + 1]?.time || this.addSeconds(segment.time, 3);
      return `${index + 1}\n${this.timeToSRT(segment.time)} --> ${this.timeToSRT(nextTime)}\n${segment.text}\n`;
    }).join('\n');
  }

  private formatAsText(transcript: TranscriptSegment[]): string {
    return transcript.map(segment => `${segment.time} ${segment.text}`).join('\n');
  }

  private timeToSRT(time: string): string {
    // Convert MM:SS or HH:MM:SS to HH:MM:SS,mmm format
    const parts = time.split(':');

    if (parts.length === 2) {
      // Format is MM:SS
      const totalMinutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const hh = hours.toString().padStart(2, '0');
      const mm = minutes.toString().padStart(2, '0');
      const ss = seconds.toString().padStart(2, '0');
      return `${hh}:${mm}:${ss},000`;
    } else if (parts.length === 3) {
      // Format is already HH:MM:SS
      const [hours, minutes, seconds] = parts;
      const hh = hours.padStart(2, '0');
      const mm = minutes.padStart(2, '0');
      const ss = seconds.padStart(2, '0');
      return `${hh}:${mm}:${ss},000`;
    }
    return `00:00:00,000`;
  }

  private addSeconds(time: string, seconds: number): string {
    const parts = time.split(':');
    if (parts.length === 2) {
      // Format is MM:SS
      const totalSeconds = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + seconds;
      const mm = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      const ss = (totalSeconds % 60).toString().padStart(2, '0');
      return `${mm}:${ss}`;
    } else if (parts.length === 3) {
      // Format is HH:MM:SS
      const totalSeconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10) + seconds;
      const hh = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
      const mm = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
      const ss = (totalSeconds % 60).toString().padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }
    return '00:03';
  }
}