# Testing Persistence Layer

**Doc-Type:** Testing Guide · Version 1.0.0 · Created 2025-12-03 · AI Whisperers

---

## Quick Start

### 1. Enable Persistence

Create or update `api/.env` file:

```bash
# Persistence Configuration
ENABLE_PERSISTENCE=true

# Optional: Custom database path
# DATABASE_PATH=./data/transcripts.db

# Optional: Cache configuration
# CACHE_MAX_ENTRIES=10000
# CACHE_MAX_SIZE_MB=500
# CACHE_TTL_DAYS=30
```

### 2. Start the API Server

```bash
cd api
npm run dev
```

**Expected logs:**
```
[repository-factory] Database initialized successfully
[repository-factory] Persistence enabled
[api-routes] Persistence enabled { cacheEnabled: true, jobTrackingEnabled: true }
```

### 3. Test Cache Behavior

#### First Request (Cache Miss)

```bash
curl -X POST http://localhost:3000/api/transcribe/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ],
    "format": "json"
  }'
```

**Expected behavior:**
- Fresh extraction from YouTube
- Response time: 2-5 seconds
- Logs show: `Cache lookup results { requested: 1, cacheHits: 0 }`
- Logs show: `Saved results to cache { count: 1 }`

#### Second Request (Cache Hit)

```bash
# Same request as above
curl -X POST http://localhost:3000/api/transcribe/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ],
    "format": "json"
  }'
```

**Expected behavior:**
- Instant response from cache
- Response time: <50ms
- Logs show: `Cache lookup results { requested: 1, cacheHits: 1 }`
- Logs show: `urlsToExtract: 0`
- No browser launch

---

## Monitoring Cache Performance

### Check Logs for Cache Metrics

**Cache hit logs:**
```
[batch-extractor] Cache lookup completed {
  batchId: '...',
  totalUrls: 5,
  cacheHits: 3,
  urlsToExtract: 2
}
```

**Cache statistics:**
- `cacheHits` - Number of URLs found in cache
- `urlsToExtract` - Number of URLs requiring fresh extraction
- **Cache Hit Rate** = `cacheHits / totalUrls * 100%`

### Database Inspection

**Connect to SQLite database:**
```bash
cd api/data
sqlite3 transcripts.db
```

**Useful queries:**
```sql
-- Total cached transcripts
SELECT COUNT(*) FROM transcripts;

-- Most accessed transcripts
SELECT video_id, video_url, access_count, last_accessed_at
FROM transcripts
ORDER BY access_count DESC
LIMIT 10;

-- Cache statistics
SELECT
  COUNT(*) as total_entries,
  MIN(extracted_at) as oldest_entry,
  MAX(extracted_at) as newest_entry,
  AVG(access_count) as avg_access_count,
  SUM(LENGTH(transcript_json)) as total_size_bytes
FROM transcripts;

-- Job statistics
SELECT status, COUNT(*) as count
FROM jobs
GROUP BY status;

-- Recent jobs
SELECT id, type, status, total_items, successful_items, failed_items, created_at
FROM jobs
ORDER BY created_at DESC
LIMIT 10;
```

---

## Verification Checklist

### ✅ Database Initialization

- [ ] Database file created at `api/data/transcripts.db`
- [ ] WAL files created (`transcripts.db-wal`, `transcripts.db-shm`)
- [ ] Logs show: "Database initialized successfully"
- [ ] Migrations table exists with 001_initial_schema applied

**Verify:**
```bash
ls -lh api/data/
sqlite3 api/data/transcripts.db "SELECT * FROM migrations;"
```

### ✅ Cache Functionality

- [ ] First request extracts from YouTube (cache miss)
- [ ] Second request returns instantly (cache hit)
- [ ] Logs show correct cache hit counts
- [ ] Database contains cached transcript

**Verify:**
```sql
SELECT video_id, video_url, access_count FROM transcripts;
```

### ✅ Job Tracking

- [ ] Job record created before processing
- [ ] Job status updates during processing
- [ ] Job completed after successful batch
- [ ] Job results stored for each video

**Verify:**
```sql
SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1;
SELECT * FROM job_results WHERE job_id = '<latest-job-id>';
```

### ✅ Performance Metrics

- [ ] Cache lookup time: <5ms
- [ ] Cache hit response time: <50ms (vs 2-5s fresh extraction)
- [ ] Database size reasonable (<1MB per 100 transcripts)

**Verify:**
```bash
du -sh api/data/transcripts.db
```

---

## Test Scenarios

### Scenario 1: Batch Processing with Mixed Cache Status

