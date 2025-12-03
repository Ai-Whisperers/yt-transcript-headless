import { BatchRequest, BatchResponse, BatchVideoResult } from '../domain/BatchTypes';
import { TranscriptFormat, TranscriptSegment } from '../domain/TranscriptSegment';
import { PooledTranscriptExtractor } from '../infrastructure/PooledTranscriptExtractor';
import { ILogger } from '../domain/ILogger';
import { MissingFieldError } from '../domain/errors';
import { randomUUID } from 'crypto';

/**
 * BatchTranscribeUseCase handles batch URL transcript extraction with parallel processing.
 * Accepts an array of URLs and processes them concurrently using the browser pool.
 *
 * Features:
 * - Parallel processing with configurable concurrency
 * - URL validation and deduplication
 * - Abort signal support for cancellation
 * - Per-video timing metrics
 */
export class BatchTranscribeUseCase {
  private extractor: PooledTranscriptExtractor;
  private logger: ILogger;
  private defaultConcurrency: number;

  constructor(extractor: PooledTranscriptExtractor, logger: ILogger) {
    this.extractor = extractor;
    this.logger = logger;
    // Default concurrency matches browser pool size
    this.defaultConcurrency = parseInt(process.env.BATCH_CONCURRENCY || '3', 10);
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
    const concurrency = request.concurrency || this.defaultConcurrency;

    this.logger.info('Starting parallel batch transcription', {
      batchId,
      totalUrls: validatedUrls.length,
      originalUrlCount: request.urls.length,
      format,
      concurrency
    });

    // Process URLs in parallel with concurrency limit
    const results = await this.processUrlsInParallel(
      validatedUrls,
      format,
      concurrency,
      batchId,
      abortSignal
    );

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const totalProcessingTimeMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    this.logger.info('Batch transcription completed', {
      batchId,
      totalUrls: validatedUrls.length,
      processedUrls: results.length,
      successfulExtractions: successCount,
      failedExtractions: failureCount,
      totalProcessingTimeMs,
      avgTimePerVideo: Math.round(totalProcessingTimeMs / results.length)
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
   * Process URLs in parallel with controlled concurrency
   * Uses a semaphore-like pattern to limit concurrent extractions
   */
  private async processUrlsInParallel(
    urls: string[],
    format: TranscriptFormat,
    concurrency: number,
    batchId: string,
    abortSignal?: AbortSignal
  ): Promise<BatchVideoResult[]> {
    const results: BatchVideoResult[] = new Array(urls.length);
    let currentIndex = 0;
    let completedCount = 0;
    const totalUrls = urls.length;

    // Worker function that processes URLs from the queue
    const worker = async (workerId: number): Promise<void> => {
      while (true) {
        // Check if aborted
        if (abortSignal?.aborted) {
          this.logger.info('Worker stopping due to abort signal', { workerId, batchId });
          return;
        }

        // Get next URL index atomically
        const index = currentIndex++;
        if (index >= urls.length) {
          return; // No more URLs to process
        }

        const url = urls[index];
        const videoId = this.extractVideoId(url);

        this.logger.info('Worker processing URL', {
          workerId,
          batchId,
          videoId,
          position: index + 1,
          total: totalUrls,
          completedSoFar: completedCount
        });

        const result = await this.processUrl(url, videoId, format, batchId, abortSignal);
        results[index] = result;
        completedCount++;

        this.logger.info('Worker completed URL', {
          workerId,
          batchId,
          videoId,
          success: result.success,
          processingTimeMs: result.processingTimeMs,
          progress: `${completedCount}/${totalUrls}`
        });
      }
    };

    // Start workers up to concurrency limit
    const workerCount = Math.min(concurrency, urls.length);
    this.logger.info('Starting parallel workers', {
      batchId,
      workerCount,
      totalUrls
    });

    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker(i));
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    // Filter out any undefined results (from aborted operations)
    return results.filter(r => r !== undefined);
  }

  /**
   * Process a single URL and return the result
   */
  private async processUrl(
    url: string,
    videoId: string | null,
    format: TranscriptFormat,
    batchId: string,
    abortSignal?: AbortSignal
  ): Promise<BatchVideoResult> {
    const videoStartTime = Date.now();

    try {
      // Check if already aborted before starting
      if (abortSignal?.aborted) {
        return {
          videoId: videoId || 'unknown',
          videoUrl: url,
          success: false,
          error: {
            message: 'Extraction aborted',
            code: 'ABORTED'
          },
          processingTimeMs: Date.now() - videoStartTime
        };
      }

      const transcript = await this.extractor.extract(url, abortSignal);

      if (!transcript || transcript.length === 0) {
        return {
          videoId: videoId || 'unknown',
          videoUrl: url,
          success: false,
          error: {
            message: 'No transcript available for this video',
            code: 'NO_TRANSCRIPT'
          },
          processingTimeMs: Date.now() - videoStartTime
        };
      }

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

      return result;

    } catch (error: any) {
      this.logger.warn('Failed to extract transcript for URL', {
        batchId,
        videoId,
        url,
        error: error.message
      });

      return {
        videoId: videoId || 'unknown',
        videoUrl: url,
        success: false,
        error: {
          message: error.message || 'Unknown error',
          code: error.code || 'EXTRACTION_ERROR'
        },
        processingTimeMs: Date.now() - videoStartTime
      };
    }
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
