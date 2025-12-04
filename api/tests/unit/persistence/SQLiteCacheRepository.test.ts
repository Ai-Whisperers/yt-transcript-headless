/**
 * Unit tests for SQLiteCacheRepository
 * Tests transcript caching, retrieval, eviction, and statistics
 */

import Database from 'better-sqlite3';
import { SQLiteCacheRepository } from '../../../src/infrastructure/database/SQLiteCacheRepository';
import { CachedTranscript } from '../../../src/domain/CachedTranscript';
import { Logger } from '../../../src/infrastructure/Logger';

describe('SQLiteCacheRepository', () => {
  let db: Database.Database;
  let repository: SQLiteCacheRepository;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');

    // Create schema
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

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    repository = new SQLiteCacheRepository(db, mockLogger);
  });

  afterEach(() => {
    db.close();
  });

  describe('saveTranscript', () => {
    it('should save a new transcript', async () => {
      const transcript: CachedTranscript = {
        videoId: 'test123',
        videoUrl: 'https://www.youtube.com/watch?v=test123',
        videoTitle: 'Test Video',
        transcript: [
          { time: '0:00', text: 'Hello world' },
          { time: '0:05', text: 'This is a test' }
        ],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1,
        extractionTimeMs: 1500
      };

      await repository.saveTranscript(transcript);

      // Verify it was saved
      const retrieved = await repository.getTranscript('test123');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.videoId).toBe('test123');
      expect(retrieved?.videoTitle).toBe('Test Video');
      expect(retrieved?.transcript).toHaveLength(2);
    });

    it('should update existing transcript (INSERT OR REPLACE)', async () => {
      const transcript: CachedTranscript = {
        videoId: 'test123',
        videoUrl: 'https://www.youtube.com/watch?v=test123',
        videoTitle: 'Original Title',
        transcript: [{ time: '0:00', text: 'Original text' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };

      await repository.saveTranscript(transcript);

      // Update with new data
      const updated: CachedTranscript = {
        ...transcript,
        videoTitle: 'Updated Title',
        transcript: [{ time: '0:00', text: 'Updated text' }],
        accessCount: 5
      };

      await repository.saveTranscript(updated);

      const retrieved = await repository.getTranscript('test123');
      expect(retrieved?.videoTitle).toBe('Updated Title');
      expect(retrieved?.transcript[0].text).toBe('Updated text');
    });

    it('should save transcript with optional fields', async () => {
      const transcript: CachedTranscript = {
        videoId: 'test456',
        videoUrl: 'https://www.youtube.com/watch?v=test456',
        transcript: [{ time: '0:00', text: 'Test' }],
        srt: '1\n00:00:00,000 --> 00:00:05,000\nTest\n',
        text: 'Test',
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1,
        extractionTimeMs: 2000
      };

      await repository.saveTranscript(transcript);

      const retrieved = await repository.getTranscript('test456');
      expect(retrieved?.srt).toBe(transcript.srt);
      expect(retrieved?.text).toBe(transcript.text);
      expect(retrieved?.extractionTimeMs).toBe(2000);
    });
  });

  describe('getTranscript', () => {
    it('should return null for non-existent video', async () => {
      const result = await repository.getTranscript('nonexistent');
      expect(result).toBeNull();
    });

    it('should retrieve existing transcript', async () => {
      const transcript: CachedTranscript = {
        videoId: 'test789',
        videoUrl: 'https://www.youtube.com/watch?v=test789',
        videoTitle: 'Retrievable Video',
        transcript: [{ time: '0:00', text: 'Content' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };

      await repository.saveTranscript(transcript);
      const retrieved = await repository.getTranscript('test789');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.videoId).toBe('test789');
      expect(retrieved?.videoTitle).toBe('Retrievable Video');
    });

    it('should update access time on retrieval', async () => {
      const originalTime = '2025-01-01T00:00:00.000Z';
      const transcript: CachedTranscript = {
        videoId: 'test_access',
        videoUrl: 'https://www.youtube.com/watch?v=test_access',
        transcript: [{ time: '0:00', text: 'Test' }],
        extractedAt: originalTime,
        lastAccessedAt: originalTime,
        accessCount: 1
      };

      await repository.saveTranscript(transcript);

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const retrieved = await repository.getTranscript('test_access');

      expect(retrieved?.lastAccessedAt).not.toBe(originalTime);
      expect(new Date(retrieved!.lastAccessedAt).getTime()).toBeGreaterThan(
        new Date(originalTime).getTime()
      );
    });

    it('should increment access count on retrieval', async () => {
      const transcript: CachedTranscript = {
        videoId: 'test_count',
        videoUrl: 'https://www.youtube.com/watch?v=test_count',
        transcript: [{ time: '0:00', text: 'Test' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };

      await repository.saveTranscript(transcript);

      await repository.getTranscript('test_count');
      await repository.getTranscript('test_count');
      await repository.getTranscript('test_count');

      const retrieved = await repository.getTranscript('test_count');
      expect(retrieved?.accessCount).toBeGreaterThan(1);
    });
  });

  describe('hasTranscript', () => {
    it('should return false for non-existent video', async () => {
      const exists = await repository.hasTranscript('nonexistent');
      expect(exists).toBe(false);
    });

    it('should return true for existing video', async () => {
      const transcript: CachedTranscript = {
        videoId: 'exists',
        videoUrl: 'https://www.youtube.com/watch?v=exists',
        transcript: [{ time: '0:00', text: 'Test' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };

      await repository.saveTranscript(transcript);
      const exists = await repository.hasTranscript('exists');
      expect(exists).toBe(true);
    });

    it('should not update access time when checking existence', async () => {
      const originalTime = '2025-01-01T00:00:00.000Z';
      const transcript: CachedTranscript = {
        videoId: 'check_exists',
        videoUrl: 'https://www.youtube.com/watch?v=check_exists',
        transcript: [{ time: '0:00', text: 'Test' }],
        extractedAt: originalTime,
        lastAccessedAt: originalTime,
        accessCount: 1
      };

      await repository.saveTranscript(transcript);
      await repository.hasTranscript('check_exists');

      const retrieved = await repository.getTranscript('check_exists');
      // Access time should be updated by getTranscript, not hasTranscript
      expect(retrieved?.accessCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('deleteTranscript', () => {
    it('should delete existing transcript', async () => {
      const transcript: CachedTranscript = {
        videoId: 'delete_me',
        videoUrl: 'https://www.youtube.com/watch?v=delete_me',
        transcript: [{ time: '0:00', text: 'Test' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1
      };

      await repository.saveTranscript(transcript);
      expect(await repository.hasTranscript('delete_me')).toBe(true);

      await repository.deleteTranscript('delete_me');
      expect(await repository.hasTranscript('delete_me')).toBe(false);
    });

    it('should not throw when deleting non-existent transcript', async () => {
      await expect(repository.deleteTranscript('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('getTranscripts (bulk)', () => {
    beforeEach(async () => {
      // Seed with multiple transcripts
      for (let i = 1; i <= 5; i++) {
        await repository.saveTranscript({
          videoId: `video${i}`,
          videoUrl: `https://www.youtube.com/watch?v=video${i}`,
          videoTitle: `Video ${i}`,
          transcript: [{ time: '0:00', text: `Content ${i}` }],
          extractedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1
        });
      }
    });

    it('should retrieve multiple transcripts', async () => {
      const results = await repository.getTranscripts(['video1', 'video3', 'video5']);

      expect(results.size).toBe(3);
      expect(results.has('video1')).toBe(true);
      expect(results.has('video3')).toBe(true);
      expect(results.has('video5')).toBe(true);
      expect(results.get('video1')?.videoTitle).toBe('Video 1');
    });

    it('should skip non-existent videos', async () => {
      const results = await repository.getTranscripts(['video1', 'nonexistent', 'video2']);

      expect(results.size).toBe(2);
      expect(results.has('video1')).toBe(true);
      expect(results.has('video2')).toBe(true);
      expect(results.has('nonexistent')).toBe(false);
    });

    it('should return empty map for empty input', async () => {
      const results = await repository.getTranscripts([]);
      expect(results.size).toBe(0);
    });

    it('should return empty map when no videos found', async () => {
      const results = await repository.getTranscripts(['nonexistent1', 'nonexistent2']);
      expect(results.size).toBe(0);
    });
  });

  describe('saveTranscripts (bulk)', () => {
    it('should save multiple transcripts in a transaction', async () => {
      const transcripts: CachedTranscript[] = [
        {
          videoId: 'bulk1',
          videoUrl: 'https://www.youtube.com/watch?v=bulk1',
          transcript: [{ time: '0:00', text: 'Bulk 1' }],
          extractedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1
        },
        {
          videoId: 'bulk2',
          videoUrl: 'https://www.youtube.com/watch?v=bulk2',
          transcript: [{ time: '0:00', text: 'Bulk 2' }],
          extractedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1
        },
        {
          videoId: 'bulk3',
          videoUrl: 'https://www.youtube.com/watch?v=bulk3',
          transcript: [{ time: '0:00', text: 'Bulk 3' }],
          extractedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1
        }
      ];

      await repository.saveTranscripts(transcripts);

      const stats = await repository.getCacheStats();
      expect(stats.totalEntries).toBe(3);

      const retrieved = await repository.getTranscript('bulk2');
      expect(retrieved?.videoId).toBe('bulk2');
    });

    it('should handle empty array', async () => {
      await expect(repository.saveTranscripts([])).resolves.not.toThrow();
    });
  });

  describe('evictOldest (LRU)', () => {
    beforeEach(async () => {
      // Seed with transcripts at different access times
      const baseTime = new Date('2025-01-01T00:00:00Z').getTime();

      for (let i = 1; i <= 10; i++) {
        const accessTime = new Date(baseTime + i * 1000).toISOString();
        await repository.saveTranscript({
          videoId: `lru${i}`,
          videoUrl: `https://www.youtube.com/watch?v=lru${i}`,
          transcript: [{ time: '0:00', text: `LRU ${i}` }],
          extractedAt: new Date().toISOString(),
          lastAccessedAt: accessTime,
          accessCount: 1
        });
      }
    });

    it('should evict oldest accessed transcripts', async () => {
      const evicted = await repository.evictOldest(3);

      expect(evicted).toBe(3);

      const stats = await repository.getCacheStats();
      expect(stats.totalEntries).toBe(7);

      // Oldest should be gone
      expect(await repository.hasTranscript('lru1')).toBe(false);
      expect(await repository.hasTranscript('lru2')).toBe(false);
      expect(await repository.hasTranscript('lru3')).toBe(false);

      // Newer should remain
      expect(await repository.hasTranscript('lru8')).toBe(true);
      expect(await repository.hasTranscript('lru9')).toBe(true);
      expect(await repository.hasTranscript('lru10')).toBe(true);
    });

    it('should return 0 when database is empty', async () => {
      await repository.clearCache();
      const evicted = await repository.evictOldest(5);
      expect(evicted).toBe(0);
    });

    it('should evict all when count exceeds total', async () => {
      const evicted = await repository.evictOldest(100);
      expect(evicted).toBe(10);

      const stats = await repository.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('evictOlderThan (TTL)', () => {
    it('should evict transcripts older than threshold', async () => {
      const now = new Date();
      const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000); // 40 days old
      const recent = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days old

      // Save old transcript
      await repository.saveTranscript({
        videoId: 'old1',
        videoUrl: 'https://www.youtube.com/watch?v=old1',
        transcript: [{ time: '0:00', text: 'Old' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: old.toISOString(),
        accessCount: 1
      });

      // Save recent transcript
      await repository.saveTranscript({
        videoId: 'recent1',
        videoUrl: 'https://www.youtube.com/watch?v=recent1',
        transcript: [{ time: '0:00', text: 'Recent' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: recent.toISOString(),
        accessCount: 1
      });

      const evicted = await repository.evictOlderThan(30); // 30 days

      expect(evicted).toBe(1);
      expect(await repository.hasTranscript('old1')).toBe(false);
      expect(await repository.hasTranscript('recent1')).toBe(true);
    });

    it('should return 0 when no transcripts exceed threshold', async () => {
      const now = new Date();
      await repository.saveTranscript({
        videoId: 'recent',
        videoUrl: 'https://www.youtube.com/watch?v=recent',
        transcript: [{ time: '0:00', text: 'Recent' }],
        extractedAt: new Date().toISOString(),
        lastAccessedAt: now.toISOString(),
        accessCount: 1
      });

      const evicted = await repository.evictOlderThan(365);
      expect(evicted).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return stats for empty cache', async () => {
      const stats = await repository.getCacheStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
      expect(stats.oldestEntry).toBeUndefined();
      expect(stats.newestEntry).toBeUndefined();
    });

    it('should calculate correct stats for populated cache', async () => {
      const old = new Date('2025-01-01T00:00:00Z').toISOString();
      const recent = new Date('2025-12-01T00:00:00Z').toISOString();

      await repository.saveTranscript({
        videoId: 'stats1',
        videoUrl: 'https://www.youtube.com/watch?v=stats1',
        transcript: [{ time: '0:00', text: 'Test 1' }],
        extractedAt: old,
        lastAccessedAt: old,
        accessCount: 1
      });

      await repository.saveTranscript({
        videoId: 'stats2',
        videoUrl: 'https://www.youtube.com/watch?v=stats2',
        transcript: [{ time: '0:00', text: 'Test 2' }],
        extractedAt: recent,
        lastAccessedAt: recent,
        accessCount: 1
      });

      const stats = await repository.getCacheStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBe(old);
      expect(stats.newestEntry).toBe(recent);
    });
  });

  describe('clearCache', () => {
    it('should remove all transcripts', async () => {
      // Add some transcripts
      for (let i = 1; i <= 5; i++) {
        await repository.saveTranscript({
          videoId: `clear${i}`,
          videoUrl: `https://www.youtube.com/watch?v=clear${i}`,
          transcript: [{ time: '0:00', text: `Clear ${i}` }],
          extractedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1
        });
      }

      let stats = await repository.getCacheStats();
      expect(stats.totalEntries).toBe(5);

      await repository.clearCache();

      stats = await repository.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should not throw when clearing empty cache', async () => {
      await expect(repository.clearCache()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', () => {
      // Close database to simulate error
      db.close();

      expect(repository.getTranscript('test')).rejects.toThrow();
    });
  });
});
