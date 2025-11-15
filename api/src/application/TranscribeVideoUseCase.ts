import {
  TranscriptRequest,
  TranscriptResponse,
  TranscriptFormat,
  TranscriptSegment
} from '../domain/TranscriptSegment';
import { TranscriptExtractor } from '../infrastructure/TranscriptExtractor';
import { Logger } from '../infrastructure/Logger';
import {
  InvalidUrlError,
  TranscriptNotFoundError,
  ExtractionFailedError
} from '../domain/errors';

export class TranscribeVideoUseCase {
  private extractor: TranscriptExtractor;
  private logger: Logger;

  constructor(extractor: TranscriptExtractor, logger: Logger) {
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
      return validHosts.includes(parsedUrl.hostname);
    } catch {
      return false;
    }
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
    // Convert MM:SS to HH:MM:SS,mmm format
    const parts = time.split(':');
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      const mm = minutes.padStart(2, '0');
      const ss = seconds.padStart(2, '0');
      return `00:${mm}:${ss},000`;
    }
    return `00:00:00,000`;
  }

  private addSeconds(time: string, seconds: number): string {
    const parts = time.split(':');
    if (parts.length === 2) {
      const totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]) + seconds;
      const mm = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      const ss = (totalSeconds % 60).toString().padStart(2, '0');
      return `${mm}:${ss}`;
    }
    return '00:03';
  }
}