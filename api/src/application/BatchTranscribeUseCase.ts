import { BatchRequest, BatchResponse, BatchVideoResult } from '../domain/BatchTypes';
import { TranscriptFormat, TranscriptSegment } from '../domain/TranscriptSegment';
import { PooledTranscriptExtractor } from '../infrastructure/PooledTranscriptExtractor';
import { ILogger } from '../domain/ILogger';
import { InvalidUrlError, MissingFieldError } from '../domain/errors';
import { randomUUID } from 'crypto';

/**
 * BatchTranscribeUseCase handles batch URL transcript extraction.
 * Accepts an array of URLs and processes them using the browser pool.
 *
 * Note: Currently processes sequentially but architecture supports parallel
 * processing when parallelization is implemented in the next phase.
 */
export class BatchTranscribeUseCase {
  private extractor: PooledTranscriptExtractor;
  private logger: ILogger;

  constructor(extractor: PooledTranscriptExtractor, logger: ILogger) {
    this.extractor = extractor;
    this.logger = logger;
  }

  async execute(request: BatchRequest, abortSignal?: AbortSignal): Promise<BatchResponse> {
    const batchId = randomUUID();
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    // Validate request
    if (!request.urls || request.urls.length === 0) {
      throw new MissingFieldError('urls');
    }

    // Validate and deduplicate URLs
    const validatedUrls = this.validateAndDeduplicateUrls(request.urls);

    if (validatedUrls.length === 0) {
      return {
        success: false,
        error: {
          message: 'No valid YouTube URLs provided',
          code: 'NO_VALID_URLS',
          timestamp: new Date().toISOString()
        }
      };
    }

    const format = request.format || TranscriptFormat.JSON;

    this.logger.info('Starting batch transcription', {
      batchId,
      totalUrls: validatedUrls.length,
      originalUrlCount: request.urls.length,
      format
    });

    const results: BatchVideoResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each URL (sequential for now, parallel in next phase)
    for (let i = 0; i < validatedUrls.length; i++) {
      const url = validatedUrls[i];

      // Check if aborted
      if (abortSignal?.aborted) {
        this.logger.info('Batch transcription aborted', {
          batchId,
          processedUrls: results.length,
          totalUrls: validatedUrls.length
        });
        break;
      }

      const videoId = this.extractVideoId(url);

      this.logger.info('Processing URL in batch', {
        batchId,
        videoId,
        position: i + 1,
        total: validatedUrls.length
      });

      const videoStartTime = Date.now();

      try {
        const transcript = await this.extractor.extract(url, abortSignal);

        if (!transcript || transcript.length === 0) {
          results.push({
            videoId: videoId || 'unknown',
            videoUrl: url,
            success: false,
            error: {
              message: 'No transcript available for this video',
              code: 'NO_TRANSCRIPT'
            },
            processingTimeMs: Date.now() - videoStartTime
          });
          failureCount++;
        } else {
          const result: BatchVideoResult = {
            videoId: videoId || 'unknown',
            videoUrl: url,
            success: true,
            transcript,
            extractedAt: new Date().toISOString(),
            processingTimeMs: Date.now() - videoStartTime
          };

          // Add formatted outputs based on format
          if (format === TranscriptFormat.SRT) {
            result.srt = this.formatAsSRT(transcript);
          } else if (format === TranscriptFormat.TEXT) {
            result.text = this.formatAsText(transcript);
          }

          results.push(result);
          successCount++;
        }

      } catch (error: any) {
        this.logger.warn('Failed to extract transcript for URL', {
          batchId,
          videoId,
          url,
          error: error.message
        });

        results.push({
          videoId: videoId || 'unknown',
          videoUrl: url,
          success: false,
          error: {
            message: error.message || 'Unknown error',
            code: error.code || 'EXTRACTION_ERROR'
          },
          processingTimeMs: Date.now() - videoStartTime
        });
        failureCount++;
      }
    }

    const totalProcessingTimeMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    this.logger.info('Batch transcription completed', {
      batchId,
      totalUrls: validatedUrls.length,
      processedUrls: results.length,
      successfulExtractions: successCount,
      failedExtractions: failureCount,
      totalProcessingTimeMs
    });

    return {
      success: true,
      data: {
        batchId,
        totalUrls: validatedUrls.length,
        processedUrls: results.length,
        successfulExtractions: successCount,
        failedExtractions: failureCount,
        results,
        format,
        startedAt,
        completedAt,
        totalProcessingTimeMs
      }
    };
  }

  /**
   * Validate URLs and remove duplicates
   */
  private validateAndDeduplicateUrls(urls: string[]): string[] {
    const validUrls: string[] = [];
    const seenVideoIds = new Set<string>();

    for (const url of urls) {
      if (!this.isValidYouTubeUrl(url)) {
        this.logger.warn('Skipping invalid YouTube URL', { url });
        continue;
      }

      const videoId = this.extractVideoId(url);
      if (videoId && seenVideoIds.has(videoId)) {
        this.logger.info('Skipping duplicate video ID', { videoId, url });
        continue;
      }

      if (videoId) {
        seenVideoIds.add(videoId);
      }
      validUrls.push(url);
    }

    return validUrls;
  }

  private isValidYouTubeUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const validHosts = ['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'];

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return false;
      }

      if (!validHosts.includes(parsedUrl.hostname)) {
        return false;
      }

      const videoId = this.extractVideoId(url);
      if (!videoId) {
        return false;
      }

      // Validate video ID format (11 characters, alphanumeric + - and _)
      const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
      return videoIdRegex.test(videoId);

    } catch (error) {
      return false;
    }
  }

  private extractVideoId(url: string): string | null {
    try {
      const parsedUrl = new URL(url);

      // Handle youtu.be short URLs
      if (parsedUrl.hostname === 'youtu.be') {
        return parsedUrl.pathname.slice(1).split('?')[0] || null;
      }

      // Handle regular YouTube URLs
      const videoId = parsedUrl.searchParams.get('v');
      if (videoId) return videoId;

      // Handle embed URLs
      if (parsedUrl.pathname.startsWith('/embed/')) {
        return parsedUrl.pathname.split('/embed/')[1]?.split('?')[0] || null;
      }

      // Handle /v/ URLs (legacy format)
      if (parsedUrl.pathname.startsWith('/v/')) {
        return parsedUrl.pathname.split('/v/')[1]?.split('?')[0] || null;
      }

      return null;
    } catch {
      return null;
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
    const parts = time.split(':');

    if (parts.length === 2) {
      const totalMinutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const hh = hours.toString().padStart(2, '0');
      const mm = minutes.toString().padStart(2, '0');
      const ss = seconds.toString().padStart(2, '0');
      return `${hh}:${mm}:${ss},000`;
    } else if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')},000`;
    }
    return `00:00:00,000`;
  }

  private addSeconds(time: string, seconds: number): string {
    const parts = time.split(':');
    if (parts.length === 2) {
      const totalSeconds = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + seconds;
      const mm = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      const ss = (totalSeconds % 60).toString().padStart(2, '0');
      return `${mm}:${ss}`;
    } else if (parts.length === 3) {
      const totalSeconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10) + seconds;
      const hh = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
      const mm = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
      const ss = (totalSeconds % 60).toString().padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }
    return '00:03';
  }
}
