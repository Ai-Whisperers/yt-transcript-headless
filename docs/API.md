# API Documentation

**Doc-Type:** API Reference · Version 1.1.0 · Updated 2025-11-15 · AI Whisperers

## Base URL

```
http://localhost:3000/api
```

## Endpoints

### Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-15T12:00:00Z",
  "service": "yt-transcript-api",
  "uptime": 3600,
  "memory": {
    "raw": {
      "rss": 134217728,
      "heapTotal": 67108864,
      "heapUsed": 45088768,
      "external": 2097152,
      "arrayBuffers": 1048576
    },
    "heapUsedMB": 43.0,
    "heapTotalMB": 64.0,
    "externalMB": 2.0,
    "rssMB": 128.0,
    "usagePercent": 67.5
  },
  "correlationId": "abc-123-def-456"
}
```

**Memory Metrics:**
- `heapUsedMB`: Current heap memory usage in MB
- `heapTotalMB`: Total allocated heap memory in MB
- `externalMB`: External memory (C++ objects) in MB
- `rssMB`: Resident Set Size (total memory) in MB
- `usagePercent`: Memory usage percentage (triggers warning at 80%+)

### Browser Health Check

```http
GET /api/health/browser
```

Verifies browser automation capabilities with 60-second caching.

**Response (Success - 200):**
```json
{
  "browserHealthy": true,
  "chromiumVersion": "130.0.6723.58",
  "canLaunch": true,
  "lastChecked": "2025-11-15T12:00:00Z",
  "correlationId": "abc-123-def-456"
}
```

**Response (Failure - 503):**
```json
{
  "browserHealthy": false,
  "chromiumVersion": null,
  "canLaunch": false,
  "lastChecked": "2025-11-15T12:00:00Z",
  "error": "Browser launch failed",
  "correlationId": "abc-123-def-456"
}
```

### Metrics Endpoint

```http
GET /api/metrics
```

Returns observability metrics including request counts, latencies, queue stats, and browser lifecycle metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "requests": {
      "POST /api/transcribe": 150,
      "GET /api/health": 300
    },
    "errors": {
      "EXTRACTION_FAILED": 5,
      "QUEUE_FULL": 2
    },
    "latencies": {
      "POST /api/transcribe": {
        "count": 150,
        "min": 2500,
        "max": 8000,
        "avg": 4200,
        "p50": 4000,
        "p95": 6500,
        "p99": 7800
      }
    },
    "queue": {
      "pending": 0,
      "active": 2,
      "completed": 148,
      "failed": 5,
      "totalProcessed": 153
    },
    "browser": {
      "launchCount": 150,
      "cleanupFailures": 1,
      "extractionRetries": 8,
      "launchDuration": {
        "count": 100,
        "min": 1200,
        "max": 3500,
        "avg": 2100,
        "p95": 2800
      }
    },
    "timestamp": "2025-11-15T12:00:00Z",
    "correlationId": "abc-123-def-456"
  }
}
```

**Metrics Fields:**
- `requests`: Count of requests by endpoint
- `errors`: Count of errors by error code
- `latencies`: Request duration statistics (ms) with percentiles
- `queue`: Request queue statistics (pending, active, completed, failed)
- `browser.launchCount`: Total browser instances launched
- `browser.cleanupFailures`: Failed cleanup attempts
- `browser.extractionRetries`: Retry attempts during context creation
- `browser.launchDuration`: Browser launch time statistics (ms)

### Extract Transcript

```http
POST /api/transcribe
```

**Request Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "format": "json"
}
```

**Parameters:**
- `url` (string, required): YouTube video URL
- `format` (string, optional): Output format (`json`, `srt`, `text`)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "transcript": [
      {
        "time": "0:00",
        "text": "Content here"
      }
    ],
    "format": "json",
    "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
    "extractedAt": "2025-11-14T12:00:00Z"
  }
}
```

