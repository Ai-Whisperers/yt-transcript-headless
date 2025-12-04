/**
 * CacheEvictionService - Automatic cache eviction based on configurable policies.
 *
 * Supports multiple eviction strategies:
 * - LRU (Least Recently Used): Evict oldest accessed transcripts
 * - TTL (Time To Live): Evict transcripts older than specified days
 * - Size-based: Evict when cache exceeds entry or size limits
 *
 * Environment Variables:
 * - CACHE_MAX_ENTRIES: Maximum number of cached transcripts (default: 10000)
 * - CACHE_MAX_SIZE_MB: Maximum cache size in megabytes (default: 500)
 * - CACHE_TTL_DAYS: Age threshold for TTL eviction (default: 30)
 * - CACHE_EVICTION_POLICY: Eviction strategy ('LRU' | 'TTL' | 'NONE', default: 'LRU')
 * - CACHE_EVICTION_INTERVAL_HOURS: How often to run eviction (default: 6)
 */

import { ICacheRepository } from '../../domain/repositories/ICacheRepository';
import { Logger } from '../Logger';

export interface CacheEvictionConfig {
  maxEntries: number;           // Maximum number of cached transcripts
  maxSizeMB: number;             // Maximum cache size in megabytes
  ttlDays: number;               // Age threshold for TTL eviction
  policy: 'LRU' | 'TTL' | 'NONE'; // Eviction strategy
  intervalHours: number;         // How often to run eviction
}

export class CacheEvictionService {
  private config: CacheEvictionConfig;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    private cacheRepository: ICacheRepository,
    private logger: Logger,
    config?: Partial<CacheEvictionConfig>
  ) {
    this.config = {
      maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES || '10000', 10),
      maxSizeMB: parseInt(process.env.CACHE_MAX_SIZE_MB || '500', 10),
      ttlDays: parseInt(process.env.CACHE_TTL_DAYS || '30', 10),
      policy: (process.env.CACHE_EVICTION_POLICY as 'LRU' | 'TTL' | 'NONE') || 'LRU',
      intervalHours: parseInt(process.env.CACHE_EVICTION_INTERVAL_HOURS || '6', 10),
      ...config
    };

    this.logger.info('Cache eviction service initialized', {
      config: this.config
    });
  }

  /**
   * Start automatic cache eviction
   * Runs eviction immediately, then schedules periodic eviction
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Cache eviction service already running');
      return;
    }

    if (this.config.policy === 'NONE') {
      this.logger.info('Cache eviction disabled (policy: NONE)');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting cache eviction service', {
      policy: this.config.policy,
      intervalHours: this.config.intervalHours
    });

    // Run eviction immediately
    this.runEviction().catch(error => {
      this.logger.error('Initial cache eviction failed', error);
    });

    // Schedule periodic eviction
    const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
    this.timer = setInterval(() => {
      this.runEviction().catch(error => {
        this.logger.error('Scheduled cache eviction failed', error);
      });
    }, intervalMs);

    this.logger.info('Cache eviction service started', {
      nextRunInHours: this.config.intervalHours
    });
  }

  /**
   * Stop automatic cache eviction
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.isRunning = false;
    this.logger.info('Cache eviction service stopped');
  }

  /**
   * Manually trigger cache eviction
   * Returns eviction statistics
   */
  async runEviction(): Promise<EvictionResult> {
    const startTime = Date.now();

    try {
      this.logger.debug('Running cache eviction', {
        policy: this.config.policy
      });

      // Get current cache stats
      const statsBefore = await this.cacheRepository.getCacheStats();

      let evictedCount = 0;
      let evictionReason = '';

      switch (this.config.policy) {
        case 'LRU':
          evictedCount = await this.runLRUEviction(statsBefore.totalEntries);
          evictionReason = 'LRU (Least Recently Used)';
          break;

        case 'TTL':
          evictedCount = await this.runTTLEviction();
          evictionReason = `TTL (older than ${this.config.ttlDays} days)`;
          break;

        case 'NONE':
          // No eviction
          break;

        default:
          this.logger.warn('Unknown eviction policy', { policy: this.config.policy });
      }

      const statsAfter = await this.cacheRepository.getCacheStats();
      const durationMs = Date.now() - startTime;

      const result: EvictionResult = {
        evictedCount,
        totalEntriesBefore: statsBefore.totalEntries,
        totalEntriesAfter: statsAfter.totalEntries,
        totalSizeBytesBefore: statsBefore.totalSizeBytes,
        totalSizeBytesAfter: statsAfter.totalSizeBytes,
        durationMs,
        reason: evictionReason,
        timestamp: new Date().toISOString()
      };

      if (evictedCount > 0) {
        this.logger.info('Cache eviction completed', result);
      } else {
        this.logger.debug('Cache eviction completed (no entries evicted)', result);
      }

      return result;
    } catch (error: any) {
      this.logger.error('Cache eviction failed', error);
      throw new Error(`Cache eviction failed: ${error.message}`);
    }
  }

  /**
   * Run LRU eviction based on max entries and max size
   */
  private async runLRUEviction(currentEntries: number): Promise<number> {
    let totalEvicted = 0;

    // Check entry count limit
    if (currentEntries > this.config.maxEntries) {
      const entriesToEvict = currentEntries - this.config.maxEntries;
      const evicted = await this.cacheRepository.evictOldest(entriesToEvict);
      totalEvicted += evicted;

      this.logger.info('Evicted transcripts due to entry limit', {
        limit: this.config.maxEntries,
        currentEntries,
        evicted
      });
    }

    // Check size limit (approximate check using cache stats)
    const stats = await this.cacheRepository.getCacheStats();
    const currentSizeMB = stats.totalSizeBytes / (1024 * 1024);

    if (currentSizeMB > this.config.maxSizeMB) {
      // Evict 10% of cache to reduce size
      const entriesToEvict = Math.ceil(stats.totalEntries * 0.1);
      const evicted = await this.cacheRepository.evictOldest(entriesToEvict);
      totalEvicted += evicted;

      this.logger.info('Evicted transcripts due to size limit', {
        limit: this.config.maxSizeMB,
        currentSizeMB: currentSizeMB.toFixed(2),
        evicted
      });
    }

    return totalEvicted;
  }

  /**
   * Run TTL eviction based on age threshold
   */
  private async runTTLEviction(): Promise<number> {
    const evicted = await this.cacheRepository.evictOlderThan(this.config.ttlDays);

    if (evicted > 0) {
      this.logger.info('Evicted old transcripts', {
        ttlDays: this.config.ttlDays,
        evicted
      });
    }

    return evicted;
  }

  /**
   * Get current eviction configuration
   */
  getConfig(): CacheEvictionConfig {
    return { ...this.config };
  }

  /**
   * Check if eviction service is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * Result of cache eviction operation
 */
export interface EvictionResult {
  evictedCount: number;
  totalEntriesBefore: number;
  totalEntriesAfter: number;
  totalSizeBytesBefore: number;
  totalSizeBytesAfter: number;
  durationMs: number;
  reason: string;
  timestamp: string;
}
