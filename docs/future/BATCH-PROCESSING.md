# Batch Processing Feature

**Doc-Type:** Future Feature · Version 0.1.0 · Updated 2025-11-14 · AI Whisperers

## Overview

Enable processing multiple YouTube URLs in a single request with queue management.

## API Changes

### Batch Endpoint
```http
POST /api/transcribe/batch
```

**Request:**
```json
{
  "urls": [
    "https://www.youtube.com/watch?v=VIDEO_1",
    "https://www.youtube.com/watch?v=VIDEO_2"
  ],
  "format": "json",
  "options": {
    "parallel": 3,
    "continueOnError": true
  }
}
```

**Response:**
```json
{
  "batchId": "batch_12345",
  "status": "processing",
  "total": 2,
  "completed": 0,
  "results": []
}
```

### Status Endpoint
```http
GET /api/batch/{batchId}/status
```

## Implementation Requirements

### Queue System
- Redis or Bull queue integration
- Worker pool management
- Priority queue support
- Dead letter queue for failures

### Processing Strategy
- Concurrent browser contexts
- Resource pooling
- Memory management
- Progress tracking

### Database Schema
```sql
CREATE TABLE batch_jobs (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP,
  status VARCHAR(20),
  total_urls INTEGER,
  completed INTEGER,
  failed INTEGER,
  results JSONB
);
```

## Configuration

```env
MAX_CONCURRENT_JOBS=5
BATCH_TIMEOUT_MS=300000
MAX_BATCH_SIZE=50
QUEUE_TYPE=redis
```

## UI Components

### Batch Input
- Multi-line URL input
- CSV file upload
- URL validation
- Duplicate detection

### Progress Display
- Real-time progress bar
- Individual URL status
- Error summary
- Download all results

## Performance Considerations

- Browser instance pooling
- Connection reuse
- Memory limits per batch
- Rate limiting per batch

## Error Handling

- Partial success responses
- Retry failed URLs
- Error aggregation
- Notification system