import { PlaylistExtractor } from '../../src/infrastructure/PlaylistExtractor';
import { TranscribePlaylistUseCase } from '../../src/application/TranscribePlaylistUseCase';
import { TranscribeVideoUseCase } from '../../src/application/TranscribeVideoUseCase';
import { BrowserManager } from '../../src/infrastructure/BrowserManager';
import { Logger } from '../../src/infrastructure/Logger';
import { TranscriptFormat } from '../../src/domain/TranscriptSegment';
import { InvalidUrlError } from '../../src/domain/errors';

describe('PlaylistExtractor - URL Validation', () => {
  describe('isPlaylistUrl', () => {
    it('should accept valid YouTube playlist URLs with list parameter', () => {
      const validUrls = [
        'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
        'https://youtube.com/playlist?list=PLtest123',
        'https://m.youtube.com/playlist?list=PL123456',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
      ];

      validUrls.forEach(url => {
        expect(PlaylistExtractor.isPlaylistUrl(url)).toBe(true);
      });
    });

    it('should reject YouTube URLs without list parameter', () => {
      const invalidUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/channel/UC123',
        'https://www.youtube.com/user/testuser'
      ];

      invalidUrls.forEach(url => {
        expect(PlaylistExtractor.isPlaylistUrl(url)).toBe(false);
      });
    });

    it('should reject non-YouTube URLs', () => {
      const invalidUrls = [
        'https://vimeo.com/123456',
        'https://example.com?list=test',
        'not-a-url',
        ''
      ];

      invalidUrls.forEach(url => {
        expect(PlaylistExtractor.isPlaylistUrl(url)).toBe(false);
      });
    });

    it('should reject URLs with empty list parameter', () => {
      expect(PlaylistExtractor.isPlaylistUrl('https://www.youtube.com/playlist?list=')).toBe(false);
    });
  });

  describe('extractPlaylistId', () => {
    it('should extract playlist ID from valid URLs', () => {
      expect(PlaylistExtractor.extractPlaylistId('https://www.youtube.com/playlist?list=PLtest123'))
        .toBe('PLtest123');

      expect(PlaylistExtractor.extractPlaylistId('https://www.youtube.com/watch?v=abc&list=PLabc456'))
        .toBe('PLabc456');
    });

    it('should return null for URLs without list parameter', () => {
      expect(PlaylistExtractor.extractPlaylistId('https://www.youtube.com/watch?v=test')).toBeNull();
      expect(PlaylistExtractor.extractPlaylistId('invalid-url')).toBeNull();
    });
  });
});

