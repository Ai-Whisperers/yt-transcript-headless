import { PlaylistRequest, PlaylistResponse, VideoTranscriptResult } from '../domain/PlaylistTypes';
import { TranscriptFormat, TranscriptSegment } from '../domain/TranscriptSegment';
import { PlaylistExtractor } from '../infrastructure/PlaylistExtractor';
import { ChannelExtractor } from '../infrastructure/ChannelExtractor';
import { PooledTranscriptExtractor } from '../infrastructure/PooledTranscriptExtractor';
import { ProgressEmitter } from '../infrastructure/ProgressStream';
import { ILogger } from '../domain/ILogger';
import { InvalidUrlError } from '../domain/errors';
import { ICacheRepository } from '../domain/repositories/ICacheRepository';
import { IJobRepository } from '../domain/repositories/IJobRepository';
import { CachedTranscript } from '../domain/CachedTranscript';
import { JobStatus } from '../domain/Job';
import { randomUUID } from 'crypto';

/**
 * TranscribePlaylistUseCase handles YouTube playlist AND channel transcript extraction.
 * Now supports both playlist URLs and channel URLs with automatic detection.
 * Uses parallel processing with browser pooling for improved performance.
 * Supports optional caching via ICacheRepository for faster repeated extractions.
 */
export class TranscribePlaylistUseCase {
  private playlistExtractor: PlaylistExtractor;
  private channelExtractor: ChannelExtractor;
  private pooledExtractor: PooledTranscriptExtractor;
  private logger: ILogger;
  private defaultConcurrency: number;
  private cacheRepository?: ICacheRepository;
  private jobRepository?: IJobRepository;

  constructor(
    playlistExtractor: PlaylistExtractor,
    channelExtractor: ChannelExtractor,
    pooledExtractor: PooledTranscriptExtractor,
    logger: ILogger,
    cacheRepository?: ICacheRepository,
    jobRepository?: IJobRepository
  ) {
    this.playlistExtractor = playlistExtractor;
    this.channelExtractor = channelExtractor;
    this.pooledExtractor = pooledExtractor;
    this.logger = logger;
    this.cacheRepository = cacheRepository;
    this.jobRepository = jobRepository;
    this.defaultConcurrency = parseInt(process.env.PLAYLIST_CONCURRENCY || '3', 10);
  }

