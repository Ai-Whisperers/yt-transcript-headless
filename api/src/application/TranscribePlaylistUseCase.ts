import { PlaylistRequest, PlaylistResponse, VideoTranscriptResult } from '../domain/PlaylistTypes';
import { TranscriptFormat, TranscriptRequest } from '../domain/TranscriptSegment';
import { PlaylistExtractor } from '../infrastructure/PlaylistExtractor';
import { TranscribeVideoUseCase } from './TranscribeVideoUseCase';
import { Logger } from '../infrastructure/Logger';
import { InvalidUrlError } from '../domain/errors';

export class TranscribePlaylistUseCase {
  private playlistExtractor: PlaylistExtractor;
  private transcribeVideoUseCase: TranscribeVideoUseCase;
  private logger: Logger;

  constructor(
    playlistExtractor: PlaylistExtractor,
    transcribeVideoUseCase: TranscribeVideoUseCase,
    logger: Logger
  ) {
    this.playlistExtractor = playlistExtractor;
    this.transcribeVideoUseCase = transcribeVideoUseCase;
    this.logger = logger;
  }

  async execute(request: PlaylistRequest, abortSignal?: AbortSignal): Promise<PlaylistResponse> {
    const startTime = Date.now();

    // Validate playlist URL
    if (!PlaylistExtractor.isPlaylistUrl(request.url)) {
      throw new InvalidUrlError(request.url + ' - URL must be a valid YouTube playlist URL with list parameter');
    }

    const format = request.format || TranscriptFormat.JSON;
    const maxVideos = request.maxVideos || 100; // Default limit

    this.logger.info('Starting playlist transcription', {
      playlistUrl: request.url,
      format,
      maxVideos
    });

    try {
      // Extract video IDs from playlist
      const playlistInfo = await this.playlistExtractor.extractVideoIds(request.url, abortSignal);

      if (playlistInfo.videoIds.length === 0) {
        return {
          success: false,
          error: {
            message: 'No videos found in playlist',
            code: 'EMPTY_PLAYLIST',
            details: { playlistId: playlistInfo.playlistId }
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

      // Process each video
      const results: VideoTranscriptResult[] = [];
      let successCount = 0;
      let failureCount = 0;

      for (const videoId of videoIdsToProcess) {
        // Check if aborted
        if (abortSignal?.aborted) {
          this.logger.info('Playlist transcription aborted', {
            processedVideos: results.length,
            totalVideos: videoIdsToProcess.length
          });
          break;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        this.logger.info('Processing video from playlist', {
          videoId,
          position: results.length + 1,
          total: videoIdsToProcess.length
        });

        try {
          const videoRequest: TranscriptRequest = {
            url: videoUrl,
            format
          };

          const videoResult = await this.transcribeVideoUseCase.execute(videoRequest, abortSignal);

          if (videoResult.success && videoResult.data) {
            results.push({
              videoId,
              videoUrl,
              success: true,
              transcript: videoResult.data.transcript,
              extractedAt: videoResult.data.extractedAt
            });
            successCount++;
          } else {
            results.push({
              videoId,
              videoUrl,
              success: false,
              error: {
                message: 'Failed to extract transcript',
                code: 'EXTRACTION_FAILED'
              }
            });
            failureCount++;
          }
        } catch (error: any) {
          this.logger.warn('Failed to extract transcript for video', {
            videoId,
            error: error.message
          });

          results.push({
            videoId,
            videoUrl,
            success: false,
            error: {
              message: error.message || 'Unknown error',
              code: error.code || 'EXTRACTION_ERROR'
            }
          });
          failureCount++;
        }
      }

      const duration = Date.now() - startTime;
      this.logger.info('Playlist transcription completed', {
        playlistId: playlistInfo.playlistId,
        totalVideos: playlistInfo.videoIds.length,
        processedVideos: results.length,
        successfulExtractions: successCount,
        failedExtractions: failureCount,
        duration
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

      // Re-throw known errors
      if (error instanceof InvalidUrlError) {
        throw error;
      }

      return {
        success: false,
        error: {
          message: error.message || 'Failed to process playlist',
          code: 'PLAYLIST_EXTRACTION_FAILED',
          details: { originalError: error.name }
        }
      };
    }
  }
}
