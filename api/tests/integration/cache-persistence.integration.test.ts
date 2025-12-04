/**
 * Integration Tests for Cache Persistence Layer
 * Tests how caching integrates with transcript extraction use cases
 *
 * Test Coverage:
 * - Cache-first pattern (check cache → extract missing → save → merge)
 * - Cache hit/miss scenarios and performance
 * - Automatic eviction triggers
 * - Job tracking throughout batch operations
 * - Access time tracking for LRU
 */

import Database from 'better-sqlite3';
import { SQLiteCacheRepository } from '../../src/infrastructure/database/SQLiteCacheRepository';
import { SQLiteJobRepository } from '../../src/infrastructure/database/SQLiteJobRepository';
import { CacheEvictionService } from '../../src/infrastructure/database/CacheEvictionService';
import { CachedTranscript } from '../../src/domain/CachedTranscript';
import { Job, JobStatus } from '../../src/domain/Job';
import { Logger } from '../../src/infrastructure/Logger';

describe('Cache Persistence Integration Tests', () => {
  let db: Database.Database;
  let cacheRepo: SQLiteCacheRepository;
  let jobRepo: SQLiteJobRepository;
  let evictionService: CacheEvictionService;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create in-memory database with full schema
    db = new Database(':memory:');

    // Create transcripts table
    db.exec(`
      CREATE TABLE transcripts (
        video_id TEXT PRIMARY KEY,
        video_url TEXT NOT NULL,
        video_title TEXT,
        transcript_json TEXT NOT NULL,
        srt_text TEXT,
        plain_text TEXT,
        extracted_at TEXT NOT NULL,
        last_accessed_at TEXT NOT NULL,
        access_count INTEGER DEFAULT 1,
        extraction_time_ms INTEGER,
        error_code TEXT,
        error_message TEXT
      );
      CREATE INDEX idx_transcripts_last_accessed ON transcripts(last_accessed_at);
    `);

    // Create jobs tables
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        total_items INTEGER NOT NULL,
        processed_items INTEGER DEFAULT 0,
        successful_items INTEGER DEFAULT 0,
        failed_items INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT,
        metadata TEXT
      );

      CREATE TABLE job_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        video_url TEXT NOT NULL,
        success INTEGER NOT NULL,
        error_code TEXT,
        error_message TEXT,
        processing_time_ms INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_jobs_status ON jobs(status);
      CREATE INDEX idx_jobs_created_at ON jobs(created_at);
      CREATE INDEX idx_job_results_job_id ON job_results(job_id);
    `);

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    cacheRepo = new SQLiteCacheRepository(db, mockLogger);
    jobRepo = new SQLiteJobRepository(db, mockLogger);
    evictionService = new CacheEvictionService(cacheRepo, mockLogger, {
      policy: 'LRU',
      maxEntries: 10,
      maxSizeMB: 1,
      ttlDays: 7,
      intervalHours: 1
    });
  });

  afterEach(() => {
    if (evictionService.isActive()) {
      evictionService.stop();
    }
    db.close();
  });

  describe('Cache-First Pattern', () => {
    it('should check cache before extraction (cache hit)', async () => {
      // Simulate cached transcript
      const cachedTranscript: CachedTranscript = {
        videoId: 'cached123',
        videoUrl: 'https://www.youtube.com/watch?v=cached123',
        videoTitle: 'Cached Video',
        transcript: [
          { time: '0:00', text: 'Cached content' }
        ],
        extractedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        lastAccessedAt: new Date(Date.now() - 3600000).toISOString(),
        accessCount: 1
      };

      await cacheRepo.saveTranscript(cachedTranscript);

      // Check cache (simulating use case behavior)
      const fromCache = await cacheRepo.getTranscript('cached123');

      expect(fromCache).not.toBeNull();
      expect(fromCache?.videoId).toBe('cached123');
      expect(fromCache?.accessCount).toBe(2); // Incremented on access
      expect(new Date(fromCache!.lastAccessedAt).getTime()).toBeGreaterThan(
        new Date(cachedTranscript.lastAccessedAt).getTime()
      );
    });

    it('should handle cache miss gracefully', async () => {
      const fromCache = await cacheRepo.getTranscript('nonexistent');

      expect(fromCache).toBeNull();
      // In real use case, would proceed to extraction
    });

    it('should save fresh extraction to cache', async () => {
      const freshTranscript: CachedTranscript = {
        videoId: 'fresh123',
        videoUrl: 'https://www.youtube.com/watch?v=fresh123',
        videoTitle: 'Fresh Video',
        transcript: [
          { time: '0:00', text: 'Fresh content' }
        ],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1,
        extractionTimeMs: 2500
      };

      await cacheRepo.saveTranscript(freshTranscript);

      // Verify saved
      const retrieved = await cacheRepo.getTranscript('fresh123');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.extractionTimeMs).toBe(2500);
    });

    it('should merge cached and fresh results in batch operation', async () => {
      // Simulate batch with 3 videos: 2 cached, 1 fresh
      const cached1: CachedTranscript = {
        videoId: 'batch1',
        videoUrl: 'https://www.youtube.com/watch?v=batch1',
        transcript: [{ time: '0:00', text: 'Cached 1' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };

      const cached2: CachedTranscript = {
        videoId: 'batch2',
        videoUrl: 'https://www.youtube.com/watch?v=batch2',
        transcript: [{ time: '0:00', text: 'Cached 2' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };

      // Save 2 to cache
      await cacheRepo.saveTranscripts([cached1, cached2]);

      // Simulate batch operation
      const requestedIds = ['batch1', 'batch2', 'batch3'];
      const cachedResults = await cacheRepo.getTranscripts(requestedIds);

      expect(cachedResults.size).toBe(2); // 2 cache hits
      expect(cachedResults.has('batch1')).toBe(true);
      expect(cachedResults.has('batch2')).toBe(true);
      expect(cachedResults.has('batch3')).toBe(false); // Cache miss

      // Simulate extraction of missing video
      const fresh: CachedTranscript = {
        videoId: 'batch3',
        videoUrl: 'https://www.youtube.com/watch?v=batch3',
        transcript: [{ time: '0:00', text: 'Fresh 3' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };

      await cacheRepo.saveTranscript(fresh);

      // Verify all 3 now available
      const allResults = await cacheRepo.getTranscripts(requestedIds);
      expect(allResults.size).toBe(3);
    });
  });

  describe('Cache Performance Metrics', () => {
    it('should track cache hit rate in batch operations', async () => {
      // Seed cache with 7 transcripts
      const cachedTranscripts: CachedTranscript[] = Array.from({ length: 7 }, (_, i) => ({
        videoId: `cached${i}`,
        videoUrl: `https://www.youtube.com/watch?v=cached${i}`,
        transcript: [{ time: '0:00', text: `Content ${i}` }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      }));

      await cacheRepo.saveTranscripts(cachedTranscripts);

      // Request 10 videos (7 cached, 3 new)
      const requestedIds = [
        ...Array.from({ length: 7 }, (_, i) => `cached${i}`),
        'new1', 'new2', 'new3'
      ];

      const cachedResults = await cacheRepo.getTranscripts(requestedIds);
      const cacheHitRate = (cachedResults.size / requestedIds.length) * 100;

      expect(cacheHitRate).toBe(70); // 7/10 = 70% hit rate
      expect(cachedResults.size).toBe(7);
    });

    it('should measure cache lookup performance', async () => {
      // Seed with 100 transcripts
      const transcripts: CachedTranscript[] = Array.from({ length: 100 }, (_, i) => ({
        videoId: `perf${i}`,
        videoUrl: `https://www.youtube.com/watch?v=perf${i}`,
        transcript: [{ time: '0:00', text: `Content ${i}` }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      }));

      await cacheRepo.saveTranscripts(transcripts);

      // Measure lookup time
      const start = Date.now();
      await cacheRepo.getTranscript('perf50');
      const duration = Date.now() - start;

      // Should be very fast (<10ms for in-memory SQLite)
      expect(duration).toBeLessThan(10);
    });

    it('should track access count for popularity metrics', async () => {
      const transcript: CachedTranscript = {
        videoId: 'popular',
        videoUrl: 'https://www.youtube.com/watch?v=popular',
        transcript: [{ time: '0:00', text: 'Popular content' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };

      await cacheRepo.saveTranscript(transcript);

      // Access multiple times
      for (let i = 0; i < 5; i++) {
        await cacheRepo.getTranscript('popular');
      }

      const retrieved = await cacheRepo.getTranscript('popular');
      expect(retrieved?.accessCount).toBe(7); // 1 initial + 5 accesses + 1 retrieve = 7
    });
  });

  describe('Job Tracking Integration', () => {
    it('should track job lifecycle with cache operations', async () => {
      const jobId = 'batch-job-001';

      // Create job
      const job: Job = {
        id: jobId,
        type: 'batch',
        status: JobStatus.PENDING,
        totalItems: 3,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await jobRepo.createJob(job);

      // Start processing
      await jobRepo.updateJobStatus(jobId, JobStatus.PROCESSING);

      // Simulate processing with cache hits and misses
      const videoIds = ['v1', 'v2', 'v3'];

      // v1: cache hit
      const cached: CachedTranscript = {
        videoId: 'v1',
        videoUrl: 'https://www.youtube.com/watch?v=v1',
        transcript: [{ time: '0:00', text: 'Cached' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };
      await cacheRepo.saveTranscript(cached);

      const v1Result = await cacheRepo.getTranscript('v1');
      if (v1Result) {
        await jobRepo.addJobResult({
          jobId,
          videoId: 'v1',
          videoUrl: 'https://www.youtube.com/watch?v=v1',
          success: true,
          processingTimeMs: 2, // Fast cache hit
          createdAt: new Date().toISOString()
        });
        await jobRepo.updateJobProgress(jobId, 1, 1, 0);
      }

      // v2 & v3: cache miss, simulate extraction
      for (const vid of ['v2', 'v3']) {
        const fresh: CachedTranscript = {
          videoId: vid,
          videoUrl: `https://www.youtube.com/watch?v=${vid}`,
          transcript: [{ time: '0:00', text: 'Fresh' }],
          extractedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1,
          extractionTimeMs: 2500
        };
        await cacheRepo.saveTranscript(fresh);

        await jobRepo.addJobResult({
          jobId,
          videoId: vid,
          videoUrl: `https://www.youtube.com/watch?v=${vid}`,
          success: true,
          processingTimeMs: 2500,
          createdAt: new Date().toISOString()
        });

        const currentProgress = await jobRepo.getJob(jobId);
        await jobRepo.updateJobProgress(
          jobId,
          currentProgress!.processedItems + 1,
          currentProgress!.successfulItems + 1,
          0
        );
      }

      // Complete job
      await jobRepo.completeJob(jobId);

      // Verify final state
      const completedJob = await jobRepo.getJob(jobId);
      expect(completedJob?.status).toBe(JobStatus.COMPLETED);
      expect(completedJob?.processedItems).toBe(3);
      expect(completedJob?.successfulItems).toBe(3);
      expect(completedJob?.failedItems).toBe(0);

      // Verify all transcripts cached
      const allCached = await cacheRepo.getTranscripts(videoIds);
      expect(allCached.size).toBe(3);
    });

    it('should record job results for cache hits and misses separately', async () => {
      const jobId = 'cache-stats-job';

      await jobRepo.createJob({
        id: jobId,
        type: 'batch',
        status: JobStatus.PROCESSING,
        totalItems: 5,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Cache 3 videos
      for (let i = 1; i <= 3; i++) {
        await cacheRepo.saveTranscript({
          videoId: `cached${i}`,
          videoUrl: `https://www.youtube.com/watch?v=cached${i}`,
          transcript: [{ time: '0:00', text: `Content ${i}` }],
          extractedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1
        });

        await jobRepo.addJobResult({
          jobId,
          videoId: `cached${i}`,
          videoUrl: `https://www.youtube.com/watch?v=cached${i}`,
          success: true,
          processingTimeMs: 3, // Fast cache hit
          createdAt: new Date().toISOString()
        });
      }

      // Extract 2 fresh videos
      for (let i = 4; i <= 5; i++) {
        await cacheRepo.saveTranscript({
          videoId: `fresh${i}`,
          videoUrl: `https://www.youtube.com/watch?v=fresh${i}`,
          transcript: [{ time: '0:00', text: `Content ${i}` }],
          extractedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1,
          extractionTimeMs: 2500
        });

        await jobRepo.addJobResult({
          jobId,
          videoId: `fresh${i}`,
          videoUrl: `https://www.youtube.com/watch?v=fresh${i}`,
          success: true,
          processingTimeMs: 2500, // Slow extraction
          createdAt: new Date().toISOString()
        });
      }

      // Analyze results
      const results = await jobRepo.getJobResults(jobId);
      expect(results).toHaveLength(5);

      const cacheHits = results.filter(r => r.processingTimeMs && r.processingTimeMs < 100);
      const freshExtractions = results.filter(r => r.processingTimeMs && r.processingTimeMs > 1000);

      expect(cacheHits).toHaveLength(3);
      expect(freshExtractions).toHaveLength(2);
    });
  });

  describe('Automatic Eviction Integration', () => {
    it('should trigger eviction when cache exceeds entry limit', async () => {
      const config = {
        policy: 'LRU' as const,
        maxEntries: 5,
        maxSizeMB: 100,
        ttlDays: 30,
        intervalHours: 1
      };

      const service = new CacheEvictionService(cacheRepo, mockLogger, config);

      // Add 8 transcripts (exceeds limit of 5)
      const transcripts: CachedTranscript[] = Array.from({ length: 8 }, (_, i) => ({
        videoId: `evict${i}`,
        videoUrl: `https://www.youtube.com/watch?v=evict${i}`,
        transcript: [{ time: '0:00', text: `Content ${i}` }],
        extractedAt: new Date().toISOString(),
        // Higher index = older access time (evict7 is oldest, evict0 is newest)
        lastAccessedAt: new Date(Date.now() - (7 - i) * 60000).toISOString(),
        accessCount: 1
      }));

      await cacheRepo.saveTranscripts(transcripts);

      // Run eviction
      const result = await service.runEviction();

      expect(result.evictedCount).toBe(3); // Evict 3 to get down to 5
      expect(result.totalEntriesAfter).toBe(5);

      // Verify oldest were evicted (evict0, evict1, evict2 have oldest access times)
      expect(await cacheRepo.hasTranscript('evict0')).toBe(false);
      expect(await cacheRepo.hasTranscript('evict1')).toBe(false);
      expect(await cacheRepo.hasTranscript('evict2')).toBe(false);
      expect(await cacheRepo.hasTranscript('evict7')).toBe(true); // Most recent
    });

    it('should evict old transcripts based on TTL', async () => {
      const config = {
        policy: 'TTL' as const,
        maxEntries: 100,
        maxSizeMB: 100,
        ttlDays: 7,
        intervalHours: 1
      };

      const service = new CacheEvictionService(cacheRepo, mockLogger, config);

      // Add transcripts with different ages
      const oldTranscript: CachedTranscript = {
        videoId: 'old',
        videoUrl: 'https://www.youtube.com/watch?v=old',
        transcript: [{ time: '0:00', text: 'Old content' }],
        extractedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        lastAccessedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        accessCount: 1
      };

      const recentTranscript: CachedTranscript = {
        videoId: 'recent',
        videoUrl: 'https://www.youtube.com/watch?v=recent',
        transcript: [{ time: '0:00', text: 'Recent content' }],
        extractedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        lastAccessedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        accessCount: 1
      };

      await cacheRepo.saveTranscripts([oldTranscript, recentTranscript]);

      // Run eviction
      const result = await service.runEviction();

      expect(result.evictedCount).toBe(1); // Only old transcript evicted
      expect(await cacheRepo.hasTranscript('old')).toBe(false);
      expect(await cacheRepo.hasTranscript('recent')).toBe(true);
    });

    it('should not evict when under all limits', async () => {
      const config = {
        policy: 'LRU' as const,
        maxEntries: 100,
        maxSizeMB: 100,
        ttlDays: 30,
        intervalHours: 1
      };

      const service = new CacheEvictionService(cacheRepo, mockLogger, config);

      // Add just 5 transcripts (well under limit)
      const transcripts: CachedTranscript[] = Array.from({ length: 5 }, (_, i) => ({
        videoId: `safe${i}`,
        videoUrl: `https://www.youtube.com/watch?v=safe${i}`,
        transcript: [{ time: '0:00', text: `Content ${i}` }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      }));

      await cacheRepo.saveTranscripts(transcripts);

      // Run eviction
      const result = await service.runEviction();

      expect(result.evictedCount).toBe(0);
      expect(result.totalEntriesAfter).toBe(5);
    });
  });

  describe('Cache Statistics', () => {
    it('should provide accurate cache statistics', async () => {
      // Add various transcripts
      const transcripts: CachedTranscript[] = [
        {
          videoId: 'stats1',
          videoUrl: 'https://www.youtube.com/watch?v=stats1',
          transcript: [{ time: '0:00', text: 'Short' }],
          extractedAt: new Date(Date.now() - 5000).toISOString(),
          lastAccessedAt: new Date(Date.now() - 5000).toISOString(),
          accessCount: 1
        },
        {
          videoId: 'stats2',
          videoUrl: 'https://www.youtube.com/watch?v=stats2',
          transcript: Array(100).fill({ time: '0:00', text: 'Long content' }),
          extractedAt: new Date(Date.now() - 3000).toISOString(),
          lastAccessedAt: new Date(Date.now() - 3000).toISOString(),
          accessCount: 1
        },
        {
          videoId: 'stats3',
          videoUrl: 'https://www.youtube.com/watch?v=stats3',
          transcript: [{ time: '0:00', text: 'Medium' }],
          extractedAt: new Date(Date.now() - 1000).toISOString(),
          lastAccessedAt: new Date(Date.now() - 1000).toISOString(),
          accessCount: 1
        }
      ];

      await cacheRepo.saveTranscripts(transcripts);

      const stats = await cacheRepo.getCacheStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
      expect(new Date(stats.oldestEntry!).getTime()).toBeLessThan(
        new Date(stats.newestEntry!).getTime()
      );
    });
  });
});