  async execute(
    request: PlaylistRequest,
    abortSignal?: AbortSignal,
    progressEmitter?: ProgressEmitter
  ): Promise<PlaylistResponse> {
    const startTime = Date.now();

    // Detect URL type: channel or playlist
    const isChannel = ChannelExtractor.isChannelUrl(request.url);
    const isPlaylist = PlaylistExtractor.isPlaylistUrl(request.url);

    // Validate that URL is either channel or playlist
    if (!isChannel && !isPlaylist) {
      throw new InvalidUrlError(
        request.url + ' - URL must be a valid YouTube channel URL (@username, /channel/UC..., /c/...) or playlist URL (with list parameter)'
      );
    }

    const format = request.format || TranscriptFormat.JSON;
    const maxVideos = request.maxVideos || 100;
    const urlType = isChannel ? 'channel' : 'playlist';

    this.logger.info(`Starting parallel ${urlType} transcription`, {
      url: request.url,
      urlType,
      format,
      maxVideos,
      concurrency: this.defaultConcurrency
    });

    try {
      // Extract video IDs from channel or playlist
      let videoIds: string[];
      let sourceId: string;
      let sourceTitle: string | undefined;

      if (isChannel) {
        const channelInfo = await this.channelExtractor.extractVideoIds(request.url, abortSignal);

        if (channelInfo.videoIds.length === 0) {
          progressEmitter?.failed('No videos found in channel');
          return {
            success: false,
            error: {
              message: 'No videos found in channel',
              code: 'EMPTY_CHANNEL',
              timestamp: new Date().toISOString(),
              context: { channelId: channelInfo.channelId }
            }
          };
        }

        videoIds = channelInfo.videoIds;
        sourceId = channelInfo.channelHandle || channelInfo.channelId;
        sourceTitle = channelInfo.title;

        this.logger.info('Extracted video IDs from channel', {
          channelId: channelInfo.channelId,
          channelHandle: channelInfo.channelHandle,
          videoCount: channelInfo.videoCount
        });
      } else {
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

        videoIds = playlistInfo.videoIds;
        sourceId = playlistInfo.playlistId;
        sourceTitle = playlistInfo.title;

        this.logger.info('Extracted video IDs from playlist', {
          playlistId: playlistInfo.playlistId,
          videoCount: playlistInfo.videoIds.length
        });
      }

      // Limit number of videos if needed
      const videoIdsToProcess = videoIds.slice(0, maxVideos);

      if (videoIdsToProcess.length < videoIds.length) {
        this.logger.info(`Limiting ${urlType} processing`, {
          totalVideos: videoIds.length,
          maxVideos,
          processing: videoIdsToProcess.length
        });
      }

      // Convert video IDs to URLs
      const videoUrls = videoIdsToProcess.map(id => `https://www.youtube.com/watch?v=${id}`);

      // Create job record if job tracking enabled
      const jobId = randomUUID();
      if (this.jobRepository) {
        await this.createJobRecord(jobId, videoIdsToProcess.length, format, sourceId, request.url);
      }

      // Check cache for existing transcripts
      const cachedResults = await this.loadFromCache(videoIdsToProcess, videoUrls, format);

      this.logger.info('Cache lookup completed', {
        totalVideos: videoIdsToProcess.length,
        cacheHits: cachedResults.size,
        videosToExtract: videoIdsToProcess.length - cachedResults.size
      });

      // Filter out cached videos
      const videosToExtract: string[] = [];
      const videoIdsToExtract: string[] = [];
      for (let i = 0; i < videoIdsToProcess.length; i++) {
        const videoId = videoIdsToProcess[i];
        if (!cachedResults.has(videoId)) {
          videosToExtract.push(videoUrls[i]);
          videoIdsToExtract.push(videoId);
        }
      }

      // Emit started event
      progressEmitter?.started();

      // Process only non-cached videos in parallel
      let freshResults: VideoTranscriptResult[] = [];
      if (videosToExtract.length > 0) {
        freshResults = await this.processVideosInParallel(
          videosToExtract,
          videoIdsToExtract,
          format,
          this.defaultConcurrency,
          abortSignal,
          progressEmitter
        );

        // Save fresh results to cache
        await this.saveToCache(freshResults, format);
      }

      // Merge cached and fresh results (maintain original order)
      const allResults: VideoTranscriptResult[] = videoIdsToProcess.map(videoId => {
        // Check cache first
        if (cachedResults.has(videoId)) {
          return cachedResults.get(videoId)!;
        }

        // Find in fresh results
        const freshResult = freshResults.find(r => r.videoId === videoId);
        return freshResult || {
          videoId,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          success: false,
          error: {
            message: 'Result not found',
            code: 'NOT_FOUND'
          }
        };
      });

      const successCount = allResults.filter(r => r.success).length;
      const failureCount = allResults.filter(r => !r.success).length;
      const duration = Date.now() - startTime;

      // Update job progress and complete
      if (this.jobRepository) {
        await this.updateJobProgress(jobId, allResults.length, successCount, failureCount);
        await this.completeJobRecord(jobId);
      }

      // Emit completed event
      progressEmitter?.completed(successCount, failureCount, duration);

      this.logger.info(`${urlType} transcription completed`, {
        sourceId,
        sourceType: urlType,
        totalVideos: videoIds.length,
        processedVideos: allResults.length,
        cachedResults: cachedResults.size,
        freshExtractions: freshResults.length,
        successfulExtractions: successCount,
        failedExtractions: failureCount,
        duration,
        avgTimePerVideo: allResults.length > 0 ? Math.round(duration / allResults.length) : 0
      });

      return {
        success: true,
        data: {
          playlistId: sourceId,
          playlistUrl: request.url,
          playlistTitle: sourceTitle,
          totalVideos: videoIds.length,
          processedVideos: allResults.length,
          successfulExtractions: successCount,
          failedExtractions: failureCount,
          results: allResults,
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

  /**
   * Load cached transcripts from cache repository
   */
  private loadFromCache = async (
    videoIds: string[],
    videoUrls: string[],
    format: TranscriptFormat
  ): Promise<Map<string, VideoTranscriptResult>> => {
    const results = new Map<string, VideoTranscriptResult>();

    if (!this.cacheRepository) {
      return results;
    }

    try {
      const cached = await this.cacheRepository.getTranscripts(videoIds);

      for (const [videoId, cachedTranscript] of cached.entries()) {
        const result: VideoTranscriptResult = {
          videoId,
          videoUrl: cachedTranscript.videoUrl,
          videoTitle: cachedTranscript.videoTitle,
          success: true,
          transcript: cachedTranscript.transcript,
          extractedAt: cachedTranscript.extractedAt
        };

        // Add formatted outputs based on format
        if (format === TranscriptFormat.SRT && cachedTranscript.srt) {
          result.srt = cachedTranscript.srt;
        } else if (format === TranscriptFormat.TEXT && cachedTranscript.text) {
          result.text = cachedTranscript.text;
        }

        results.set(videoId, result);

        // Update access time
        await this.cacheRepository.updateAccessTime(videoId);
      }

      this.logger.info('Loaded transcripts from cache', {
        requested: videoIds.length,
        cacheHits: results.size
      });
    } catch (error: any) {
      this.logger.warn('Failed to load from cache', {
        error: error.message,
        videoCount: videoIds.length
      });
    }

    return results;
  };

  /**
   * Save fresh results to cache repository
   */
  private saveToCache = async (
    results: VideoTranscriptResult[],
    format: TranscriptFormat
  ): Promise<void> => {
    if (!this.cacheRepository) {
      return;
    }

    try {
      const successfulResults = results.filter(r => r.success && r.transcript);
      if (successfulResults.length === 0) {
        return;
      }

      const cachedTranscripts: CachedTranscript[] = successfulResults.map(result => ({
        videoId: result.videoId,
        videoUrl: result.videoUrl,
        videoTitle: result.videoTitle,
        transcript: result.transcript!,
        srt: result.srt,
        text: result.text,
        extractedAt: result.extractedAt || new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      }));

      await this.cacheRepository.saveTranscripts(cachedTranscripts);

      this.logger.info('Saved results to cache', {
        count: cachedTranscripts.length
      });
    } catch (error: any) {
      this.logger.warn('Failed to save to cache', {
        error: error.message,
        resultCount: results.length
      });
    }
  };

  /**
   * Create job record
   */
  private createJobRecord = async (
    jobId: string,
    totalItems: number,
    format: TranscriptFormat,
    playlistId: string,
    playlistUrl: string
  ): Promise<void> => {
    if (!this.jobRepository) {
      return;
    }

    try {
      await this.jobRepository.createJob({
        id: jobId,
        type: 'playlist',
        status: JobStatus.PENDING,
        totalItems,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          format,
          playlistId,
          playlistUrl
        }
      });

      this.logger.debug('Job record created', { jobId, totalItems });
    } catch (error: any) {
      this.logger.warn('Failed to create job record', {
        error: error.message,
        jobId
      });
    }
  };

  /**
   * Update job progress
   */
  private updateJobProgress = async (
    jobId: string,
    processedItems: number,
    successfulItems: number,
    failedItems: number
  ): Promise<void> => {
    if (!this.jobRepository) {
      return;
    }

    try {
      await this.jobRepository.updateJobProgress(
        jobId,
        processedItems,
        successfulItems,
        failedItems
      );

      this.logger.debug('Job progress updated', {
        jobId,
        processedItems,
        successfulItems,
        failedItems
      });
    } catch (error: any) {
      this.logger.warn('Failed to update job progress', {
        error: error.message,
        jobId
      });
    }
  };

  /**
   * Complete job record
   */
  private completeJobRecord = async (jobId: string): Promise<void> => {
    if (!this.jobRepository) {
      return;
    }

    try {
      await this.jobRepository.completeJob(jobId);
      this.logger.debug('Job completed', { jobId });
    } catch (error: any) {
      this.logger.warn('Failed to complete job', {
        error: error.message,
        jobId
      });
    }
  };
}