**Request:**
```json
{
  "urls": [
    "https://www.youtube.com/watch?v=VIDEO_1",  // Already cached
    "https://www.youtube.com/watch?v=VIDEO_2",  // Already cached
    "https://www.youtube.com/watch?v=VIDEO_3",  // Not cached
    "https://www.youtube.com/watch?v=VIDEO_4"   // Not cached
  ]
}
```

**Expected logs:**
```
Cache lookup completed { cacheHits: 2, urlsToExtract: 2 }
Batch transcription completed {
  cachedResults: 2,
  freshExtractions: 2,
  totalProcessingTimeMs: ~3000  // Only 2 extractions needed
}
```

### Scenario 2: Playlist Processing

**Request:**
```json
{
  "url": "https://www.youtube.com/playlist?list=PLxxx...",
  "maxVideos": 10
}
```

**Expected behavior:**
- Job created with type='playlist'
- Individual videos checked against cache
- Only non-cached videos extracted
- All results cached for future requests

### Scenario 3: Cache Eviction (LRU)

**Simulate:**
```bash
# Fill cache with 100 transcripts
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/transcribe/batch \
    -H "Content-Type: application/json" \
    -d "{\"urls\": [\"https://www.youtube.com/watch?v=VIDEO_$i\"]}"
done

# Query oldest entries
sqlite3 api/data/transcripts.db \
  "SELECT video_id, last_accessed_at FROM transcripts ORDER BY last_accessed_at ASC LIMIT 10;"
```

---

## Troubleshooting

### Issue: Database file not created

**Symptoms:**
- No `api/data/transcripts.db` file
- Logs show "Persistence disabled"

**Solution:**
```bash
# Check environment variable
echo $ENABLE_PERSISTENCE  # Should output: true

# Verify .env file
cat api/.env | grep ENABLE_PERSISTENCE

# Ensure data directory exists
mkdir -p api/data
```

### Issue: Permission errors

**Symptoms:**
- `SQLITE_CANTOPEN` error
- `EACCES` permission denied

**Solution:**
```bash
# Fix directory permissions
chmod 755 api/data

# Fix database permissions (if exists)
chmod 644 api/data/transcripts.db
```

### Issue: Migration errors

**Symptoms:**
- "Migration failed" in logs
- Database tables missing

**Solution:**
```bash
# Delete database and restart (CAUTION: loses all data)
rm api/data/transcripts.db*
npm run dev  # Migrations run automatically
```

### Issue: No cache hits

**Symptoms:**
- `cacheHits: 0` even for repeated requests
- All requests extract fresh

**Solution:**
```bash
# Check if transcripts are being saved
sqlite3 api/data/transcripts.db "SELECT COUNT(*) FROM transcripts;"

# Check logs for save errors
grep "Failed to save to cache" api/logs/*.log

# Verify ENABLE_PERSISTENCE is true
grep "Persistence enabled" api/logs/*.log
```

---

## Performance Benchmarks

### Expected Performance Metrics

**Cache Hit (Ideal):**
- Database lookup: 1-3ms
- Total response: 10-50ms
- No browser launch
- No network requests

**Cache Miss (First Request):**
- Fresh extraction: 2,000-5,000ms
- Database save: 5-10ms
- Browser launch overhead: +500ms (first time)

**Mixed Batch (50% cached):**
- 10 URLs, 5 cached, 5 fresh
- Expected time: ~12 seconds (vs 25 seconds without cache)
- **Performance gain: ~52% faster**

**Large Playlist (100 videos):**
- First run: ~5 minutes (with concurrency=3)
- Second run (all cached): ~2 seconds
- **Performance gain: ~99.3% faster**

---

## CI/CD Integration

### GitHub Actions Test

```yaml
- name: Test Persistence Layer
  env:
    ENABLE_PERSISTENCE: true
  run: |
    cd api
    npm run build
    npm start &
    sleep 5

    # Test cache miss
    curl -X POST http://localhost:3000/api/transcribe/batch \
      -H "Content-Type: application/json" \
      -d '{"urls": ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]}'

    # Test cache hit
    curl -X POST http://localhost:3000/api/transcribe/batch \
      -H "Content-Type: application/json" \
      -d '{"urls": ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]}'

    # Verify database
    sqlite3 api/data/transcripts.db "SELECT COUNT(*) FROM transcripts;"
```

---

## Next Steps

1. ✅ Verify basic caching works
2. ✅ Monitor cache hit rates
3. ⏭️ Add cache management endpoints (`/api/cache/stats`, `/api/cache/evict`)
4. ⏭️ Implement TranscribePlaylistUseCase caching
5. ⏭️ Add DuckDB analytics layer
6. ⏭️ Implement cache eviction policies
7. ⏭️ Design RAG integration for vector embeddings

---

**Status:** Ready for testing
**Environment:** Development
**Database:** SQLite (better-sqlite3)
**Feature Flag:** ENABLE_PERSISTENCE=true
