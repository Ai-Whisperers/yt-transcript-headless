/**
 * Unit tests for SQLiteJobRepository
 * Tests job creation, status updates, progress tracking, and queries
 */

import Database from 'better-sqlite3';
import { SQLiteJobRepository } from '../../../src/infrastructure/database/SQLiteJobRepository';
import { Job, JobStatus, JobResult } from '../../../src/domain/Job';
import { Logger } from '../../../src/infrastructure/Logger';

describe('SQLiteJobRepository', () => {
  let db: Database.Database;
  let repository: SQLiteJobRepository;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create schema
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

    repository = new SQLiteJobRepository(db, mockLogger);
  });

  afterEach(() => {
    db.close();
  });

  describe('createJob', () => {
    it('should create a new job', async () => {
      const job: Job = {
        id: 'job-001',
        type: 'batch',
        status: JobStatus.PENDING,
        totalItems: 10,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await repository.createJob(job);

      const retrieved = await repository.getJob('job-001');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('job-001');
      expect(retrieved?.type).toBe('batch');
      expect(retrieved?.status).toBe(JobStatus.PENDING);
      expect(retrieved?.totalItems).toBe(10);
    });

    it('should create job with metadata', async () => {
      const job: Job = {
        id: 'job-002',
        type: 'playlist',
        status: JobStatus.PENDING,
        totalItems: 5,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          playlistId: 'PL123',
          playlistTitle: 'Test Playlist',
          playlistUrl: 'https://youtube.com/playlist?list=PL123'
        }
      };

      await repository.createJob(job);

      const retrieved = await repository.getJob('job-002');
      expect(retrieved?.metadata).toEqual(job.metadata);
      expect(retrieved?.metadata?.playlistId).toBe('PL123');
    });

    it('should throw on duplicate job ID', async () => {
      const job: Job = {
        id: 'duplicate',
        type: 'batch',
        status: JobStatus.PENDING,
        totalItems: 1,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await repository.createJob(job);

      await expect(repository.createJob(job)).rejects.toThrow();
    });
  });

  describe('getJob', () => {
    it('should return null for non-existent job', async () => {
      const result = await repository.getJob('nonexistent');
      expect(result).toBeNull();
    });

    it('should retrieve existing job', async () => {
      const job: Job = {
        id: 'job-003',
        type: 'batch',
        status: JobStatus.PROCESSING,
        totalItems: 20,
        processedItems: 5,
        successfulItems: 4,
        failedItems: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await repository.createJob(job);
      const retrieved = await repository.getJob('job-003');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.processedItems).toBe(5);
      expect(retrieved?.successfulItems).toBe(4);
      expect(retrieved?.failedItems).toBe(1);
    });
  });

  describe('updateJobStatus', () => {
    let testJob: Job;

    beforeEach(async () => {
      testJob = {
        id: 'job-status',
        type: 'batch',
        status: JobStatus.PENDING,
        totalItems: 10,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await repository.createJob(testJob);
    });

    it('should update job status', async () => {
      await repository.updateJobStatus('job-status', JobStatus.PROCESSING);

      const retrieved = await repository.getJob('job-status');
      expect(retrieved?.status).toBe(JobStatus.PROCESSING);
    });

    it('should update job status with error message', async () => {
      await repository.updateJobStatus(
        'job-status',
        JobStatus.FAILED,
        'Something went wrong'
      );

      const retrieved = await repository.getJob('job-status');
      expect(retrieved?.status).toBe(JobStatus.FAILED);
      expect(retrieved?.errorMessage).toBe('Something went wrong');
    });

    it('should update updatedAt timestamp', async () => {
      const originalUpdatedAt = testJob.updatedAt;

      // Wait to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      await repository.updateJobStatus('job-status', JobStatus.PROCESSING);

      const retrieved = await repository.getJob('job-status');
      expect(retrieved?.updatedAt).not.toBe(originalUpdatedAt);
      expect(new Date(retrieved!.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });

  describe('updateJobProgress', () => {
    let testJob: Job;

    beforeEach(async () => {
      testJob = {
        id: 'job-progress',
        type: 'playlist',
        status: JobStatus.PROCESSING,
        totalItems: 100,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await repository.createJob(testJob);
    });

    it('should update progress counters', async () => {
      await repository.updateJobProgress('job-progress', 50, 45, 5);

      const retrieved = await repository.getJob('job-progress');
      expect(retrieved?.processedItems).toBe(50);
      expect(retrieved?.successfulItems).toBe(45);
      expect(retrieved?.failedItems).toBe(5);
    });

    it('should update progress incrementally', async () => {
      await repository.updateJobProgress('job-progress', 25, 23, 2);
      await repository.updateJobProgress('job-progress', 50, 46, 4);
      await repository.updateJobProgress('job-progress', 75, 70, 5);

      const retrieved = await repository.getJob('job-progress');
      expect(retrieved?.processedItems).toBe(75);
      expect(retrieved?.successfulItems).toBe(70);
      expect(retrieved?.failedItems).toBe(5);
    });
  });

  describe('completeJob', () => {
    it('should mark job as completed', async () => {
      const job: Job = {
        id: 'job-complete',
        type: 'batch',
        status: JobStatus.PROCESSING,
        totalItems: 10,
        processedItems: 10,
        successfulItems: 10,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await repository.createJob(job);
      await repository.completeJob('job-complete');

      const retrieved = await repository.getJob('job-complete');
      expect(retrieved?.status).toBe(JobStatus.COMPLETED);
      expect(retrieved?.completedAt).toBeDefined();
      expect(retrieved?.completedAt).not.toBeNull();
    });

    it('should set completedAt timestamp', async () => {
      const job: Job = {
        id: 'job-timestamp',
        type: 'batch',
        status: JobStatus.PROCESSING,
        totalItems: 5,
        processedItems: 5,
        successfulItems: 5,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await repository.createJob(job);

      const beforeComplete = new Date().getTime();
      await repository.completeJob('job-timestamp');
      const afterComplete = new Date().getTime();

      const retrieved = await repository.getJob('job-timestamp');
      const completedTime = new Date(retrieved!.completedAt!).getTime();

      expect(completedTime).toBeGreaterThanOrEqual(beforeComplete);
      expect(completedTime).toBeLessThanOrEqual(afterComplete);
    });
  });

  describe('addJobResult', () => {
    beforeEach(async () => {
      await repository.createJob({
        id: 'job-with-results',
        type: 'batch',
        status: JobStatus.PROCESSING,
        totalItems: 5,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });

    it('should add successful result', async () => {
      const result: JobResult = {
        jobId: 'job-with-results',
        videoId: 'video1',
        videoUrl: 'https://www.youtube.com/watch?v=video1',
        success: true,
        processingTimeMs: 1500,
        createdAt: new Date().toISOString()
      };

      await repository.addJobResult(result);

      const results = await repository.getJobResults('job-with-results');
      expect(results).toHaveLength(1);
      expect(results[0].videoId).toBe('video1');
      expect(results[0].success).toBe(true);
      expect(results[0].processingTimeMs).toBe(1500);
    });

    it('should add failed result with error details', async () => {
      const result: JobResult = {
        jobId: 'job-with-results',
        videoId: 'video2',
        videoUrl: 'https://www.youtube.com/watch?v=video2',
        success: false,
        errorCode: 'EXTRACTION_FAILED',
        errorMessage: 'Could not extract transcript',
        processingTimeMs: 500,
        createdAt: new Date().toISOString()
      };

      await repository.addJobResult(result);

      const results = await repository.getJobResults('job-with-results');
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].errorCode).toBe('EXTRACTION_FAILED');
      expect(results[0].errorMessage).toBe('Could not extract transcript');
    });

    it('should add multiple results', async () => {
      const results: JobResult[] = [
        {
          jobId: 'job-with-results',
          videoId: 'video1',
          videoUrl: 'https://www.youtube.com/watch?v=video1',
          success: true,
          createdAt: new Date().toISOString()
        },
        {
          jobId: 'job-with-results',
          videoId: 'video2',
          videoUrl: 'https://www.youtube.com/watch?v=video2',
          success: true,
          createdAt: new Date().toISOString()
        },
        {
          jobId: 'job-with-results',
          videoId: 'video3',
          videoUrl: 'https://www.youtube.com/watch?v=video3',
          success: false,
          errorCode: 'TIMEOUT',
          createdAt: new Date().toISOString()
        }
      ];

      for (const result of results) {
        await repository.addJobResult(result);
      }

      const retrieved = await repository.getJobResults('job-with-results');
      expect(retrieved).toHaveLength(3);

      const successCount = retrieved.filter(r => r.success).length;
      const failCount = retrieved.filter(r => !r.success).length;

      expect(successCount).toBe(2);
      expect(failCount).toBe(1);
    });
  });

  describe('getJobResults', () => {
    it('should return empty array for job with no results', async () => {
      await repository.createJob({
        id: 'job-no-results',
        type: 'batch',
        status: JobStatus.PENDING,
        totalItems: 0,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const results = await repository.getJobResults('job-no-results');
      expect(results).toHaveLength(0);
    });

    it('should return empty array for non-existent job', async () => {
      const results = await repository.getJobResults('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('getRecentJobs', () => {
    beforeEach(async () => {
      // Seed with jobs at different times
      for (let i = 1; i <= 10; i++) {
        const createdAt = new Date(Date.now() - i * 60000).toISOString(); // Each 1 min apart
        await repository.createJob({
          id: `recent-${i}`,
          type: 'batch',
          status: JobStatus.COMPLETED,
          totalItems: i,
          processedItems: i,
          successfulItems: i,
          failedItems: 0,
          createdAt,
          updatedAt: createdAt
        });
      }
    });

    it('should return limited number of recent jobs', async () => {
      const jobs = await repository.getRecentJobs(5);

      expect(jobs).toHaveLength(5);

      // Should be in descending order (most recent first)
      expect(jobs[0].id).toBe('recent-1');
      expect(jobs[1].id).toBe('recent-2');
      expect(jobs[4].id).toBe('recent-5');
    });

    it('should return all jobs when limit exceeds total', async () => {
      const jobs = await repository.getRecentJobs(100);
      expect(jobs).toHaveLength(10);
    });

    it('should return empty array when no jobs exist', async () => {
      // Clear all jobs
      db.exec('DELETE FROM jobs');

      const jobs = await repository.getRecentJobs(10);
      expect(jobs).toHaveLength(0);
    });
  });

  describe('getJobsByStatus', () => {
    beforeEach(async () => {
      // Seed with jobs in different statuses
      const statuses = [
        JobStatus.PENDING,
        JobStatus.PENDING,
        JobStatus.PROCESSING,
        JobStatus.PROCESSING,
        JobStatus.PROCESSING,
        JobStatus.COMPLETED,
        JobStatus.COMPLETED,
        JobStatus.FAILED
      ];

      for (let i = 0; i < statuses.length; i++) {
        await repository.createJob({
          id: `status-job-${i}`,
          type: 'batch',
          status: statuses[i],
          totalItems: 1,
          processedItems: 0,
          successfulItems: 0,
          failedItems: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    });

    it('should return jobs with specific status', async () => {
      const pending = await repository.getJobsByStatus(JobStatus.PENDING);
      const processing = await repository.getJobsByStatus(JobStatus.PROCESSING);
      const completed = await repository.getJobsByStatus(JobStatus.COMPLETED);
      const failed = await repository.getJobsByStatus(JobStatus.FAILED);

      expect(pending).toHaveLength(2);
      expect(processing).toHaveLength(3);
      expect(completed).toHaveLength(2);
      expect(failed).toHaveLength(1);
    });

    it('should return empty array when no jobs match status', async () => {
      const aborted = await repository.getJobsByStatus(JobStatus.ABORTED);
      expect(aborted).toHaveLength(0);
    });
  });

  describe('getJobSummary', () => {
    beforeEach(async () => {
      // Create jobs with various statuses
      await repository.createJob({
        id: 'summary-1',
        type: 'batch',
        status: JobStatus.COMPLETED,
        totalItems: 100,
        processedItems: 100,
        successfulItems: 95,
        failedItems: 5,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      });

      await repository.createJob({
        id: 'summary-2',
        type: 'playlist',
        status: JobStatus.PROCESSING,
        totalItems: 50,
        processedItems: 25,
        successfulItems: 23,
        failedItems: 2,
        createdAt: new Date(Date.now() - 1800000).toISOString(),
        updatedAt: new Date().toISOString()
      });

      await repository.createJob({
        id: 'summary-3',
        type: 'batch',
        status: JobStatus.PENDING,
        totalItems: 10,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });

    it('should return job summary statistics', async () => {
      const summary = await repository.getJobSummary();

      expect(summary).toHaveProperty('totalJobs');
      expect(summary).toHaveProperty('pendingJobs');
      expect(summary).toHaveProperty('processingJobs');
      expect(summary).toHaveProperty('completedJobs');
      expect(summary).toHaveProperty('failedJobs');
      expect(summary).toHaveProperty('abortedJobs');
      expect(summary.totalJobs).toBe(3);
      expect(summary.pendingJobs).toBe(1);
      expect(summary.processingJobs).toBe(1);
      expect(summary.completedJobs).toBe(1);
    });

    it('should return zero counts when no jobs exist', async () => {
      // Clear all jobs
      db.exec('DELETE FROM jobs');

      const summary = await repository.getJobSummary();

      expect(summary.totalJobs).toBe(0);
      expect(summary.pendingJobs).toBe(0);
      expect(summary.processingJobs).toBe(0);
      expect(summary.completedJobs).toBe(0);
      expect(summary.failedJobs).toBe(0);
      expect(summary.abortedJobs).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', () => {
      db.close();

      expect(repository.getJob('test')).rejects.toThrow();
    });
  });

  describe('job lifecycle integration', () => {
    it('should track complete job lifecycle', async () => {
      const jobId = 'lifecycle-test';

      // 1. Create job
      await repository.createJob({
        id: jobId,
        type: 'batch',
        status: JobStatus.PENDING,
        totalItems: 3,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // 2. Start processing
      await repository.updateJobStatus(jobId, JobStatus.PROCESSING);

      // 3. Process items
      await repository.addJobResult({
        jobId,
        videoId: 'v1',
        videoUrl: 'https://www.youtube.com/watch?v=v1',
        success: true,
        processingTimeMs: 1000,
        createdAt: new Date().toISOString()
      });
      await repository.updateJobProgress(jobId, 1, 1, 0);

      await repository.addJobResult({
        jobId,
        videoId: 'v2',
        videoUrl: 'https://www.youtube.com/watch?v=v2',
        success: true,
        processingTimeMs: 1200,
        createdAt: new Date().toISOString()
      });
      await repository.updateJobProgress(jobId, 2, 2, 0);

      await repository.addJobResult({
        jobId,
        videoId: 'v3',
        videoUrl: 'https://www.youtube.com/watch?v=v3',
        success: false,
        errorCode: 'TIMEOUT',
        errorMessage: 'Extraction timeout',
        processingTimeMs: 30000,
        createdAt: new Date().toISOString()
      });
      await repository.updateJobProgress(jobId, 3, 2, 1);

      // 4. Complete job
      await repository.completeJob(jobId);

      // Verify final state
      const job = await repository.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(job?.processedItems).toBe(3);
      expect(job?.successfulItems).toBe(2);
      expect(job?.failedItems).toBe(1);
      expect(job?.completedAt).toBeDefined();

      const results = await repository.getJobResults(jobId);
      expect(results).toHaveLength(3);
    });
  });
});
