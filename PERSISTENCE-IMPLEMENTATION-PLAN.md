# Hybrid SQLite + DuckDB Persistence Implementation Plan

**Doc-Type:** Implementation Plan · Version 1.0.0 · Created 2025-12-03 · AI Whisperers

---

## Overview

This plan outlines the implementation of a hybrid persistence layer combining SQLite (better-sqlite3) for transactional operations and DuckDB for analytics. The implementation follows hexagonal architecture principles with clear separation between domain, application, and infrastructure layers.

**Goals:**
- Cache transcript results to avoid redundant YouTube requests
- Track job status for batch and playlist operations
- Enable analytics on extraction performance and patterns
- Maintain hexagonal architecture integrity
- Support horizontal scaling with shared database

---

## Phase 1: Database Infrastructure Setup

### 1.1 Install Dependencies

**Actions:**
- Install better-sqlite3 for SQLite operations
- Install @duckdb/duckdb-wasm for analytics (optional phase)
- Install migration framework (db-migrate or custom)
- Update package.json with new dependencies

**Files to modify:**
- `api/package.json`

### 1.2 Create Database Directory Structure

**Actions:**
- Create `api/src/infrastructure/database/` directory
- Create `api/src/infrastructure/database/migrations/` subdirectory
- Create `api/data/` directory for SQLite database file (gitignored)
- Add `data/*.db` to `.gitignore`

**Directory structure:**
```
api/
├── src/
│   └── infrastructure/
│       └── database/
│           ├── migrations/
│           │   └── 001_initial_schema.sql
│           ├── DatabaseConnection.ts
│           └── schema.sql
└── data/
    └── transcripts.db (generated, gitignored)
```

### 1.3 Define Database Schema

**Actions:**
- Create `schema.sql` with table definitions
- Define indexes for common query patterns
- Document foreign key relationships

**Tables to create:**

```sql
-- Jobs table: tracks batch and playlist extraction jobs
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,                    -- UUID
  type TEXT NOT NULL,                     -- 'batch' | 'playlist'
  status TEXT NOT NULL,                   -- 'pending' | 'processing' | 'completed' | 'failed' | 'aborted'
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

-- Transcripts table: caches extracted transcripts
CREATE TABLE transcripts (
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

-- Job results table: many-to-many relationship (job -> videos)
CREATE TABLE job_results (
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
  FOREIGN KEY (video_id) REFERENCES transcripts(video_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);
CREATE INDEX idx_transcripts_last_accessed ON transcripts(last_accessed_at);
CREATE INDEX idx_job_results_job_id ON job_results(job_id);
CREATE INDEX idx_job_results_video_id ON job_results(video_id);
```

### 1.4 Create Migration System

**Actions:**
- Create `DatabaseConnection.ts` with initialization logic
- Implement migration runner that executes SQL files in order
- Add version tracking in database (migrations table)
- Support rollback mechanism

**Features:**
- Automatic migration on app startup (development mode)
- Manual migration command for production
- Idempotent migrations (can run multiple times safely)

---

## Phase 2: Repository Layer Implementation

### 2.1 Define Domain Interfaces

**Actions:**
- Create `api/src/domain/repositories/ICacheRepository.ts`
- Create `api/src/domain/repositories/IJobRepository.ts`
- Define repository interfaces without implementation details

**Interface contracts:**

```typescript
// ICacheRepository.ts
export interface ICacheRepository {
  // Transcript caching
  getTranscript(videoId: string): Promise<CachedTranscript | null>;
  saveTranscript(transcript: CachedTranscript): Promise<void>;
  hasTranscript(videoId: string): Promise<boolean>;
  deleteTranscript(videoId: string): Promise<void>;

  // Bulk operations
  getTranscripts(videoIds: string[]): Promise<Map<string, CachedTranscript>>;
  saveTranscripts(transcripts: CachedTranscript[]): Promise<void>;

  // Cache management
  updateAccessTime(videoId: string): Promise<void>;
  evictOldest(count: number): Promise<void>;
  getCacheStats(): Promise<CacheStats>;
}

// IJobRepository.ts
export interface IJobRepository {
  // Job lifecycle
  createJob(job: Job): Promise<void>;
  getJob(jobId: string): Promise<Job | null>;
  updateJobStatus(jobId: string, status: JobStatus, errorMessage?: string): Promise<void>;
  updateJobProgress(jobId: string, processed: number, successful: number, failed: number): Promise<void>;
  completeJob(jobId: string): Promise<void>;

  // Job results
  addJobResult(jobId: string, result: JobResult): Promise<void>;
  getJobResults(jobId: string): Promise<JobResult[]>;

  // Queries
  getRecentJobs(limit: number): Promise<Job[]>;
  getJobsByStatus(status: JobStatus): Promise<Job[]>;
}
```

