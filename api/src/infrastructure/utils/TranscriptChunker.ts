/**
 * TranscriptChunker - Utility for chunking transcripts into embedding-ready segments.
 *
 * Implements multiple chunking strategies optimized for semantic search:
 * - Time-based chunking (default: 30s chunks with 5s overlap)
 * - Sentence-based chunking (semantic boundaries)
 * - Fixed token chunking (for token-limited embeddings)
 *
 * Overlapping chunks improve context preservation and search recall.
 */

import { TranscriptSegment } from '../../domain/TranscriptSegment';
import { TranscriptChunk } from '../../domain/repositories/IVectorStore';

export interface ChunkingOptions {
  strategy?: 'time-based' | 'sentence-based' | 'token-based';
  chunkDurationSeconds?: number;  // For time-based (default: 30)
  overlapSeconds?: number;         // For time-based (default: 5)
  maxTokens?: number;              // For token-based (default: 400)
  overlapTokens?: number;          // For token-based (default: 50)
  minChunkLength?: number;         // Minimum text length (default: 50)
}

export class TranscriptChunker {
  /**
   * Parse time string (MM:SS or HH:MM:SS) to seconds
   */
  private static parseTimeToSeconds(timeStr: string): number {
    const parts = timeStr.split(':').map(p => parseInt(p, 10));

    if (parts.length === 2) {
      // MM:SS
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    return 0;
  }

  /**
   * Chunk transcript segments using specified strategy
   */
  static chunk(
    videoId: string,
    videoUrl: string,
    videoTitle: string | undefined,
    segments: TranscriptSegment[],
    options: ChunkingOptions = {}
  ): TranscriptChunk[] {
    const strategy = options.strategy || 'time-based';

    switch (strategy) {
      case 'time-based':
        return this.chunkByTime(videoId, videoUrl, videoTitle, segments, options);
      case 'sentence-based':
        return this.chunkBySentence(videoId, videoUrl, videoTitle, segments, options);
      case 'token-based':
        return this.chunkByTokens(videoId, videoUrl, videoTitle, segments, options);
      default:
        throw new Error(`Unknown chunking strategy: ${strategy}`);
    }
  }

  /**
   * Time-based chunking: Group segments into fixed-duration windows
   * Default: 30 second chunks with 5 second overlap
   *
   * Best for: Video transcripts, lecture content, podcasts
   */
  private static chunkByTime(
    videoId: string,
    videoUrl: string,
    videoTitle: string | undefined,
    segments: TranscriptSegment[],
    options: ChunkingOptions
  ): TranscriptChunk[] {
    if (segments.length === 0) {
      return [];
    }

    const chunkDuration = options.chunkDurationSeconds || 30;
    const overlapDuration = options.overlapSeconds || 5;
    const minChunkLength = options.minChunkLength || 50;

    const chunks: TranscriptChunk[] = [];

    // Parse segment times and calculate approximate durations
    const parsedSegments = segments.map((seg, idx) => {
      const start = this.parseTimeToSeconds(seg.time);
      const nextStart = idx < segments.length - 1
        ? this.parseTimeToSeconds(segments[idx + 1].time)
        : start + 3; // Assume 3 seconds for last segment
      const duration = nextStart - start;

      return { ...seg, start, duration };
    });

    if (parsedSegments.length === 0) {
      return [];
    }

    const totalDuration = parsedSegments[parsedSegments.length - 1].start + parsedSegments[parsedSegments.length - 1].duration;
    const stepDuration = chunkDuration - overlapDuration;

    let chunkIndex = 0;
    let startTime = 0;

    while (startTime < totalDuration) {
      const endTime = Math.min(startTime + chunkDuration, totalDuration);

      // Collect segments within time window
      const chunkSegments = segments.filter((seg, idx) => {
        const parsed = parsedSegments[idx];
        return parsed.start < endTime && (parsed.start + parsed.duration) > startTime;
      });

      if (chunkSegments.length === 0) {
        startTime += stepDuration;
        continue;
      }

      // Extract text
      const text = chunkSegments.map(seg => seg.text).join(' ').trim();

      // Skip chunks that are too short
      if (text.length < minChunkLength) {
        startTime += stepDuration;
        continue;
      }

      // Create chunk (without embedding - will be added later)
      const chunk: TranscriptChunk = {
        id: `${videoId}_${chunkIndex}`,
        videoId,
        videoUrl,
        videoTitle,
        chunkIndex,
        text,
        embedding: [], // Placeholder, filled by embedding service
        segments: chunkSegments,
        startTime,
        endTime,
        metadata: {
          strategy: 'time-based',
          chunkDuration,
          overlapDuration
        }
      };

      chunks.push(chunk);
      chunkIndex++;
      startTime += stepDuration;
    }

    return chunks;
  }

  /**
   * Sentence-based chunking: Group segments by sentence boundaries
   * Uses simple heuristics (period, question mark, exclamation)
   *
   * Best for: Structured content, Q&A videos, interviews
   */
  private static chunkBySentence(
    videoId: string,
    videoUrl: string,
    videoTitle: string | undefined,
    segments: TranscriptSegment[],
    options: ChunkingOptions
  ): TranscriptChunk[] {
    if (segments.length === 0) {
      return [];
    }

    const minChunkLength = options.minChunkLength || 50;
    const chunks: TranscriptChunk[] = [];
    let chunkIndex = 0;

    let currentSegments: TranscriptSegment[] = [];
    let currentText = '';
    let firstSegmentTime = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      currentSegments.push(segment);
      currentText += (currentText ? ' ' : '') + segment.text;

      if (currentSegments.length === 1) {
        firstSegmentTime = this.parseTimeToSeconds(segment.time);
      }

      // Check if we hit a sentence boundary
      const endsWithPunctuation = /[.!?]\s*$/.test(segment.text);
      const isLongEnough = currentText.length >= minChunkLength;
      const isLastSegment = i === segments.length - 1;

      if ((endsWithPunctuation && isLongEnough) || isLastSegment) {
        // Create chunk
        const lastSegmentTime = this.parseTimeToSeconds(currentSegments[currentSegments.length - 1].time);
        const endTime = lastSegmentTime + 3; // Assume 3 seconds for last segment

        const chunk: TranscriptChunk = {
          id: `${videoId}_${chunkIndex}`,
          videoId,
          videoUrl,
          videoTitle,
          chunkIndex,
          text: currentText.trim(),
          embedding: [],
          segments: [...currentSegments],
          startTime: firstSegmentTime,
          endTime,
          metadata: {
            strategy: 'sentence-based',
            segmentCount: currentSegments.length
          }
        };

        chunks.push(chunk);
        chunkIndex++;

        // Reset for next chunk
        currentSegments = [];
        currentText = '';
      }
    }

    return chunks;
  }

