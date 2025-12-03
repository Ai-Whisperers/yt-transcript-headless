/**
 * Job domain model and types for batch/playlist extraction tracking
 */

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABORTED = 'aborted'
}

export type JobType = 'batch' | 'playlist';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  createdAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp
  completedAt?: string;        // ISO timestamp (nullable)
  errorMessage?: string;
  metadata?: JobMetadata;
}

export interface JobMetadata {
  playlistUrl?: string;
  playlistId?: string;
  playlistTitle?: string;
  batchId?: string;
  urls?: string[];
  format?: string;
  [key: string]: any;          // Allow additional metadata
}

export interface JobResult {
  id?: number;                 // Auto-incremented ID (optional for creation)
  jobId: string;
  videoId: string;
  videoUrl: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  processingTimeMs?: number;
  createdAt: string;           // ISO timestamp
}

export interface JobSummary {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  abortedJobs: number;
}