**Error Response (400/500):**
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  }
}
```

### Supported Formats

```http
GET /api/formats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "formats": ["json", "srt", "text"],
    "default": "json",
    "correlationId": "abc-123-def-456"
  }
}
```

### Extract Playlist Transcripts

```http
POST /api/transcribe/playlist
```

Extracts transcripts from all videos in a YouTube playlist using batch processing with request queue.

**Request Body:**
```json
{
  "url": "https://www.youtube.com/playlist?list=PLAYLIST_ID",
  "format": "json",
  "maxVideos": 100
}
```

**Parameters:**
- `url` (string, required): YouTube playlist URL
- `format` (string, optional): Output format (`json`, `srt`, `text`)
- `maxVideos` (number, optional): Maximum videos to process (default: 100)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "playlistUrl": "https://www.youtube.com/playlist?list=PLAYLIST_ID",
    "playlistTitle": "My Playlist",
    "totalVideos": 10,
    "processedVideos": 10,
    "failedVideos": 0,
    "videos": [
      {
        "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
        "videoTitle": "Video Title",
        "transcript": [
          {
            "time": "0:00",
            "text": "Content here"
          }
        ],
        "format": "json",
        "extractedAt": "2025-11-15T12:00:00Z"
      }
    ],
    "errors": [],
    "extractedAt": "2025-11-15T12:00:00Z",
    "correlationId": "abc-123-def-456"
  }
}
```

**Response with Partial Failures:**
```json
{
  "success": true,
  "data": {
    "playlistUrl": "https://www.youtube.com/playlist?list=PLAYLIST_ID",
    "playlistTitle": "My Playlist",
    "totalVideos": 10,
    "processedVideos": 8,
    "failedVideos": 2,
    "videos": [...],
    "errors": [
      {
        "videoUrl": "https://www.youtube.com/watch?v=FAILED_ID",
        "error": "NO_TRANSCRIPT"
      }
    ],
    "extractedAt": "2025-11-15T12:00:00Z",
    "correlationId": "abc-123-def-456"
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_URL | 400 | Provided URL is not a valid YouTube URL |
| NO_TRANSCRIPT | 404 | Video has no available transcript |
| EXTRACTION_FAILED | 500 | Failed to extract transcript after retries |
| MISSING_URL | 400 | URL parameter not provided |
| INVALID_FORMAT | 400 | Format not supported |
| RATE_LIMITED | 429 | Too many requests from IP |
| QUEUE_FULL | 503 | Service at capacity, try again later |
| QUEUE_TIMEOUT | 504 | Request timed out waiting in queue |
| EMPTY_PLAYLIST | 400 | Playlist contains no videos |
| INTERNAL_ERROR | 500 | Server error |

## Rate Limiting

- Default: 10 requests per minute per IP on `/api/transcribe` and `/api/transcribe/playlist`
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`
- No rate limiting on health check and metrics endpoints

## Request Queue

All extraction requests (`/api/transcribe` and `/api/transcribe/playlist`) are processed through a request queue to prevent resource exhaustion.

**Queue Configuration (Environment Variables):**
- `QUEUE_MAX_CONCURRENT`: Maximum concurrent extractions (default: 3)
- `QUEUE_MAX_SIZE`: Maximum queued requests (default: 100)
- `QUEUE_TIMEOUT_MS`: Queue timeout in milliseconds (default: 60000)

**Queue Behavior:**
- Requests exceeding `QUEUE_MAX_SIZE` receive `503 QUEUE_FULL` error
- Requests waiting longer than `QUEUE_TIMEOUT_MS` receive `504 QUEUE_TIMEOUT` error
- Client disconnects automatically abort browser operations
- Queue statistics available via `/api/metrics` endpoint

## Correlation IDs

All API responses include a `correlationId` field for request tracing:
- Auto-generated UUID if not provided
- Can be specified via `X-Correlation-ID` request header
- Included in all log entries for distributed tracing
- Echoed back in response header: `X-Correlation-ID`

**Example:**
```bash
curl -H "X-Correlation-ID: my-trace-123" http://localhost:3000/api/health
```

## Response Formats

### JSON Format
Default structured format with time-text pairs.

### SRT Format
SubRip subtitle format with timestamps and sequence numbers.

### Text Format
Plain text with timestamps inline.

## Example Requests

### Extract Single Video Transcript
```bash
curl -X POST http://localhost:3000/api/transcribe \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: my-request-123" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "format": "json"
  }'
```

### Extract Playlist Transcripts
```bash
curl -X POST http://localhost:3000/api/transcribe/playlist \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    "format": "json",
    "maxVideos": 50
  }'
```

### Check Browser Health
```bash
curl http://localhost:3000/api/health/browser
```

### Get Metrics
```bash
curl http://localhost:3000/api/metrics
```