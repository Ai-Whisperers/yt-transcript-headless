import {
  TranscriptRequest,
  TranscriptResponse,
  ErrorResponse,
  TranscriptFormat,
  TranscriptSegment
} from '../domain/TranscriptSegment';
import { TranscriptExtractor } from '../infrastructure/TranscriptExtractor';
import { Logger } from '../infrastructure/Logger';

export class TranscribeVideoUseCase {
  private extractor: TranscriptExtractor;
  private logger: Logger;

  constructor(extractor: TranscriptExtractor, logger: Logger) {
    this.extractor = extractor;
    this.logger = logger;
  }

  async execute(request: TranscriptRequest): Promise<TranscriptResponse | ErrorResponse> {
    try {
      // Validate YouTube URL
      if (!this.isValidYouTubeUrl(request.url)) {
        return this.createErrorResponse('Invalid YouTube URL', 'INVALID_URL');
      }

      // Set default format if not provided
      const format = request.format || TranscriptFormat.JSON;

      // Log extraction attempt
      this.logger.info(`Starting transcript extraction for: ${request.url}`);

      // Extract transcript using Playwright
      const transcript = await this.extractor.extract(request.url);

      if (!transcript || transcript.length === 0) {
        return this.createErrorResponse('No transcript found for this video', 'NO_TRANSCRIPT');
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

      this.logger.info(`Successfully extracted ${transcript.length} segments`);
      return response;

    } catch (error: any) {
      this.logger.error(`Extraction failed: ${error.message}`, error);
      return this.createErrorResponse(
        error.message || 'Failed to extract transcript',
        'EXTRACTION_FAILED',
        error.stack
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

  private createErrorResponse(message: string, code: string, details?: any): ErrorResponse {
    return {
      success: false,
      error: {
        message,
        code,
        ...(details && { details })
      }
    };
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