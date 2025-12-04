/**
 * Unit tests for CacheEvictionService
 * Tests automatic cache eviction with LRU and TTL strategies
 */

import { CacheEvictionService, CacheEvictionConfig } from '../../../src/infrastructure/database/CacheEvictionService';
import { ICacheRepository } from '../../../src/domain/repositories/ICacheRepository';
import { CacheStats } from '../../../src/domain/CachedTranscript';
import { Logger } from '../../../src/infrastructure/Logger';

describe('CacheEvictionService', () => {
  let mockRepository: jest.Mocked<ICacheRepository>;
  let mockLogger: Logger;
  let service: CacheEvictionService;

  beforeEach(() => {
    // Mock cache repository
    mockRepository = {
      getTranscript: jest.fn(),
      saveTranscript: jest.fn(),
      hasTranscript: jest.fn(),
      deleteTranscript: jest.fn(),
      getTranscripts: jest.fn(),
      saveTranscripts: jest.fn(),
      updateAccessTime: jest.fn(),
      evictOldest: jest.fn(),
      evictOlderThan: jest.fn(),
      getCacheStats: jest.fn(),
      clearCache: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;
  });

  afterEach(() => {
    if (service && service.isActive()) {
      service.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      service = new CacheEvictionService(mockRepository, mockLogger);

      const config = service.getConfig();
      expect(config.maxEntries).toBe(10000);
      expect(config.maxSizeMB).toBe(500);
      expect(config.ttlDays).toBe(30);
      expect(config.policy).toBe('LRU');
      expect(config.intervalHours).toBe(6);
    });

    it('should initialize with custom config', () => {
      const customConfig: Partial<CacheEvictionConfig> = {
        maxEntries: 5000,
        maxSizeMB: 250,
        ttlDays: 15,
        policy: 'TTL',
        intervalHours: 12
      };

      service = new CacheEvictionService(mockRepository, mockLogger, customConfig);

      const config = service.getConfig();
      expect(config.maxEntries).toBe(5000);
      expect(config.maxSizeMB).toBe(250);
      expect(config.ttlDays).toBe(15);
      expect(config.policy).toBe('TTL');
      expect(config.intervalHours).toBe(12);
    });

    it('should read config from environment variables', () => {
      process.env.CACHE_MAX_ENTRIES = '2000';
      process.env.CACHE_MAX_SIZE_MB = '100';
      process.env.CACHE_TTL_DAYS = '7';
      process.env.CACHE_EVICTION_POLICY = 'TTL';
      process.env.CACHE_EVICTION_INTERVAL_HOURS = '24';

      service = new CacheEvictionService(mockRepository, mockLogger);

      const config = service.getConfig();
      expect(config.maxEntries).toBe(2000);
      expect(config.maxSizeMB).toBe(100);
      expect(config.ttlDays).toBe(7);
      expect(config.policy).toBe('TTL');
      expect(config.intervalHours).toBe(24);

      // Clean up
      delete process.env.CACHE_MAX_ENTRIES;
      delete process.env.CACHE_MAX_SIZE_MB;
      delete process.env.CACHE_TTL_DAYS;
      delete process.env.CACHE_EVICTION_POLICY;
      delete process.env.CACHE_EVICTION_INTERVAL_HOURS;
    });
  });

  describe('runEviction - LRU strategy', () => {
    beforeEach(() => {
      service = new CacheEvictionService(mockRepository, mockLogger, {
        policy: 'LRU',
        maxEntries: 1000,
        maxSizeMB: 100,
        ttlDays: 30,
        intervalHours: 6
      });
    });

    it('should evict when entry count exceeds limit', async () => {
      const statsBefore: CacheStats = {
        totalEntries: 1500,
        totalSizeBytes: 50 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      const statsAfter: CacheStats = {
        totalEntries: 1000,
        totalSizeBytes: 45 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      // runEviction calls getCacheStats 3 times:
      // 1. Before eviction (line 121)
      // 2. Inside runLRUEviction for size check (line 192)
      // 3. After eviction (line 145)
      mockRepository.getCacheStats
        .mockResolvedValueOnce(statsBefore)
        .mockResolvedValueOnce(statsBefore) // For size check in runLRUEviction
        .mockResolvedValueOnce(statsAfter);

      mockRepository.evictOldest.mockResolvedValue(500);

      const result = await service.runEviction();

      expect(mockRepository.evictOldest).toHaveBeenCalledWith(500);
      expect(result.evictedCount).toBe(500);
      expect(result.totalEntriesBefore).toBe(1500);
      expect(result.totalEntriesAfter).toBe(1000);
      expect(result.reason).toContain('LRU');
    });

    it('should evict when size exceeds limit', async () => {
      const statsBefore: CacheStats = {
        totalEntries: 900,
        totalSizeBytes: 150 * 1024 * 1024, // 150MB
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      const statsAfter: CacheStats = {
        totalEntries: 810,
        totalSizeBytes: 90 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      mockRepository.getCacheStats
        .mockResolvedValueOnce(statsBefore)
        .mockResolvedValueOnce(statsBefore) // After first check
        .mockResolvedValueOnce(statsAfter);

      mockRepository.evictOldest.mockResolvedValue(90);

      const result = await service.runEviction();

      // Should evict 10% to reduce size (900 * 0.1 = 90)
      expect(mockRepository.evictOldest).toHaveBeenCalledWith(90);
      expect(result.evictedCount).toBe(90);
    });

    it('should not evict when under limits', async () => {
      const stats: CacheStats = {
        totalEntries: 500,
        totalSizeBytes: 50 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      mockRepository.getCacheStats.mockResolvedValue(stats);

      const result = await service.runEviction();

      expect(mockRepository.evictOldest).not.toHaveBeenCalled();
      expect(result.evictedCount).toBe(0);
    });
  });

  describe('runEviction - TTL strategy', () => {
    beforeEach(() => {
      service = new CacheEvictionService(mockRepository, mockLogger, {
        policy: 'TTL',
        maxEntries: 1000,
        maxSizeMB: 100,
        ttlDays: 30,
        intervalHours: 6
      });
    });

    it('should evict based on age threshold', async () => {
      const statsBefore: CacheStats = {
        totalEntries: 800,
        totalSizeBytes: 40 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      const statsAfter: CacheStats = {
        totalEntries: 650,
        totalSizeBytes: 35 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      mockRepository.getCacheStats
        .mockResolvedValueOnce(statsBefore)
        .mockResolvedValueOnce(statsAfter);

      mockRepository.evictOlderThan.mockResolvedValue(150);

      const result = await service.runEviction();

      expect(mockRepository.evictOlderThan).toHaveBeenCalledWith(30);
      expect(result.evictedCount).toBe(150);
      expect(result.reason).toContain('older than 30 days');
    });

    it('should not evict when no old entries exist', async () => {
      const stats: CacheStats = {
        totalEntries: 500,
        totalSizeBytes: 25 * 1024 * 1024,
        oldestEntry: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        newestEntry: new Date().toISOString()
      };

      mockRepository.getCacheStats.mockResolvedValue(stats);
      mockRepository.evictOlderThan.mockResolvedValue(0);

      const result = await service.runEviction();

      expect(mockRepository.evictOlderThan).toHaveBeenCalledWith(30);
      expect(result.evictedCount).toBe(0);
    });
  });

  describe('runEviction - NONE strategy', () => {
    beforeEach(() => {
      service = new CacheEvictionService(mockRepository, mockLogger, {
        policy: 'NONE',
        maxEntries: 1000,
        maxSizeMB: 100,
        ttlDays: 30,
        intervalHours: 6
      });
    });

    it('should not evict anything', async () => {
      const stats: CacheStats = {
        totalEntries: 2000,
        totalSizeBytes: 200 * 1024 * 1024,
        oldestEntry: '2020-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      mockRepository.getCacheStats.mockResolvedValue(stats);

      const result = await service.runEviction();

      expect(mockRepository.evictOldest).not.toHaveBeenCalled();
      expect(mockRepository.evictOlderThan).not.toHaveBeenCalled();
      expect(result.evictedCount).toBe(0);
    });
  });

  describe('start/stop lifecycle', () => {
    beforeEach(() => {
      service = new CacheEvictionService(mockRepository, mockLogger, {
        policy: 'LRU',
        maxEntries: 1000,
        maxSizeMB: 100,
        ttlDays: 30,
        intervalHours: 0.001 // Very short interval for testing
      });

      mockRepository.getCacheStats.mockResolvedValue({
        totalEntries: 500,
        totalSizeBytes: 25 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      });
    });

    it('should start automatic eviction', () => {
      service.start();

      expect(service.isActive()).toBe(true);
    });

    it('should stop automatic eviction', () => {
      service.start();
      expect(service.isActive()).toBe(true);

      service.stop();
      expect(service.isActive()).toBe(false);
    });

    it('should not start if policy is NONE', () => {
      const noneService = new CacheEvictionService(mockRepository, mockLogger, {
        policy: 'NONE'
      });

      noneService.start();

      expect(noneService.isActive()).toBe(false);
    });

    it('should warn when starting already active service', () => {
      service.start();
      service.start(); // Start again

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cache eviction service already running'
      );
    });

    it('should not throw when stopping inactive service', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      service = new CacheEvictionService(mockRepository, mockLogger, {
        policy: 'LRU',
        maxEntries: 1000,
        maxSizeMB: 100,
        ttlDays: 30,
        intervalHours: 6
      });
    });

    it('should handle getCacheStats error', async () => {
      mockRepository.getCacheStats.mockRejectedValue(new Error('Database error'));

      await expect(service.runEviction()).rejects.toThrow('Cache eviction failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle evictOldest error', async () => {
      mockRepository.getCacheStats.mockResolvedValue({
        totalEntries: 2000,
        totalSizeBytes: 50 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      });

      mockRepository.evictOldest.mockRejectedValue(new Error('Eviction failed'));

      await expect(service.runEviction()).rejects.toThrow();
    });

    it('should handle evictOlderThan error', async () => {
      const ttlService = new CacheEvictionService(mockRepository, mockLogger, {
        policy: 'TTL'
      });

      mockRepository.getCacheStats.mockResolvedValue({
        totalEntries: 1000,
        totalSizeBytes: 50 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      });

      mockRepository.evictOlderThan.mockRejectedValue(new Error('Eviction failed'));

      await expect(ttlService.runEviction()).rejects.toThrow();
    });
  });

  describe('eviction statistics', () => {
    beforeEach(() => {
      service = new CacheEvictionService(mockRepository, mockLogger, {
        policy: 'LRU',
        maxEntries: 1000,
        maxSizeMB: 100,
        ttlDays: 30,
        intervalHours: 6
      });
    });

    it('should return detailed eviction result', async () => {
      const statsBefore: CacheStats = {
        totalEntries: 1500,
        totalSizeBytes: 80 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      const statsAfter: CacheStats = {
        totalEntries: 1000,
        totalSizeBytes: 55 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      };

      // runEviction calls getCacheStats 3 times for LRU policy
      mockRepository.getCacheStats
        .mockResolvedValueOnce(statsBefore)
        .mockResolvedValueOnce(statsBefore) // For size check in runLRUEviction
        .mockResolvedValueOnce(statsAfter);

      mockRepository.evictOldest.mockResolvedValue(500);

      const result = await service.runEviction();

      expect(result).toMatchObject({
        evictedCount: 500,
        totalEntriesBefore: 1500,
        totalEntriesAfter: 1000,
        totalSizeBytesBefore: 80 * 1024 * 1024,
        totalSizeBytesAfter: 55 * 1024 * 1024
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0); // Accept 0 for fast operations
      expect(result.timestamp).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it('should log eviction details', async () => {
      mockRepository.getCacheStats.mockResolvedValue({
        totalEntries: 1200,
        totalSizeBytes: 60 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      });

      mockRepository.evictOldest.mockResolvedValue(200);

      await service.runEviction();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cache eviction completed',
        expect.objectContaining({
          evictedCount: 200
        })
      );
    });

    it('should log debug when no eviction occurs', async () => {
      mockRepository.getCacheStats.mockResolvedValue({
        totalEntries: 500,
        totalSizeBytes: 25 * 1024 * 1024,
        oldestEntry: '2025-01-01T00:00:00Z',
        newestEntry: '2025-12-01T00:00:00Z'
      });

      await service.runEviction();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cache eviction completed (no entries evicted)',
        expect.any(Object)
      );
    });
  });

  describe('getConfig', () => {
    it('should return copy of config to prevent mutation', () => {
      service = new CacheEvictionService(mockRepository, mockLogger, {
        maxEntries: 5000
      });

      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different object instances

      // Mutating returned config should not affect internal config
      config1.maxEntries = 9999;
      expect(service.getConfig().maxEntries).toBe(5000);
    });
  });

  describe('isActive', () => {
    beforeEach(() => {
      service = new CacheEvictionService(mockRepository, mockLogger);
      mockRepository.getCacheStats.mockResolvedValue({
        totalEntries: 0,
        totalSizeBytes: 0
      });
    });

    it('should return false when not started', () => {
      expect(service.isActive()).toBe(false);
    });

    it('should return true when started', () => {
      service.start();
      expect(service.isActive()).toBe(true);
    });

    it('should return false after stopped', () => {
      service.start();
      service.stop();
      expect(service.isActive()).toBe(false);
    });
  });
});
