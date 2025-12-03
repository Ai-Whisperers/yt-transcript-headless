import { TranscriptSegment } from './TranscriptSegment';

/**
 * CachedTranscript domain model for persistent transcript storage
 */

export interface CachedTranscript {
  videoId: string;
  videoUrl: string;
  videoTitle?: string;
  transcript: TranscriptSegment[];
  srt?: string;
  text?: string;
  extractedAt: string;         // ISO timestamp
  lastAccessedAt: string;      // ISO timestamp (for LRU eviction)
  accessCount: number;
  extractionTimeMs?: number;
  errorCode?: string;          // If extraction failed
  errorMessage?: string;       // If extraction failed
}

export interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  oldestEntry?: string;        // ISO timestamp
  newestEntry?: string;        // ISO timestamp
  mostAccessed?: {
    videoId: string;
    accessCount: number;
  };
  hitRate?: number;            // Cache hit rate (0-1)
}

export interface CacheEvictionPolicy {
  maxEntries?: number;
  maxSizeBytes?: number;
  ttlDays?: number;
}
