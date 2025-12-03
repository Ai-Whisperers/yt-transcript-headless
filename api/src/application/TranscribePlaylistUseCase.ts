import { PlaylistRequest, PlaylistResponse, VideoTranscriptResult } from '../domain/PlaylistTypes';
import { TranscriptFormat, TranscriptSegment } from '../domain/TranscriptSegment';
import { PlaylistExtractor } from '../infrastructure/PlaylistExtractor';
import { PooledTranscriptExtractor } from '../infrastructure/PooledTranscriptExtractor';
import { ProgressEmitter } from '../infrastructure/ProgressStream';
import { ILogger } from '../domain/ILogger';
import { InvalidUrlError } from '../domain/errors';

/**
 * TranscribePlaylistUseCase handles YouTube playlist transcript extraction.
 * Now uses parallel processing with browser pooling for improved performance.
 */
export class TranscribePlaylistUseCase {
  private playlistExtractor: PlaylistExtractor;
  private pooledExtractor: PooledTranscriptExtractor;
  private logger: ILogger;
  private defaultConcurrency: number;

  constructor(
    playlistExtractor: PlaylistExtractor,
    pooledExtractor: PooledTranscriptExtractor,
    logger: ILogger
  ) {
    this.playlistExtractor = playlistExtractor;
    this.pooledExtractor = pooledExtractor;
    this.logger = logger;
    this.defaultConcurrency = parseInt(process.env.PLAYLIST_CONCURRENCY || '3', 10);
  }