  /**
   * Token-based chunking: Group segments by approximate token count
   * Uses character-to-token approximation (~4 chars per token)
   *
   * Best for: Token-limited embedding models, uniform chunk sizes
   */
  private static chunkByTokens(
    videoId: string,
    videoUrl: string,
    videoTitle: string | undefined,
    segments: TranscriptSegment[],
    options: ChunkingOptions
  ): TranscriptChunk[] {
    if (segments.length === 0) {
      return [];
    }

    const maxTokens = options.maxTokens || 400;
    const overlapTokens = options.overlapTokens || 50;
    const charsPerToken = 4;

    const maxChars = maxTokens * charsPerToken;
    const overlapChars = overlapTokens * charsPerToken;
    const stepChars = maxChars - overlapChars;

    const chunks: TranscriptChunk[] = [];
    let chunkIndex = 0;
    let currentCharIndex = 0;

    // Build full text with segment markers
    const fullText = segments.map(seg => seg.text).join(' ');

    while (currentCharIndex < fullText.length) {
      const chunkStartChar = currentCharIndex;
      const chunkEndChar = Math.min(currentCharIndex + maxChars, fullText.length);
      const chunkText = fullText.substring(chunkStartChar, chunkEndChar).trim();

      if (chunkText.length === 0) {
        break;
      }

      // Find segments that overlap with this character range
      let charCount = 0;
      const chunkSegments: TranscriptSegment[] = [];
      let startTime = 0;
      let endTime = 0;

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentStart = charCount;
        const segmentEnd = charCount + segment.text.length + 1; // +1 for space

        if (segmentEnd > chunkStartChar && segmentStart < chunkEndChar) {
          if (chunkSegments.length === 0) {
            startTime = this.parseTimeToSeconds(segment.time);
          }
          chunkSegments.push(segment);
          endTime = this.parseTimeToSeconds(segment.time) + 3; // Assume 3 seconds
        }

        charCount = segmentEnd;
      }

      // Create chunk
      const chunk: TranscriptChunk = {
        id: `${videoId}_${chunkIndex}`,
        videoId,
        videoUrl,
        videoTitle,
        chunkIndex,
        text: chunkText,
        embedding: [],
        segments: chunkSegments,
        startTime,
        endTime,
        metadata: {
          strategy: 'token-based',
          maxTokens,
          overlapTokens,
          approximateTokens: Math.ceil(chunkText.length / charsPerToken)
        }
      };

      chunks.push(chunk);
      chunkIndex++;
      currentCharIndex += stepChars;
    }

    return chunks;
  }

  /**
   * Get recommended chunking options based on transcript characteristics
   */
  static getRecommendedOptions(segments: TranscriptSegment[]): ChunkingOptions {
    if (segments.length === 0) {
      return { strategy: 'time-based' };
    }

    // Calculate average segment length
    const avgSegmentLength = segments.reduce((sum, seg) => sum + seg.text.length, 0) / segments.length;

    // Calculate total duration
    const lastSegmentTime = this.parseTimeToSeconds(segments[segments.length - 1].time);
    const totalDuration = lastSegmentTime + 3; // Assume 3 seconds for last segment

    // Heuristics for strategy selection
    if (avgSegmentLength > 100 && totalDuration > 300) {
      // Long segments, long video - use sentence-based
      return { strategy: 'sentence-based', minChunkLength: 100 };
    } else if (totalDuration < 180) {
      // Short video - use smaller chunks
      return {
        strategy: 'time-based',
        chunkDurationSeconds: 20,
        overlapSeconds: 3
      };
    } else {
      // Default: time-based with standard settings
      return {
        strategy: 'time-based',
        chunkDurationSeconds: 30,
        overlapSeconds: 5
      };
    }
  }

  /**
   * Preview chunking results without creating full chunk objects
   */
  static previewChunking(
    segments: TranscriptSegment[],
    options: ChunkingOptions = {}
  ): { chunkCount: number; avgChunkLength: number; totalText: string } {
    const strategy = options.strategy || 'time-based';

    // Create temporary chunks without video metadata
    const tempChunks = this.chunk('preview', '', undefined, segments, options);

    const totalText = tempChunks.map(c => c.text).join(' ');
    const avgChunkLength = tempChunks.length > 0
      ? Math.round(totalText.length / tempChunks.length)
      : 0;

    return {
      chunkCount: tempChunks.length,
      avgChunkLength,
      totalText
    };
  }
}
