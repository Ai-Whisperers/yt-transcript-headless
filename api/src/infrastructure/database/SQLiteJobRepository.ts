import Database from 'better-sqlite3';
import { IJobRepository } from '../../domain/repositories/IJobRepository';
import { Job, JobStatus, JobResult, JobSummary } from '../../domain/Job';
import { Logger } from '../Logger';

/**
 * SQLiteJobRepository implements job tracking using SQLite.
 * Follows the repository pattern from hexagonal architecture.
 */
export class SQLiteJobRepository implements IJobRepository {
  private logger: Logger;

  constructor(private db: Database.Database, logger?: Logger) {
    this.logger = logger || new Logger('job-repository');
  }

  async createJob(job: Job): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO jobs (
          id, type, status, total_items, processed_items,
          successful_items, failed_items, created_at, updated_at,
          completed_at, error_message, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        job.id,
        job.type,
        job.status,
        job.totalItems,
        job.processedItems,
        job.successfulItems,
        job.failedItems,
        job.createdAt,
        job.updatedAt,
        job.completedAt || null,
        job.errorMessage || null,
        job.metadata ? JSON.stringify(job.metadata) : null
      );

      this.logger.info('Job created', {
        jobId: job.id,
        type: job.type,
        totalItems: job.totalItems
      });
    } catch (error: any) {
      this.logger.error('Failed to create job', error, { jobId: job.id });
      throw error;
    }
  }

  async getJob(jobId: string): Promise<Job | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM jobs WHERE id = ?
      `);
      const row: any = stmt.get(jobId);

      if (!row) {
        return null;
      }

      return this.mapRowToJob(row);
    } catch (error: any) {
      this.logger.error('Failed to get job', error, { jobId });
      throw error;
    }
  }

  async updateJobStatus(jobId: string, status: JobStatus, errorMessage?: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE jobs
        SET status = ?,
            updated_at = ?,
            error_message = ?
        WHERE id = ?
      `);

      stmt.run(
        status,
        new Date().toISOString(),
        errorMessage || null,
        jobId
      );

      this.logger.debug('Job status updated', { jobId, status });
    } catch (error: any) {
      this.logger.error('Failed to update job status', error, { jobId, status });
      throw error;
    }
  }

  async updateJobProgress(
    jobId: string,
    processedItems: number,
    successfulItems: number,
    failedItems: number
  ): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE jobs
        SET processed_items = ?,
            successful_items = ?,
            failed_items = ?,
            updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        processedItems,
        successfulItems,
        failedItems,
        new Date().toISOString(),
        jobId
      );

      this.logger.debug('Job progress updated', {
        jobId,
        processed: processedItems,
        successful: successfulItems,
        failed: failedItems
      });
    } catch (error: any) {
      this.logger.error('Failed to update job progress', error, { jobId });
      throw error;
    }
  }

  async completeJob(jobId: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE jobs
        SET status = ?,
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
      `);

      const now = new Date().toISOString();
      stmt.run(JobStatus.COMPLETED, now, now, jobId);

      this.logger.info('Job completed', { jobId });
    } catch (error: any) {
      this.logger.error('Failed to complete job', error, { jobId });
      throw error;
    }
  }

  async failJob(jobId: string, errorMessage: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE jobs
        SET status = ?,
            error_message = ?,
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
      `);

      const now = new Date().toISOString();
      stmt.run(JobStatus.FAILED, errorMessage, now, now, jobId);

      this.logger.warn('Job failed', { jobId, error: errorMessage });
    } catch (error: any) {
      this.logger.error('Failed to mark job as failed', error, { jobId });
      throw error;
    }
  }

  async abortJob(jobId: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE jobs
        SET status = ?,
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
      `);

      const now = new Date().toISOString();
      stmt.run(JobStatus.ABORTED, now, now, jobId);

      this.logger.warn('Job aborted', { jobId });
    } catch (error: any) {
      this.logger.error('Failed to abort job', error, { jobId });
      throw error;
    }
  }

  async addJobResult(result: JobResult): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO job_results (
          job_id, video_id, video_url, success,
          error_code, error_message, processing_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        result.jobId,
        result.videoId,
        result.videoUrl,
        result.success ? 1 : 0,
        result.errorCode || null,
        result.errorMessage || null,
        result.processingTimeMs || null,
        result.createdAt
      );

      this.logger.debug('Job result added', {
        jobId: result.jobId,
        videoId: result.videoId,
        success: result.success
      });
    } catch (error: any) {
      this.logger.error('Failed to add job result', error, {
        jobId: result.jobId,
        videoId: result.videoId
      });
      throw error;
    }
  }

  async addJobResults(results: JobResult[]): Promise<void> {
    if (results.length === 0) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO job_results (
          job_id, video_id, video_url, success,
          error_code, error_message, processing_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Use transaction for bulk insert
      const transaction = this.db.transaction((items: JobResult[]) => {
        for (const r of items) {
          stmt.run(
            r.jobId,
            r.videoId,
            r.videoUrl,
            r.success ? 1 : 0,
            r.errorCode || null,
            r.errorMessage || null,
            r.processingTimeMs || null,
            r.createdAt
          );
        }
      });

      transaction(results);

      this.logger.info('Bulk job results added', {
        jobId: results[0].jobId,
        count: results.length
      });
    } catch (error: any) {
      this.logger.error('Failed to add job results', error, { count: results.length });
      throw error;
    }
  }

  async getJobResults(jobId: string): Promise<JobResult[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM job_results WHERE job_id = ? ORDER BY created_at ASC
      `);
      const rows: any[] = stmt.all(jobId);

      return rows.map(row => this.mapRowToJobResult(row));
    } catch (error: any) {
      this.logger.error('Failed to get job results', error, { jobId });
      throw error;
    }
  }

  async getRecentJobs(limit: number): Promise<Job[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?
      `);
      const rows: any[] = stmt.all(limit);

      return rows.map(row => this.mapRowToJob(row));
    } catch (error: any) {
      this.logger.error('Failed to get recent jobs', error, { limit });
      throw error;
    }
  }

  async getJobsByStatus(status: JobStatus): Promise<Job[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC
      `);
      const rows: any[] = stmt.all(status);

      return rows.map(row => this.mapRowToJob(row));
    } catch (error: any) {
      this.logger.error('Failed to get jobs by status', error, { status });
      throw error;
    }
  }

  async getJobsByTypeAndStatus(type: 'batch' | 'playlist', status: JobStatus): Promise<Job[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM jobs WHERE type = ? AND status = ? ORDER BY created_at DESC
      `);
      const rows: any[] = stmt.all(type, status);

      return rows.map(row => this.mapRowToJob(row));
    } catch (error: any) {
      this.logger.error('Failed to get jobs by type and status', error, { type, status });
      throw error;
    }
  }

  async getJobSummary(): Promise<JobSummary> {
    try {
      const stmt = this.db.prepare(`
        SELECT
          COUNT(*) as total_jobs,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_jobs,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_jobs,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
          SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) as aborted_jobs
        FROM jobs
      `);
      const row: any = stmt.get();

      return {
        totalJobs: row.total_jobs,
        pendingJobs: row.pending_jobs,
        processingJobs: row.processing_jobs,
        completedJobs: row.completed_jobs,
        failedJobs: row.failed_jobs,
        abortedJobs: row.aborted_jobs
      };
    } catch (error: any) {
      this.logger.error('Failed to get job summary', error);
      throw error;
    }
  }

  async deleteJob(jobId: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM jobs WHERE id = ?
      `);
      stmt.run(jobId);

      this.logger.info('Job deleted', { jobId });
    } catch (error: any) {
      this.logger.error('Failed to delete job', error, { jobId });
      throw error;
    }
  }

  async deleteOldJobs(days: number): Promise<number> {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - days);

      const stmt = this.db.prepare(`
        DELETE FROM jobs
        WHERE completed_at IS NOT NULL
          AND completed_at < ?
      `);
      const info = stmt.run(thresholdDate.toISOString());

      this.logger.info('Deleted old jobs', {
        days,
        count: info.changes
      });

      return info.changes;
    } catch (error: any) {
      this.logger.error('Failed to delete old jobs', error, { days });
      throw error;
    }
  }

  /**
   * Map database row to Job domain model
   */
  private mapRowToJob(row: any): Job {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      totalItems: row.total_items,
      processedItems: row.processed_items,
      successfulItems: row.successful_items,
      failedItems: row.failed_items,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || undefined,
      errorMessage: row.error_message || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  /**
   * Map database row to JobResult domain model
   */
  private mapRowToJobResult(row: any): JobResult {
    return {
      id: row.id,
      jobId: row.job_id,
      videoId: row.video_id,
      videoUrl: row.video_url,
      success: row.success === 1,
      errorCode: row.error_code || undefined,
      errorMessage: row.error_message || undefined,
      processingTimeMs: row.processing_time_ms || undefined,
      createdAt: row.created_at
    };
  }
}