### 2.2 Create Domain Models

**Actions:**
- Create `api/src/domain/Job.ts` with Job entity
- Create `api/src/domain/CachedTranscript.ts` with CachedTranscript entity
- Define value objects: JobStatus, CacheStats

**Domain models:**

```typescript
// Job.ts
export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABORTED = 'aborted'
}

export interface Job {
  id: string;
  type: 'batch' | 'playlist';
  status: JobStatus;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

// CachedTranscript.ts
export interface CachedTranscript {
  videoId: string;
  videoUrl: string;
  videoTitle?: string;
  transcript: TranscriptSegment[];
  srt?: string;
  text?: string;
  extractedAt: string;
  lastAccessedAt: string;
  accessCount: number;
  extractionTimeMs?: number;
  errorCode?: string;
  errorMessage?: string;
}
```

### 2.3 Implement SQLite Repositories

**Actions:**
- Create `api/src/infrastructure/database/SQLiteCacheRepository.ts`
- Create `api/src/infrastructure/database/SQLiteJobRepository.ts`
- Implement all interface methods with SQL queries
- Use prepared statements for performance and security
- Handle transactions for bulk operations

**Implementation patterns:**

```typescript
// SQLiteCacheRepository.ts
export class SQLiteCacheRepository implements ICacheRepository {
  constructor(private db: Database) {}

  async getTranscript(videoId: string): Promise<CachedTranscript | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM transcripts WHERE video_id = ?
    `);
    const row = stmt.get(videoId);
    if (!row) return null;

    // Update access time and count
    await this.updateAccessTime(videoId);

    return this.mapRowToTranscript(row);
  }

  async saveTranscripts(transcripts: CachedTranscript[]): Promise<void> {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO transcripts (
        video_id, video_url, video_title, transcript_json,
        srt_text, plain_text, extracted_at, last_accessed_at,
        access_count, extraction_time_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items) => {
      for (const t of items) {
        insert.run(
          t.videoId, t.videoUrl, t.videoTitle,
          JSON.stringify(t.transcript),
          t.srt, t.text,
          t.extractedAt, t.lastAccessedAt,
          t.accessCount, t.extractionTimeMs
        );
      }
    });

    transaction(transcripts);
  }
}
```

### 2.4 Create Repository Factory

**Actions:**
- Create `api/src/infrastructure/database/RepositoryFactory.ts`
- Singleton pattern for database connection
- Provide factory methods for each repository
- Handle connection lifecycle (open, close, health check)

**Factory pattern:**

```typescript
export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private db: Database;

  private constructor() {
    const dbPath = path.join(__dirname, '../../../data/transcripts.db');
    this.db = new Database(dbPath);
    this.runMigrations();
  }

  static getInstance(): RepositoryFactory {
    if (!this.instance) {
      this.instance = new RepositoryFactory();
    }
    return this.instance;
  }

  getCacheRepository(): ICacheRepository {
    return new SQLiteCacheRepository(this.db);
  }

  getJobRepository(): IJobRepository {
    return new SQLiteJobRepository(this.db);
  }

  close(): void {
    this.db.close();
  }
}
```

---

## Phase 3: Use Case Integration

### 3.1 Update BatchTranscribeUseCase

**Actions:**
- Add optional `cacheRepository` and `jobRepository` constructor parameters
- Implement cache-first lookup before extraction
- Save successful extractions to cache
- Track job status throughout execution
- Maintain backward compatibility (repositories optional)

**Integration points:**

```typescript
export class BatchTranscribeUseCase {
  constructor(
    private pooledExtractor: PooledTranscriptExtractor,
    private logger: ILogger,
    private cacheRepository?: ICacheRepository,
    private jobRepository?: IJobRepository
  ) {}

