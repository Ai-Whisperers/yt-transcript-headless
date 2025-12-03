-- Migration: 001_initial_schema
-- Description: Initial database schema with jobs, transcripts, and job_results tables
-- Created: 2025-12-03

-- ============================================================================
-- Jobs Table: Tracks batch and playlist extraction jobs
-- ============================================================================
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('batch', 'playlist')),
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'aborted')),
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

-- ============================================================================
-- Transcripts Table: Caches extracted transcripts
-- ============================================================================
CREATE TABLE IF NOT EXISTS transcripts (
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

-- ============================================================================
-- Job Results Table: Many-to-many relationship (job -> videos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  success INTEGER NOT NULL,
  error_code TEXT,
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES transcripts(video_id) ON DELETE SET NULL
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_type ON jobs(status, type);

CREATE INDEX IF NOT EXISTS idx_transcripts_last_accessed ON transcripts(last_accessed_at ASC);
CREATE INDEX IF NOT EXISTS idx_transcripts_extracted_at ON transcripts(extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_access_count ON transcripts(access_count DESC);

CREATE INDEX IF NOT EXISTS idx_job_results_job_id ON job_results(job_id);
CREATE INDEX IF NOT EXISTS idx_job_results_video_id ON job_results(video_id);
CREATE INDEX IF NOT EXISTS idx_job_results_success ON job_results(success);
CREATE INDEX IF NOT EXISTS idx_job_results_created_at ON job_results(created_at DESC);
