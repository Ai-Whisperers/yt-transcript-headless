import { CachedTranscript, CacheStats } from '../CachedTranscript';

/**
 * ICacheRepository defines the contract for transcript caching operations.
 * This interface belongs to the domain layer and is implemented by infrastructure.
 */
export interface ICacheRepository {
  /**
   * Get a cached transcript by video ID
   * Updates last accessed time and access count automatically
   * @returns CachedTranscript if found, null otherwise
   */
  getTranscript(videoId: string): Promise<CachedTranscript | null>;

  /**
   * Save a transcript to the cache
   * Uses INSERT OR REPLACE to handle duplicates
   */
  saveTranscript(transcript: CachedTranscript): Promise<void>;

  /**
   * Check if a transcript exists in cache
   * Does NOT update access time (lightweight check)
   */
  hasTranscript(videoId: string): Promise<boolean>;

  /**
   * Delete a transcript from cache
   */
  deleteTranscript(videoId: string): Promise<void>;

  /**
   * Get multiple transcripts by video IDs
   * Returns a Map for easy lookup (videoId -> CachedTranscript)
   * Updates access time for all retrieved transcripts
   */
  getTranscripts(videoIds: string[]): Promise<Map<string, CachedTranscript>>;

  /**
   * Save multiple transcripts in a single transaction
   * More efficient than calling saveTranscript multiple times
   */
  saveTranscripts(transcripts: CachedTranscript[]): Promise<void>;

  /**
   * Update the last accessed time for a transcript
   * Increments access count
   */
  updateAccessTime(videoId: string): Promise<void>;

  /**
   * Evict the oldest transcripts (LRU eviction)
   * @param count Number of transcripts to evict
   * @returns Number of transcripts actually evicted
   */
  evictOldest(count: number): Promise<number>;

  /**
   * Evict transcripts older than specified days
   * @param days Age threshold in days
   * @returns Number of transcripts evicted
   */
  evictOlderThan(days: number): Promise<number>;

  /**
   * Get cache statistics
   */
  getCacheStats(): Promise<CacheStats>;

  /**
   * Clear all transcripts from cache
   * WARNING: This is destructive and should be used with caution
   */
  clearCache(): Promise<void>;
}
