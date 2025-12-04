/**
 * Unit tests for TranscriptChunker
 * Tests time-based, sentence-based, and token-based chunking strategies
 */

import { TranscriptChunker, ChunkingOptions } from '../../../src/infrastructure/utils/TranscriptChunker';
import { TranscriptSegment } from '../../../src/domain/TranscriptSegment';

describe('TranscriptChunker', () => {
  const sampleSegments: TranscriptSegment[] = [
    { time: '0:00', text: 'Welcome to this video tutorial.' },
    { time: '0:05', text: 'Today we will learn about neural networks.' },
    { time: '0:12', text: 'Neural networks are inspired by the human brain.' },
    { time: '0:20', text: 'They consist of interconnected nodes called neurons.' },
    { time: '0:28', text: 'Each neuron processes information and passes it forward.' },
    { time: '0:36', text: 'Training involves adjusting weights through backpropagation.' },
    { time: '0:45', text: 'This is a fascinating topic!' },
    { time: '0:50', text: 'Let me explain in more detail.' },
    { time: '0:55', text: 'First, consider the input layer.' },
    { time: '1:02', text: 'It receives the raw data.' },
    { time: '1:08', text: 'Then hidden layers process the information.' },
    { time: '1:15', text: 'Finally, the output layer produces results.' }
  ];

  describe('time-based chunking', () => {
    it('should chunk by default 30-second windows with 5-second overlap', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        { strategy: 'time-based' }
      );

      expect(chunks.length).toBeGreaterThan(0);

      chunks.forEach(chunk => {
        expect(chunk.videoId).toBe('video123');
        expect(chunk.videoUrl).toBe('https://www.youtube.com/watch?v=video123');
        expect(chunk.videoTitle).toBe('Test Video');
        expect(chunk.text.length).toBeGreaterThan(0);
        expect(chunk.metadata?.strategy).toBe('time-based');
      });
    });

    it('should respect custom chunk duration', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        {
          strategy: 'time-based',
          chunkDurationSeconds: 20,
          overlapSeconds: 5
        }
      );

      // Verify chunk time boundaries
      chunks.forEach(chunk => {
        const duration = chunk.endTime - chunk.startTime;
        expect(duration).toBeLessThanOrEqual(20);
        expect(chunk.metadata?.chunkDuration).toBe(20);
      });
    });

    it('should create overlapping chunks', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        {
          strategy: 'time-based',
          chunkDurationSeconds: 30,
          overlapSeconds: 10
        }
      );

      // Check that consecutive chunks overlap
      if (chunks.length > 1) {
        for (let i = 0; i < chunks.length - 1; i++) {
          const currentChunk = chunks[i];
          const nextChunk = chunks[i + 1];

          // Next chunk should start before current chunk ends (overlap)
          const overlap = currentChunk.endTime - nextChunk.startTime;
          expect(overlap).toBeGreaterThan(0);
        }
      }
    });

    it('should filter out chunks shorter than minimum length', () => {
      const shortSegments: TranscriptSegment[] = [
        { time: '0:00', text: 'Hi' },
        { time: '0:02', text: 'A' }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        shortSegments,
        {
          strategy: 'time-based',
          minChunkLength: 50 // Require at least 50 characters
        }
      );

      chunks.forEach(chunk => {
        expect(chunk.text.length).toBeGreaterThanOrEqual(50);
      });
    });

    it('should handle empty segments array', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        [],
        { strategy: 'time-based' }
      );

      expect(chunks).toEqual([]);
    });

    it('should parse MM:SS time format correctly', () => {
      const segments: TranscriptSegment[] = [
        { time: '0:00', text: 'This is the start of our transcript with enough content to ensure it passes any length requirements.' },
        { time: '0:30', text: 'This is the middle section with more interesting content for the transcript chunking test.' },
        { time: '1:00', text: 'This is the end of our test transcript segment for MM:SS time format validation.' }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        segments,
        { strategy: 'time-based' }
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].startTime).toBe(0);
    });

    it('should parse HH:MM:SS time format correctly', () => {
      const segments: TranscriptSegment[] = [
        { time: '0:00:00', text: 'This is the start of our long form transcript with enough content for testing HH:MM:SS format parsing in TranscriptChunker.' },
        { time: '0:30:00', text: 'This is the middle section after 30 minutes with more detailed content for comprehensive testing.' },
        { time: '1:00:00', text: 'This is the final section after one full hour of transcript content for validation purposes.' }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        segments,
        { strategy: 'time-based' }
      );

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('sentence-based chunking', () => {
    it('should chunk by sentence boundaries', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        { strategy: 'sentence-based' }
      );

      expect(chunks.length).toBeGreaterThan(0);

      chunks.forEach(chunk => {
        expect(chunk.metadata?.strategy).toBe('sentence-based');
        // Each chunk should contain complete sentences
        expect(chunk.text.trim().length).toBeGreaterThan(0);
      });
    });

    it('should respect minimum chunk length', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        {
          strategy: 'sentence-based',
          minChunkLength: 100
        }
      );

      // All chunks except the last should meet minimum length
      // (Last chunk may be shorter to avoid losing content)
      chunks.slice(0, -1).forEach(chunk => {
        expect(chunk.text.length).toBeGreaterThanOrEqual(100);
      });

      // Verify we got some chunks
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should detect sentence endings with period', () => {
      const segments: TranscriptSegment[] = [
        { time: '0:00', text: 'This is sentence one.' },
        { time: '0:05', text: 'This is sentence two.' },
        { time: '0:10', text: 'This is sentence three.' }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        segments,
        {
          strategy: 'sentence-based',
          minChunkLength: 10
        }
      );

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should detect sentence endings with question mark', () => {
      const segments: TranscriptSegment[] = [
        { time: '0:00', text: 'What is this?' },
        { time: '0:03', text: 'This is a test.' },
        { time: '0:06', text: 'Is it working?' }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        segments,
        {
          strategy: 'sentence-based',
          minChunkLength: 10
        }
      );

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should detect sentence endings with exclamation mark', () => {
      const segments: TranscriptSegment[] = [
        { time: '0:00', text: 'This is amazing!' },
        { time: '0:03', text: 'I love this!' },
        { time: '0:06', text: 'Incredible!' }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        segments,
        {
          strategy: 'sentence-based',
          minChunkLength: 10
        }
      );

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle segments without sentence endings', () => {
      const segments: TranscriptSegment[] = [
        { time: '0:00', text: 'This keeps going' },
        { time: '0:05', text: 'and going' },
        { time: '0:10', text: 'without punctuation' }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        segments,
        {
          strategy: 'sentence-based',
          minChunkLength: 10
        }
      );

      // Should still create at least one chunk with all segments
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('token-based chunking', () => {
    it('should chunk by approximate token count', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        {
          strategy: 'token-based',
          maxTokens: 400,
          overlapTokens: 50
        }
      );

      expect(chunks.length).toBeGreaterThan(0);

      chunks.forEach(chunk => {
        expect(chunk.metadata?.strategy).toBe('token-based');
        expect(chunk.metadata?.maxTokens).toBe(400);
        expect(chunk.metadata?.approximateTokens).toBeDefined();

        // Check approximate token count (4 chars per token)
        const approxTokens = Math.ceil(chunk.text.length / 4);
        expect(approxTokens).toBeLessThanOrEqual(400 + 50); // Allow some variance
      });
    });

    it('should respect custom token limits', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        {
          strategy: 'token-based',
          maxTokens: 100,
          overlapTokens: 20
        }
      );

      chunks.forEach(chunk => {
        const approxTokens = Math.ceil(chunk.text.length / 4);
        expect(approxTokens).toBeLessThanOrEqual(120); // Max + overlap
      });
    });

    it('should create overlapping token chunks', () => {
      const longText = 'word '.repeat(200); // Create long text
      const segments: TranscriptSegment[] = [
        { time: '0:00', text: longText }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        segments,
        {
          strategy: 'token-based',
          maxTokens: 100,
          overlapTokens: 20
        }
      );

      // Should create multiple chunks with overlap
      if (chunks.length > 1) {
        expect(chunks[0].metadata?.overlapTokens).toBe(20);
      }
    });

    it('should handle short text gracefully', () => {
      const segments: TranscriptSegment[] = [
        { time: '0:00', text: 'Short text.' }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        segments,
        {
          strategy: 'token-based',
          maxTokens: 400
        }
      );

      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe('Short text.');
    });
  });

  describe('getRecommendedOptions', () => {
    it('should recommend sentence-based for long segments and long videos', () => {
      const longSegments: TranscriptSegment[] = Array(100).fill(null).map((_, i) => ({
        time: `${Math.floor(i * 5 / 60)}:${(i * 5) % 60}`,
        text: 'This is a really long segment with lots of detailed information about a complex topic that requires comprehensive explanation and analysis.'
      }));

      const options = TranscriptChunker.getRecommendedOptions(longSegments);

      expect(options.strategy).toBe('sentence-based');
      expect(options.minChunkLength).toBe(100);
    });

    it('should recommend time-based with smaller chunks for short videos', () => {
      const shortSegments: TranscriptSegment[] = [
        { time: '0:00', text: 'Quick intro.' },
        { time: '0:30', text: 'Main point.' },
        { time: '1:00', text: 'Conclusion.' }
      ];

      const options = TranscriptChunker.getRecommendedOptions(shortSegments);

      expect(options.strategy).toBe('time-based');
      expect(options.chunkDurationSeconds).toBe(20);
      expect(options.overlapSeconds).toBe(3);
    });

    it('should recommend time-based with standard settings for normal videos', () => {
      const normalSegments: TranscriptSegment[] = Array(60).fill(null).map((_, i) => ({
        time: `${Math.floor(i * 5 / 60)}:${(i * 5) % 60}`,
        text: 'Normal segment text.'
      }));

      const options = TranscriptChunker.getRecommendedOptions(normalSegments);

      expect(options.strategy).toBe('time-based');
      expect(options.chunkDurationSeconds).toBe(30);
      expect(options.overlapSeconds).toBe(5);
    });

    it('should handle empty segments array', () => {
      const options = TranscriptChunker.getRecommendedOptions([]);

      expect(options.strategy).toBe('time-based');
    });
  });

  describe('previewChunking', () => {
    it('should return chunking preview without full chunk objects', () => {
      const preview = TranscriptChunker.previewChunking(sampleSegments, {
        strategy: 'time-based'
      });

      expect(preview.chunkCount).toBeGreaterThan(0);
      expect(preview.avgChunkLength).toBeGreaterThan(0);
      expect(preview.totalText.length).toBeGreaterThan(0);
    });

    it('should calculate average chunk length correctly', () => {
      const preview = TranscriptChunker.previewChunking(sampleSegments, {
        strategy: 'time-based',
        chunkDurationSeconds: 30
      });

      expect(preview.avgChunkLength).toBe(
        Math.round(preview.totalText.length / preview.chunkCount)
      );
    });

    it('should work with different strategies', () => {
      const timePreview = TranscriptChunker.previewChunking(sampleSegments, {
        strategy: 'time-based'
      });

      const sentencePreview = TranscriptChunker.previewChunking(sampleSegments, {
        strategy: 'sentence-based'
      });

      const tokenPreview = TranscriptChunker.previewChunking(sampleSegments, {
        strategy: 'token-based'
      });

      expect(timePreview.chunkCount).toBeGreaterThan(0);
      expect(sentencePreview.chunkCount).toBeGreaterThan(0);
      expect(tokenPreview.chunkCount).toBeGreaterThan(0);
    });

    it('should handle empty segments', () => {
      const preview = TranscriptChunker.previewChunking([], {
        strategy: 'time-based'
      });

      expect(preview.chunkCount).toBe(0);
      expect(preview.avgChunkLength).toBe(0);
      expect(preview.totalText).toBe('');
    });
  });

  describe('chunk metadata', () => {
    it('should include segments in chunks', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        { strategy: 'time-based' }
      );

      chunks.forEach(chunk => {
        expect(chunk.segments).toBeDefined();
        expect(chunk.segments.length).toBeGreaterThan(0);

        chunk.segments.forEach(segment => {
          expect(segment).toHaveProperty('time');
          expect(segment).toHaveProperty('text');
        });
      });
    });

    it('should assign sequential chunk indices', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        { strategy: 'time-based' }
      );

      chunks.forEach((chunk, index) => {
        expect(chunk.chunkIndex).toBe(index);
      });
    });

    it('should generate unique chunk IDs', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        { strategy: 'time-based' }
      );

      const ids = new Set(chunks.map(c => c.id));
      expect(ids.size).toBe(chunks.length); // All IDs should be unique
    });

    it('should include start and end times', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        { strategy: 'time-based' }
      );

      chunks.forEach(chunk => {
        expect(chunk.startTime).toBeDefined();
        expect(chunk.endTime).toBeDefined();
        expect(chunk.endTime).toBeGreaterThan(chunk.startTime);
      });
    });

    it('should include empty embedding array', () => {
      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        sampleSegments,
        { strategy: 'time-based' }
      );

      chunks.forEach(chunk => {
        expect(chunk.embedding).toEqual([]);
      });
    });
  });

  describe('error handling', () => {
    it('should throw error for unknown strategy', () => {
      expect(() => {
        TranscriptChunker.chunk(
          'video123',
          'https://www.youtube.com/watch?v=video123',
          'Test Video',
          sampleSegments,
          { strategy: 'invalid-strategy' as any }
        );
      }).toThrow('Unknown chunking strategy');
    });

    it('should handle malformed time strings gracefully', () => {
      const malformedSegments: TranscriptSegment[] = [
        { time: 'invalid', text: 'Test' },
        { time: '0:00', text: 'Valid' }
      ];

      const chunks = TranscriptChunker.chunk(
        'video123',
        'https://www.youtube.com/watch?v=video123',
        'Test Video',
        malformedSegments,
        { strategy: 'time-based' }
      );

      // Should still produce chunks even with some malformed times
      expect(chunks).toBeDefined();
    });
  });
});
