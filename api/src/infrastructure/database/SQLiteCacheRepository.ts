import Database from 'better-sqlite3';
import { ICacheRepository } from '../../domain/repositories/ICacheRepository';
import { CachedTranscript, CacheStats } from '../../domain/CachedTranscript';
import { Logger } from '../Logger';

/**
 * SQLiteCacheRepository implements transcript caching using SQLite.
 * Follows the repository pattern from hexagonal architecture.
 */
export class SQLiteCacheRepository implements ICacheRepository {
  private logger: Logger;

  constructor(private db: Database.Database, logger?: Logger) {
    this.logger = logger || new Logger('cache-repository');
  }

  async getTranscript(videoId: string): Promise<CachedTranscript | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM transcripts WHERE video_id = ?
      `);
      const row: any = stmt.get(videoId);

      if (!row) {
        return null;
      }

      // Update access time and count in database
      const now = new Date().toISOString();
      const updateStmt = this.db.prepare(`
        UPDATE transcripts
        SET last_accessed_at = ?,
            access_count = access_count + 1
        WHERE video_id = ?
      `);
      updateStmt.run(now, videoId);

      // Update row data to reflect changes
      row.last_accessed_at = now;
      row.access_count = (row.access_count || 0) + 1;

      return this.mapRowToTranscript(row);
    } catch (error: any) {
      this.logger.error('Failed to get transcript', error, { videoId });
      throw error;
    }
  }

  async saveTranscript(transcript: CachedTranscript): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO transcripts (
          video_id, video_url, video_title, transcript_json,
          srt_text, plain_text, extracted_at, last_accessed_at,
          access_count, extraction_time_ms, error_code, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        transcript.videoId,
        transcript.videoUrl,
        transcript.videoTitle || null,
        JSON.stringify(transcript.transcript),
        transcript.srt || null,
        transcript.text || null,
        transcript.extractedAt,
        transcript.lastAccessedAt,
        transcript.accessCount,
        transcript.extractionTimeMs || null,
        transcript.errorCode || null,
        transcript.errorMessage || null
      );

      this.logger.debug('Transcript saved to cache', { videoId: transcript.videoId });
    } catch (error: any) {
      this.logger.error('Failed to save transcript', error, { videoId: transcript.videoId });
      throw error;
    }
  }

  async hasTranscript(videoId: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare(`
        SELECT 1 FROM transcripts WHERE video_id = ? LIMIT 1
      `);
      const result = stmt.get(videoId);
      return result !== undefined;
    } catch (error: any) {
      this.logger.error('Failed to check transcript existence', error, { videoId });
      throw error;
    }
  }

  async deleteTranscript(videoId: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM transcripts WHERE video_id = ?
      `);
      stmt.run(videoId);

      this.logger.debug('Transcript deleted from cache', { videoId });
    } catch (error: any) {
      this.logger.error('Failed to delete transcript', error, { videoId });
      throw error;
    }
  }

  async getTranscripts(videoIds: string[]): Promise<Map<string, CachedTranscript>> {
    if (videoIds.length === 0) {
      return new Map();
    }

    try {
      const placeholders = videoIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        SELECT * FROM transcripts WHERE video_id IN (${placeholders})
      `);
      const rows: any[] = stmt.all(...videoIds);

      const transcripts = new Map<string, CachedTranscript>();
      for (const row of rows) {
        const transcript = this.mapRowToTranscript(row);
        transcripts.set(transcript.videoId, transcript);

        // Update access time for each retrieved transcript
        await this.updateAccessTime(transcript.videoId);
      }

      this.logger.debug('Retrieved multiple transcripts', {
        requested: videoIds.length,
        found: transcripts.size
      });

      return transcripts;
    } catch (error: any) {
      this.logger.error('Failed to get transcripts', error, { count: videoIds.length });
      throw error;
    }
  }

  async saveTranscripts(transcripts: CachedTranscript[]): Promise<void> {
    if (transcripts.length === 0) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO transcripts (
          video_id, video_url, video_title, transcript_json,
          srt_text, plain_text, extracted_at, last_accessed_at,
          access_count, extraction_time_ms, error_code, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Use transaction for bulk insert
      const transaction = this.db.transaction((items: CachedTranscript[]) => {
        for (const t of items) {
          stmt.run(
            t.videoId,
            t.videoUrl,
            t.videoTitle || null,
            JSON.stringify(t.transcript),
            t.srt || null,
            t.text || null,
            t.extractedAt,
            t.lastAccessedAt,
            t.accessCount,
            t.extractionTimeMs || null,
            t.errorCode || null,
            t.errorMessage || null
          );
        }
      });

      transaction(transcripts);

      this.logger.info('Bulk transcripts saved to cache', { count: transcripts.length });
    } catch (error: any) {
      this.logger.error('Failed to save transcripts', error, { count: transcripts.length });
      throw error;
    }
  }

  async updateAccessTime(videoId: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE transcripts
        SET last_accessed_at = ?,
            access_count = access_count + 1
        WHERE video_id = ?
      `);
      stmt.run(new Date().toISOString(), videoId);
    } catch (error: any) {
      this.logger.error('Failed to update access time', error, { videoId });
      // Don't throw - this is a non-critical operation
    }
  }

  async evictOldest(count: number): Promise<number> {
    try {
      // Get IDs of oldest transcripts
      const selectStmt = this.db.prepare(`
        SELECT video_id FROM transcripts
        ORDER BY last_accessed_at ASC
        LIMIT ?
      `);
      const rows: any[] = selectStmt.all(count);

      if (rows.length === 0) {
        return 0;
      }

      // Delete them
      const videoIds = rows.map(r => r.video_id);
      const placeholders = videoIds.map(() => '?').join(',');
      const deleteStmt = this.db.prepare(`
        DELETE FROM transcripts WHERE video_id IN (${placeholders})
      `);
      deleteStmt.run(...videoIds);

      this.logger.info('Evicted oldest transcripts', { count: rows.length });
      return rows.length;
    } catch (error: any) {
      this.logger.error('Failed to evict oldest transcripts', error, { count });
      throw error;
    }
  }

  async evictOlderThan(days: number): Promise<number> {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - days);

      const stmt = this.db.prepare(`
        DELETE FROM transcripts
        WHERE last_accessed_at < ?
      `);
      const info = stmt.run(thresholdDate.toISOString());

      this.logger.info('Evicted old transcripts', {
        days,
        count: info.changes
      });

      return info.changes;
    } catch (error: any) {
      this.logger.error('Failed to evict old transcripts', error, { days });
      throw error;
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    try {
      // Get total entries
      const countRow: any = this.db.prepare(`
        SELECT COUNT(*) as count FROM transcripts
      `).get();

      // Get oldest and newest entries
      const oldestRow: any = this.db.prepare(`
        SELECT extracted_at FROM transcripts
        ORDER BY extracted_at ASC LIMIT 1
      `).get();

      const newestRow: any = this.db.prepare(`
        SELECT extracted_at FROM transcripts
        ORDER BY extracted_at DESC LIMIT 1
      `).get();

      // Get most accessed
      const mostAccessedRow: any = this.db.prepare(`
        SELECT video_id, access_count FROM transcripts
        ORDER BY access_count DESC LIMIT 1
      `).get();

      // Calculate approximate size
      const sizeRow: any = this.db.prepare(`
        SELECT SUM(LENGTH(transcript_json)) as total_size FROM transcripts
      `).get();

      const stats: CacheStats = {
        totalEntries: countRow.count,
        totalSizeBytes: sizeRow.total_size || 0,
        oldestEntry: oldestRow?.extracted_at,
        newestEntry: newestRow?.extracted_at,
        mostAccessed: mostAccessedRow ? {
          videoId: mostAccessedRow.video_id,
          accessCount: mostAccessedRow.access_count
        } : undefined
      };

      return stats;
    } catch (error: any) {
      this.logger.error('Failed to get cache stats', error);
      throw error;
    }
  }

  async clearCache(): Promise<void> {
    try {
      this.db.prepare('DELETE FROM transcripts').run();
      this.logger.warn('Cache cleared - all transcripts deleted');
    } catch (error: any) {
      this.logger.error('Failed to clear cache', error);
      throw error;
    }
  }

  /**
   * Map database row to CachedTranscript domain model
   */
  private mapRowToTranscript(row: any): CachedTranscript {
    return {
      videoId: row.video_id,
      videoUrl: row.video_url,
      videoTitle: row.video_title || undefined,
      transcript: JSON.parse(row.transcript_json),
      srt: row.srt_text || undefined,
      text: row.plain_text || undefined,
      extractedAt: row.extracted_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
      extractionTimeMs: row.extraction_time_ms || undefined,
      errorCode: row.error_code || undefined,
      errorMessage: row.error_message || undefined
    };
  }
}
