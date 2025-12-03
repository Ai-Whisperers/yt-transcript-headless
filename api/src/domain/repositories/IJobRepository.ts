import { Job, JobStatus, JobResult, JobSummary } from '../Job';

/**
 * IJobRepository defines the contract for job tracking operations.
 * This interface belongs to the domain layer and is implemented by infrastructure.
 */
export interface IJobRepository {
  /**
   * Create a new job record
   */
  createJob(job: Job): Promise<void>;

  /**
   * Get a job by ID
   * @returns Job if found, null otherwise
   */
  getJob(jobId: string): Promise<Job | null>;

  /**
   * Update job status
   */
  updateJobStatus(jobId: string, status: JobStatus, errorMessage?: string): Promise<void>;

  /**
   * Update job progress (processed, successful, failed counts)
   */
  updateJobProgress(
    jobId: string,
    processedItems: number,
    successfulItems: number,
    failedItems: number
  ): Promise<void>;

  /**
   * Mark job as completed
   * Sets status to COMPLETED and sets completedAt timestamp
   */
  completeJob(jobId: string): Promise<void>;

  /**
   * Mark job as failed
   * Sets status to FAILED, sets completedAt timestamp, and stores error message
   */
  failJob(jobId: string, errorMessage: string): Promise<void>;

  /**
   * Mark job as aborted
   * Sets status to ABORTED and sets completedAt timestamp
   */
  abortJob(jobId: string): Promise<void>;

  /**
   * Add a job result (video extraction result for this job)
   */
  addJobResult(result: JobResult): Promise<void>;

  /**
   * Add multiple job results in a single transaction
   */
  addJobResults(results: JobResult[]): Promise<void>;

  /**
   * Get all results for a specific job
   */
  getJobResults(jobId: string): Promise<JobResult[]>;

  /**
   * Get recent jobs (ordered by created_at DESC)
   * @param limit Maximum number of jobs to return
   */
  getRecentJobs(limit: number): Promise<Job[]>;

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus): Promise<Job[]>;

  /**
   * Get jobs by type and status
   */
  getJobsByTypeAndStatus(type: 'batch' | 'playlist', status: JobStatus): Promise<Job[]>;

  /**
   * Get job summary statistics
   */
  getJobSummary(): Promise<JobSummary>;

  /**
   * Delete a job and all its results (cascading delete)
   */
  deleteJob(jobId: string): Promise<void>;

  /**
   * Delete old completed jobs (older than specified days)
   * @param days Age threshold in days
   * @returns Number of jobs deleted
   */
  deleteOldJobs(days: number): Promise<number>;
}
