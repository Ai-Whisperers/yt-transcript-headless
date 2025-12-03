-- YouTube Transcript Extractor - Database Schema
-- Version: 1.0.0
-- Created: 2025-12-03

-- ============================================================================
-- Jobs Table: Tracks batch and playlist extraction jobs
-- ============================================================================
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,                    -- UUID
  type TEXT NOT NULL CHECK(type IN ('batch', 'playlist')),
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'aborted')),
  total_items INTEGER NOT NULL,           -- Total videos to process
  processed_items INTEGER DEFAULT 0,      -- Completed videos
  successful_items INTEGER DEFAULT 0,     -- Successfully extracted
  failed_items INTEGER DEFAULT 0,         -- Failed extractions
  created_at TEXT NOT NULL,               -- ISO timestamp
  updated_at TEXT NOT NULL,               -- ISO timestamp
  completed_at TEXT,                      -- ISO timestamp (nullable)
  error_message TEXT,                     -- Error details if failed
  metadata TEXT                           -- JSON: { playlistUrl, playlistId, etc. }
);

-- ============================================================================
-- Transcripts Table: Caches extracted transcripts
-- ============================================================================
CREATE TABLE IF NOT EXISTS transcripts (
  video_id TEXT PRIMARY KEY,              -- YouTube video ID
  video_url TEXT NOT NULL,                -- Full YouTube URL
  video_title TEXT,                       -- Video title (if available)
  transcript_json TEXT NOT NULL,          -- JSON array of TranscriptSegment[]
  srt_text TEXT,                          -- SRT formatted transcript
  plain_text TEXT,                        -- Plain text transcript
  extracted_at TEXT NOT NULL,             -- ISO timestamp
  last_accessed_at TEXT NOT NULL,         -- ISO timestamp (for LRU eviction)
  access_count INTEGER DEFAULT 1,         -- Number of cache hits
  extraction_time_ms INTEGER,             -- Time taken to extract
  error_code TEXT,                        -- Error code if extraction failed
  error_message TEXT                      -- Error details if extraction failed
);

-- ============================================================================
-- Job Results Table: Many-to-many relationship (job -> videos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,                   -- Foreign key to jobs.id
  video_id TEXT NOT NULL,                 -- YouTube video ID
  video_url TEXT NOT NULL,                -- Full YouTube URL
  success INTEGER NOT NULL,               -- 0 or 1 (boolean)
  error_code TEXT,                        -- Error code if failed
  error_message TEXT,                     -- Error details if failed
  processing_time_ms INTEGER,             -- Time taken for this video
  created_at TEXT NOT NULL,               -- ISO timestamp
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES transcripts(video_id) ON DELETE SET NULL
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Jobs table indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_type ON jobs(status, type);

-- Transcripts table indexes
CREATE INDEX IF NOT EXISTS idx_transcripts_last_accessed ON transcripts(last_accessed_at ASC);
CREATE INDEX IF NOT EXISTS idx_transcripts_extracted_at ON transcripts(extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_access_count ON transcripts(access_count DESC);

-- Job results table indexes
CREATE INDEX IF NOT EXISTS idx_job_results_job_id ON job_results(job_id);
CREATE INDEX IF NOT EXISTS idx_job_results_video_id ON job_results(video_id);
CREATE INDEX IF NOT EXISTS idx_job_results_success ON job_results(success);
CREATE INDEX IF NOT EXISTS idx_job_results_created_at ON job_results(created_at DESC);

-- ============================================================================
-- Migrations Table: Tracks applied migrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,           -- Migration version (e.g., '001')
  name TEXT NOT NULL,                     -- Migration name
  applied_at TEXT NOT NULL                -- ISO timestamp
);