describe('TranscribePlaylistUseCase', () => {
  let useCase: TranscribePlaylistUseCase;
  let mockPlaylistExtractor: jest.Mocked<PlaylistExtractor>;
  let mockTranscribeVideoUseCase: jest.Mocked<TranscribeVideoUseCase>;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = new Logger('test-playlist');

    mockPlaylistExtractor = {
      extractVideoIds: jest.fn()
    } as any;

    mockTranscribeVideoUseCase = {
      execute: jest.fn()
    } as any;

    useCase = new TranscribePlaylistUseCase(
      mockPlaylistExtractor,
      mockTranscribeVideoUseCase,
      mockLogger
    );
  });

  describe('URL Validation', () => {
    it('should reject non-playlist URLs', async () => {
      const request = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        format: TranscriptFormat.JSON
      };

      await expect(useCase.execute(request)).rejects.toThrow(InvalidUrlError);
    });

    it('should accept valid playlist URLs', async () => {
      const request = {
        url: 'https://www.youtube.com/playlist?list=PLtest123',
        format: TranscriptFormat.JSON
      };

      mockPlaylistExtractor.extractVideoIds.mockResolvedValue({
        playlistId: 'PLtest123',
        playlistUrl: request.url,
        videoIds: ['videoId1', 'videoId2'],
        videoCount: 2
      });

      mockTranscribeVideoUseCase.execute.mockResolvedValue({
        success: true,
        data: {
          transcript: [],
          format: TranscriptFormat.JSON,
          videoUrl: 'test',
          extractedAt: new Date().toISOString()
        }
      });

      const result = await useCase.execute(request);
      expect(result.success).toBe(true);
    });
  });

  describe('Video Processing', () => {
    it('should process all videos in playlist', async () => {
      const request = {
        url: 'https://www.youtube.com/playlist?list=PLtest123',
        format: TranscriptFormat.JSON,
        maxVideos: 100
      };

      mockPlaylistExtractor.extractVideoIds.mockResolvedValue({
        playlistId: 'PLtest123',
        playlistUrl: request.url,
        videoIds: ['videoId1', 'videoId2', 'videoId3'],
        title: 'Test Playlist',
        videoCount: 3
      });

      mockTranscribeVideoUseCase.execute.mockResolvedValue({
        success: true,
        data: {
          transcript: [{ time: '0:00', text: 'test' }],
          format: TranscriptFormat.JSON,
          videoUrl: 'test',
          extractedAt: new Date().toISOString()
        }
      });

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.data?.processedVideos).toBe(3);
      expect(result.data?.successfulExtractions).toBe(3);
      expect(result.data?.failedExtractions).toBe(0);
      expect(mockTranscribeVideoUseCase.execute).toHaveBeenCalledTimes(3);
    });

    it('should respect maxVideos limit', async () => {
      const request = {
        url: 'https://www.youtube.com/playlist?list=PLtest123',
        format: TranscriptFormat.JSON,
        maxVideos: 2
      };

      mockPlaylistExtractor.extractVideoIds.mockResolvedValue({
        playlistId: 'PLtest123',
        playlistUrl: request.url,
        videoIds: ['videoId1', 'videoId2', 'videoId3', 'videoId4', 'videoId5'],
        videoCount: 5
      });

      mockTranscribeVideoUseCase.execute.mockResolvedValue({
        success: true,
        data: {
          transcript: [],
          format: TranscriptFormat.JSON,
          videoUrl: 'test',
          extractedAt: new Date().toISOString()
        }
      });

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.data?.processedVideos).toBe(2);
      expect(result.data?.totalVideos).toBe(5);
      expect(mockTranscribeVideoUseCase.execute).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures gracefully', async () => {
      const request = {
        url: 'https://www.youtube.com/playlist?list=PLtest123',
        format: TranscriptFormat.JSON
      };

      mockPlaylistExtractor.extractVideoIds.mockResolvedValue({
        playlistId: 'PLtest123',
        playlistUrl: request.url,
        videoIds: ['videoId1', 'videoId2', 'videoId3'],
        videoCount: 3
      });

      // First succeeds, second fails, third succeeds
      mockTranscribeVideoUseCase.execute
        .mockResolvedValueOnce({
          success: true,
          data: {
            transcript: [],
            format: TranscriptFormat.JSON,
            videoUrl: 'test1',
            extractedAt: new Date().toISOString()
          }
        })
        .mockRejectedValueOnce(new Error('Extraction failed'))
        .mockResolvedValueOnce({
          success: true,
          data: {
            transcript: [],
            format: TranscriptFormat.JSON,
            videoUrl: 'test3',
            extractedAt: new Date().toISOString()
          }
        });

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.data?.processedVideos).toBe(3);
      expect(result.data?.successfulExtractions).toBe(2);
      expect(result.data?.failedExtractions).toBe(1);
      expect(result.data?.results.length).toBe(3);

      // Check that failed video has error details
      const failedVideo = result.data?.results.find(r => !r.success);
      expect(failedVideo).toBeDefined();
      expect(failedVideo?.error?.message).toBe('Extraction failed');
    });

    it('should return error for empty playlists', async () => {
      const request = {
        url: 'https://www.youtube.com/playlist?list=PLtest123',
        format: TranscriptFormat.JSON
      };

      mockPlaylistExtractor.extractVideoIds.mockResolvedValue({
        playlistId: 'PLtest123',
        playlistUrl: request.url,
        videoIds: [],
        videoCount: 0
      });

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EMPTY_PLAYLIST');
      expect(mockTranscribeVideoUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('Abort Signal Handling', () => {
    it('should stop processing when aborted', async () => {
      const request = {
        url: 'https://www.youtube.com/playlist?list=PLtest123',
        format: TranscriptFormat.JSON
      };

      mockPlaylistExtractor.extractVideoIds.mockResolvedValue({
        playlistId: 'PLtest123',
        playlistUrl: request.url,
        videoIds: ['videoId1', 'videoId2', 'videoId3'],
        videoCount: 3
      });

      const abortController = new AbortController();

      // Abort after first video
      mockTranscribeVideoUseCase.execute.mockImplementation(async () => {
        abortController.abort();
        return {
          success: true,
          data: {
            transcript: [],
            format: TranscriptFormat.JSON,
            videoUrl: 'test',
            extractedAt: new Date().toISOString()
          }
        };
      });

      const result = await useCase.execute(request, abortController.signal);

      expect(result.success).toBe(true);
      expect(result.data?.processedVideos).toBeLessThan(3);
      expect(mockTranscribeVideoUseCase.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Format Support', () => {
    it('should use default format when not specified', async () => {
      const request = {
        url: 'https://www.youtube.com/playlist?list=PLtest123'
      };

      mockPlaylistExtractor.extractVideoIds.mockResolvedValue({
        playlistId: 'PLtest123',
        playlistUrl: request.url,
        videoIds: ['videoId1'],
        videoCount: 1
      });

      mockTranscribeVideoUseCase.execute.mockResolvedValue({
        success: true,
        data: {
          transcript: [],
          format: TranscriptFormat.JSON,
          videoUrl: 'test',
          extractedAt: new Date().toISOString()
        }
      });

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.data?.format).toBe(TranscriptFormat.JSON);
    });

    it('should pass format to video transcription', async () => {
      const request = {
        url: 'https://www.youtube.com/playlist?list=PLtest123',
        format: TranscriptFormat.TEXT
      };

      mockPlaylistExtractor.extractVideoIds.mockResolvedValue({
        playlistId: 'PLtest123',
        playlistUrl: request.url,
        videoIds: ['videoId1'],
        videoCount: 1
      });

      mockTranscribeVideoUseCase.execute.mockResolvedValue({
        success: true,
        data: {
          transcript: [],
          format: TranscriptFormat.TEXT,
          videoUrl: 'test',
          extractedAt: new Date().toISOString()
        }
      });

      await useCase.execute(request);

      expect(mockTranscribeVideoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ format: TranscriptFormat.TEXT }),
        undefined
      );
    });
  });
});