  async execute(
    request: BatchRequest,
    abortSignal?: AbortSignal,
    progressEmitter?: ProgressEmitter
  ): Promise<BatchResponse> {
    const jobId = randomUUID();

    // Create job record if repository available
    if (this.jobRepository) {
      await this.jobRepository.createJob({
        id: jobId,
        type: 'batch',
        status: JobStatus.PENDING,
        totalItems: request.urls.length,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // Check cache for existing transcripts
    const cachedResults = await this.loadFromCache(request.urls);
    const urlsToExtract = request.urls.filter(url => !cachedResults.has(url));

    // Extract only uncached videos
    const freshResults = await this.processUrlsInParallel(urlsToExtract, ...);

    // Save successful extractions to cache
    await this.saveToCache(freshResults.filter(r => r.success));

    // Update job status
    if (this.jobRepository) {
      await this.jobRepository.completeJob(jobId);
    }

    // Merge cached and fresh results
    return this.mergeResults(cachedResults, freshResults);
  }
}
```

### 3.2 Update TranscribePlaylistUseCase

**Actions:**
- Add optional repository parameters
- Implement same cache-first pattern
- Track playlist job status
- Store job results with playlist metadata

**Playlist-specific considerations:**
- Store playlistId and playlistTitle in job metadata
- Associate all video results with playlist job
- Support partial cache hits (some videos cached, others not)

### 3.3 Update Routes and Dependency Injection

**Actions:**
- Modify `api/src/infrastructure/routes.ts` to inject repositories
- Create repository instances in RouterContext
- Pass repositories to use cases during construction
- Add feature flag for persistence (ENABLE_PERSISTENCE env var)

**Route updates:**

```typescript
const repositoryFactory = RepositoryFactory.getInstance();
const cacheRepository = repositoryFactory.getCacheRepository();
const jobRepository = repositoryFactory.getJobRepository();

const batchTranscribeUseCase = new BatchTranscribeUseCase(
  pooledExtractor,
  logger,
  cacheRepository,  // Pass repository
  jobRepository     // Pass repository
);
```

### 3.4 Add Cache Management Endpoints

**Actions:**
- Create `GET /api/cache/stats` endpoint for cache statistics
- Create `DELETE /api/cache/:videoId` endpoint for manual eviction
- Create `POST /api/cache/evict` endpoint for LRU eviction
- Add cache hit/miss metrics

**New endpoints:**

```typescript
// GET /api/cache/stats
{
  "success": true,
  "data": {
    "totalEntries": 1234,
    "totalSizeBytes": 5242880,
    "oldestEntry": "2025-11-15T10:30:00Z",
    "newestEntry": "2025-12-03T14:45:00Z",
    "hitRate": 0.75
  }
}

// POST /api/cache/evict
{
  "count": 100  // Evict 100 oldest entries
}
```

---

## Phase 4: Testing & Validation

### 4.1 Unit Tests for Repositories

**Actions:**
- Create `api/tests/unit/SQLiteCacheRepository.test.ts`
- Create `api/tests/unit/SQLiteJobRepository.test.ts`
- Use in-memory SQLite database for tests (`:memory:`)
- Test all CRUD operations
- Test transaction handling
- Test error cases (constraint violations, etc.)

**Test coverage:**
- Save and retrieve transcripts
- Bulk operations (saveTranscripts, getTranscripts)
- Access time updates
- LRU eviction logic
- Job lifecycle transitions
- Job progress updates

### 4.2 Integration Tests for Use Cases

**Actions:**
- Create `api/tests/integration/BatchTranscribeWithCache.test.ts`
- Test cache hit scenarios
- Test cache miss scenarios
- Test partial cache hits
- Verify job status tracking
- Validate job results persistence

**Test scenarios:**
- All URLs cached → no extraction, instant response
- No URLs cached → full extraction, save to cache
- Mixed scenario → extract only missing, merge results
- Concurrent requests → proper transaction handling

### 4.3 E2E Tests for API Endpoints

**Actions:**
- Update `api/tests/e2e/api.e2e.test.ts`
- Test cache stats endpoint
- Test cache eviction endpoint
- Verify persistence across requests
- Test job status retrieval

### 4.4 Performance Benchmarks

**Actions:**
- Create benchmark script comparing with/without cache
- Measure cache hit rate over time
- Monitor database file size growth
- Test large batch operations (1000+ videos)
- Validate memory usage remains stable

**Metrics to track:**
- Cache lookup time (should be <5ms)
- Batch extraction time (cached vs uncached)
- Database file size after 10k transcripts
- Query performance with 100k+ records

---

## Phase 5: DuckDB Analytics Layer (Optional)

### 5.1 Install DuckDB

**Actions:**
- Install @duckdb/duckdb-wasm or duckdb (Node.js native)
- Create `api/src/infrastructure/database/DuckDBConnection.ts`
- Set up separate DuckDB database file (analytics.duckdb)

### 5.2 Create Analytics Schema

**Actions:**
- Define analytics tables mirroring SQLite schema
- Add aggregation-friendly columns
- Create materialized views for common queries

**Analytics tables:**

```sql
-- Denormalized table for fast analytics
CREATE TABLE extraction_analytics (
  extraction_date DATE,
  hour_of_day INTEGER,
  video_id TEXT,
  success BOOLEAN,
  extraction_time_ms INTEGER,
  job_type TEXT,
  error_code TEXT
);

-- Aggregated stats table (updated periodically)
CREATE TABLE daily_stats (
  date DATE PRIMARY KEY,
  total_extractions INTEGER,
  successful_extractions INTEGER,
  failed_extractions INTEGER,
  avg_extraction_time_ms DOUBLE,
  cache_hit_rate DOUBLE
);
```

### 5.3 Implement Data Sync

**Actions:**
- Create scheduled job to export from SQLite to DuckDB
- Use DuckDB's ATTACH DATABASE to read SQLite directly
- Implement incremental sync (only new records)
- Add timestamp tracking for last sync

**Sync pattern:**

```typescript
export class AnalyticsSyncService {
  async syncToDuckDB(): Promise<void> {
    // Attach SQLite database
    this.duckdb.exec(`
      ATTACH 'data/transcripts.db' AS sqlite_db (TYPE SQLITE);
    `);

    // Copy new records
    this.duckdb.exec(`
      INSERT INTO extraction_analytics
      SELECT
        DATE(extracted_at) as extraction_date,
        HOUR(extracted_at) as hour_of_day,
        video_id,
        error_code IS NULL as success,
        extraction_time_ms,
        'unknown' as job_type,
        error_code
      FROM sqlite_db.transcripts
      WHERE extracted_at > (SELECT MAX(extraction_date) FROM extraction_analytics);
    `);
  }
}
```

### 5.4 Create Analytics Endpoints

**Actions:**
- Create `GET /api/analytics/daily` endpoint
- Create `GET /api/analytics/performance` endpoint
- Create `GET /api/analytics/errors` endpoint
- Support date range filtering

**Analytics queries:**

```typescript
// GET /api/analytics/daily?start=2025-11-01&end=2025-12-01
{
  "success": true,
  "data": {
    "daily_stats": [
      {
        "date": "2025-11-15",
        "total_extractions": 1250,
        "successful": 1180,
        "failed": 70,
        "avg_time_ms": 2340,
        "cache_hit_rate": 0.68
      }
    ]
  }
}

// GET /api/analytics/performance
{
  "success": true,
  "data": {
    "avg_extraction_time_ms": 2150,
    "p50_extraction_time_ms": 1800,
    "p95_extraction_time_ms": 4500,
    "p99_extraction_time_ms": 8200
  }
}
```

---

## Phase 6: Production Hardening

### 6.1 Environment Configuration

**Actions:**
- Add database configuration to environment variables
- Support custom database paths
- Add cache size limits (max entries, max bytes)
- Add eviction policies (LRU, TTL)

**New environment variables:**

```env
# Persistence
ENABLE_PERSISTENCE=true
DATABASE_PATH=./data/transcripts.db
DUCKDB_PATH=./data/analytics.duckdb

# Cache configuration
CACHE_MAX_ENTRIES=10000
CACHE_MAX_SIZE_MB=500
CACHE_TTL_DAYS=30
CACHE_EVICTION_POLICY=LRU

# Analytics
ENABLE_ANALYTICS=false
ANALYTICS_SYNC_INTERVAL_HOURS=6
```

### 6.2 Database Backups

**Actions:**
- Implement SQLite backup to separate file
- Schedule periodic backups (daily, weekly)
- Add backup restoration endpoint
- Document backup/restore procedures

**Backup strategy:**

```typescript
export class BackupService {
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupPath = `data/backups/transcripts-${timestamp}.db`;

    // Use SQLite backup API
    await this.db.backup(backupPath);

    return backupPath;
  }

  async restoreBackup(backupPath: string): Promise<void> {
    // Restore from backup file
  }
}
```

### 6.3 Monitoring & Observability

**Actions:**
- Add database metrics to `/api/metrics` endpoint
- Track cache hit/miss rates
- Monitor database file size
- Alert on database errors
- Log slow queries (>100ms)

**Metrics to expose:**

```json
{
  "database": {
    "size_bytes": 52428800,
    "total_transcripts": 12450,
    "cache_hit_rate": 0.72,
    "avg_query_time_ms": 3.2,
    "slow_queries_count": 12
  }
}
```

### 6.4 Error Handling & Recovery

**Actions:**
- Handle database corruption gracefully
- Implement automatic recovery (restore from backup)
- Add database health check endpoint
- Log all database errors with context

**Recovery strategies:**
- Database locked → retry with exponential backoff
- Database corrupted → restore from last backup
- Disk full → trigger cache eviction, alert admin
- Migration failed → rollback to previous version

---

## Phase 7: Documentation & Deployment

### 7.1 Update Project Documentation

**Actions:**
- Update README.md with persistence features
- Document cache configuration options
- Add database schema diagram
- Provide migration guide for existing deployments

**Documentation sections:**
- Cache Configuration
- Database Management
- Backup and Restore
- Analytics Queries
- Troubleshooting

### 7.2 Update Docker Configuration

**Actions:**
- Add volume mount for database directory
- Update Dockerfile to create data directory
- Add database initialization to startup script
- Document volume configuration in docker-compose.yml

**Docker volume:**

```yaml
services:
  api:
    volumes:
      - ./data:/app/data  # Persist database
      - ./data/backups:/app/data/backups  # Persist backups
```

### 7.3 Kubernetes Deployment Updates

**Actions:**
- Create PersistentVolumeClaim for database
- Update deployment.yaml with volume mounts
- Add init container for database migrations
- Document StatefulSet considerations

**Kubernetes considerations:**
- Use PVC for database persistence
- Consider ReadWriteOnce vs ReadWriteMany
- Plan for database replication (if needed)
- Document scaling limitations with SQLite

### 7.4 Migration Guide for Existing Users

**Actions:**
- Document zero-downtime migration process
- Provide rollback instructions
- Create migration validation script
- Update CHANGELOG.md

**Migration steps:**
1. Deploy new version with ENABLE_PERSISTENCE=false
2. Validate application works correctly
3. Enable ENABLE_PERSISTENCE=true
4. Monitor cache population
5. Validate cache hit rates improving

---

## Success Criteria

**Phase 1-3 (Core Persistence):**
- ✅ SQLite database initialized with schema
- ✅ Cache repository fully implemented and tested
- ✅ Job repository fully implemented and tested
- ✅ Use cases integrate with repositories
- ✅ Cache hit rate >70% for repeated requests
- ✅ No performance degradation (<10ms overhead)

**Phase 4 (Testing):**
- ✅ Unit test coverage >80% for repositories
- ✅ Integration tests pass for cache scenarios
- ✅ E2E tests validate persistence across requests
- ✅ Performance benchmarks meet targets

**Phase 5 (Analytics - Optional):**
- ✅ DuckDB successfully syncs from SQLite
- ✅ Analytics queries execute in <100ms
- ✅ Analytics endpoints return accurate data

**Phase 6-7 (Production):**
- ✅ Backup and restore procedures documented
- ✅ Monitoring dashboards configured
- ✅ Docker and Kubernetes configs updated
- ✅ Migration guide tested with existing deployment

---

## Risk Mitigation

**Risk: Database corruption**
- Mitigation: Automated backups, restore procedures, health checks

**Risk: Disk space exhaustion**
- Mitigation: Cache size limits, automatic eviction, monitoring alerts

**Risk: Performance degradation**
- Mitigation: Indexed queries, prepared statements, benchmarking

**Risk: SQLite concurrency limits**
- Mitigation: WAL mode, connection pooling, read replicas (future)

**Risk: Migration breaking existing deployments**
- Mitigation: Feature flag, backward compatibility, rollback plan

---

## Next Steps

1. **Phase 1.1**: Install better-sqlite3 dependency
2. **Phase 1.2**: Create database directory structure
3. **Phase 1.3**: Define initial schema in SQL file
4. **Phase 1.4**: Implement DatabaseConnection and migration system
5. **Phase 2.1**: Define repository interfaces in domain layer
6. **Continue sequentially through phases...**

---

**Status:** Ready for implementation
**Estimated Complexity:** High (architectural changes across layers)
**Dependencies:** better-sqlite3, optional @duckdb/duckdb-wasm
**Breaking Changes:** None (backward compatible via feature flag)
