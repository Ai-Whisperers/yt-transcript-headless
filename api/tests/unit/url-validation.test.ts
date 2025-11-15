import { TranscribeVideoUseCase } from '../../src/application/TranscribeVideoUseCase';
import { TranscriptExtractor } from '../../src/infrastructure/TranscriptExtractor';
import { Logger } from '../../src/infrastructure/Logger';
import { TranscriptRequest, TranscriptFormat } from '../../src/domain/TranscriptSegment';
import { InvalidUrlError } from '../../src/domain/errors';

describe('YouTube URL Validation - Phase 2', () => {
  let useCase: TranscribeVideoUseCase;
  let mockExtractor: jest.Mocked<TranscriptExtractor>;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = new Logger('test-url-validation');
    mockExtractor = {
      extract: jest.fn()
    } as any;
    useCase = new TranscribeVideoUseCase(mockExtractor, mockLogger);
  });

  describe('Valid YouTube URLs', () => {
    const validUrls = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/v/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
      'https://youtu.be/dQw4w9WgXcQ?t=42',
    ];

    validUrls.forEach((url) => {
      it(`should accept valid URL: ${url}`, async () => {
        mockExtractor.extract.mockResolvedValue([
          { time: '0:00', text: 'Test transcript' }
        ]);

        const request: TranscriptRequest = {
          url,
          format: TranscriptFormat.JSON
        };

        const result = await useCase.execute(request);

        expect(result.success).toBe(true);
        expect(mockExtractor.extract).toHaveBeenCalledWith(url, undefined);
      });
    });
  });

  describe('Invalid YouTube URLs', () => {
    const invalidUrls = [
      { url: 'https://example.com/watch?v=dQw4w9WgXcQ', reason: 'wrong domain' },
      { url: 'https://www.youtube.com/watch', reason: 'missing video ID' },
      { url: 'https://www.youtube.com/watch?v=', reason: 'empty video ID' },
      { url: 'https://youtu.be/', reason: 'missing video ID in short URL' },
      { url: 'https://www.youtube.com/watch?v=invalid', reason: 'invalid ID length' },
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ!!!', reason: 'invalid ID characters' },
      { url: 'not-a-url', reason: 'malformed URL' },
      { url: 'ftp://youtube.com/watch?v=dQw4w9WgXcQ', reason: 'wrong protocol' },
      { url: '', reason: 'empty string' },
    ];

    invalidUrls.forEach(({ url, reason }) => {
      it(`should reject invalid URL (${reason}): ${url || '(empty)'}`, async () => {
        const request: TranscriptRequest = {
          url,
          format: TranscriptFormat.JSON
        };

        await expect(useCase.execute(request)).rejects.toThrow(InvalidUrlError);
        expect(mockExtractor.extract).not.toHaveBeenCalled();
      });
    });
  });

  describe('Video ID Extraction', () => {
    it('should handle various YouTube URL formats', async () => {
      const urlFormats = [
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
        { url: 'https://youtu.be/dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
        { url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
        { url: 'https://www.youtube.com/v/dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
      ];

      mockExtractor.extract.mockResolvedValue([
        { time: '0:00', text: 'Test' }
      ]);

      for (const { url, expectedId } of urlFormats) {
        const request: TranscriptRequest = { url, format: TranscriptFormat.JSON };
        const result = await useCase.execute(request);

        expect(result.success).toBe(true);
        expect(mockExtractor.extract).toHaveBeenCalledWith(url, undefined);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should reject URL with special characters in video ID', async () => {
      const request: TranscriptRequest = {
        url: 'https://www.youtube.com/watch?v=dQw4w9Wg<>Q',
        format: TranscriptFormat.JSON
      };

      await expect(useCase.execute(request)).rejects.toThrow(InvalidUrlError);
    });

    it('should accept valid video ID with allowed characters (alphanumeric, -, _)', async () => {
      mockExtractor.extract.mockResolvedValue([
        { time: '0:00', text: 'Test' }
      ]);

      const request: TranscriptRequest = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        format: TranscriptFormat.JSON
      };

      const result = await useCase.execute(request);
      expect(result.success).toBe(true);
    });

    it('should reject video ID that is too short', async () => {
      const request: TranscriptRequest = {
        url: 'https://www.youtube.com/watch?v=short',
        format: TranscriptFormat.JSON
      };

      await expect(useCase.execute(request)).rejects.toThrow(InvalidUrlError);
    });

    it('should reject video ID that is too long', async () => {
      const request: TranscriptRequest = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQTooLong',
        format: TranscriptFormat.JSON
      };

      await expect(useCase.execute(request)).rejects.toThrow(InvalidUrlError);
    });
  });

  describe('Performance and Early Validation', () => {
    it('should validate URL before launching browser', async () => {
      const request: TranscriptRequest = {
        url: 'https://invalid-domain.com/watch?v=dQw4w9WgXcQ',
        format: TranscriptFormat.JSON
      };

      const startTime = Date.now();
      await expect(useCase.execute(request)).rejects.toThrow(InvalidUrlError);
      const duration = Date.now() - startTime;

      // Should fail fast (< 100ms) without launching browser
      expect(duration).toBeLessThan(100);
      expect(mockExtractor.extract).not.toHaveBeenCalled();
    });
  });
});