  async execute(
    request: PlaylistRequest,
    abortSignal?: AbortSignal,
    progressEmitter?: ProgressEmitter
  ): Promise<PlaylistResponse> {
    const startTime = Date.now();

    // Validate playlist URL
    if (!PlaylistExtractor.isPlaylistUrl(request.url)) {
      throw new InvalidUrlError(request.url + ' - URL must be a valid YouTube playlist URL with list parameter');
    }

    const format = request.format || TranscriptFormat.JSON;
    const maxVideos = request.maxVideos || 100;

    this.logger.info('Starting parallel playlist transcription', {
      playlistUrl: request.url,
      format,
      maxVideos,
      concurrency: this.defaultConcurrency
    });

    try {
      // Extract video IDs from playlist
      const playlistInfo = await this.playlistExtractor.extractVideoIds(request.url, abortSignal);

      if (playlistInfo.videoIds.length === 0) {
        progressEmitter?.failed('No videos found in playlist');
        return {
          success: false,
          error: {
            message: 'No videos found in playlist',
            code: 'EMPTY_PLAYLIST',
            timestamp: new Date().toISOString(),
            context: { playlistId: playlistInfo.playlistId }
          }
        };
      }

      this.logger.info('Extracted video IDs from playlist', {
        playlistId: playlistInfo.playlistId,
        videoCount: playlistInfo.videoIds.length
      });

      // Limit number of videos if needed
      const videoIdsToProcess = playlistInfo.videoIds.slice(0, maxVideos);

      if (videoIdsToProcess.length < playlistInfo.videoIds.length) {
        this.logger.info('Limiting playlist processing', {
          totalVideos: playlistInfo.videoIds.length,
          maxVideos,
          processing: videoIdsToProcess.length
        });
      }

      // Convert video IDs to URLs
      const videoUrls = videoIdsToProcess.map(id => `https://www.youtube.com/watch?v=${id}`);

      // Emit started event
      progressEmitter?.started();

      // Process videos in parallel
      const results = await this.processVideosInParallel(
        videoUrls,
        videoIdsToProcess,
        format,
        this.defaultConcurrency,
        abortSignal,
        progressEmitter
      );

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      const duration = Date.now() - startTime;

      // Emit completed event
      progressEmitter?.completed(successCount, failureCount, duration);

      this.logger.info('Playlist transcription completed', {
        playlistId: playlistInfo.playlistId,
        totalVideos: playlistInfo.videoIds.length,
        processedVideos: results.length,
        successfulExtractions: successCount,
        failedExtractions: failureCount,
        duration,
        avgTimePerVideo: Math.round(duration / results.length)
      });

      return {
        success: true,
        data: {
          playlistId: playlistInfo.playlistId,
          playlistUrl: request.url,
          playlistTitle: playlistInfo.title,
          totalVideos: playlistInfo.videoIds.length,
          processedVideos: results.length,
          successfulExtractions: successCount,
          failedExtractions: failureCount,
          results,
          format,
          extractedAt: new Date().toISOString()
        }
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.logger.error('Playlist transcription failed', error, {
        playlistUrl: request.url,
        duration
      });

      if (error instanceof InvalidUrlError) {
        throw error;
      }

      return {
        success: false,
        error: {
          message: error.message || 'Failed to process playlist',
          code: 'PLAYLIST_EXTRACTION_FAILED',
          timestamp: new Date().toISOString(),
          context: { originalError: error.name }
        }
      };
    }
  }

  /**
   * Process videos in parallel with controlled concurrency
   */
  private async processVideosInParallel(
    videoUrls: string[],
    videoIds: string[],
    format: TranscriptFormat,
    concurrency: number,
    abortSignal?: AbortSignal,
    progressEmitter?: ProgressEmitter
  ): Promise<VideoTranscriptResult[]> {
    const results: VideoTranscriptResult[] = new Array(videoUrls.length);
    let currentIndex = 0;
    let completedCount = 0;
    const totalVideos = videoUrls.length;

    // Worker function that processes videos from the queue
    const worker = async (workerId: number): Promise<void> => {
      while (true) {
        // Check if aborted
        if (abortSignal?.aborted) {
          this.logger.info('Playlist worker stopping due to abort signal', { workerId });
          progressEmitter?.aborted(completedCount);
          return;
        }

        // Get next video index atomically
        const index = currentIndex++;
        if (index >= videoUrls.length) {
          return; // No more videos to process
        }

        const videoUrl = videoUrls[index];
        const videoId = videoIds[index];

        this.logger.info('Playlist worker processing video', {
          workerId,
          videoId,
          position: index + 1,
          total: totalVideos,
          completedSoFar: completedCount
        });

        // Emit processing event
        progressEmitter?.processing(index, videoId, videoUrl);

        const result = await this.processVideo(videoUrl, videoId, format, abortSignal);
        results[index] = result;
        completedCount++;

        // Emit item completed event
        progressEmitter?.itemCompleted(
          index,
          videoId,
          result.success,
          result.error?.message
        );

        this.logger.info('Playlist worker completed video', {
          workerId,
          videoId,
          success: result.success,
          progress: `${completedCount}/${totalVideos}`
        });
      }
    };

    // Start workers up to concurrency limit
    const workerCount = Math.min(concurrency, videoUrls.length);
    this.logger.info('Starting playlist parallel workers', {
      workerCount,
      totalVideos
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
   * Process a single video and return the result
   */
  private async processVideo(
    videoUrl: string,
    videoId: string,
    format: TranscriptFormat,
    abortSignal?: AbortSignal
  ): Promise<VideoTranscriptResult> {
    try {
      // Check if already aborted before starting
      if (abortSignal?.aborted) {
        return {
          videoId,
          videoUrl,
          success: false,
          error: {
            message: 'Extraction aborted',
            code: 'ABORTED'
          }
        };
      }

      const transcript = await this.pooledExtractor.extract(videoUrl, abortSignal);

      if (!transcript || transcript.length === 0) {
        return {
          videoId,
          videoUrl,
          success: false,
          error: {
            message: 'No transcript available for this video',
            code: 'NO_TRANSCRIPT'
          }
        };
      }

      const result: VideoTranscriptResult = {
        videoId,
        videoUrl,
        success: true,
        transcript,
        extractedAt: new Date().toISOString()
      };

      // Add formatted outputs based on format
      if (format === TranscriptFormat.SRT) {
        result.srt = this.formatAsSRT(transcript);
      } else if (format === TranscriptFormat.TEXT) {
        result.text = this.formatAsText(transcript);
      }

      return result;

    } catch (error: any) {
      this.logger.warn('Failed to extract transcript for playlist video', {
        videoId,
        videoUrl,
        error: error.message
      });

      return {
        videoId,
        videoUrl,
        success: false,
        error: {
          message: error.message || 'Unknown error',
          code: error.code || 'EXTRACTION_ERROR'
        }
      };
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
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},000`;
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
