# API Documentation

**Doc-Type:** API Reference · Version 1.0.0 · Updated 2025-11-14 · AI Whisperers

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
  "timestamp": "2025-11-14T12:00:00Z",
  "service": "yt-transcript-api"
}
```

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
  "formats": ["json", "srt", "text"],
  "default": "json"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| INVALID_URL | Provided URL is not a valid YouTube URL |
| NO_TRANSCRIPT | Video has no available transcript |
| EXTRACTION_FAILED | Failed to extract transcript |
| MISSING_URL | URL parameter not provided |
| INVALID_FORMAT | Format not supported |
| RATE_LIMITED | Too many requests |
| INTERNAL_ERROR | Server error |

## Rate Limiting

- Default: 10 requests per minute per IP
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`

## Response Formats

### JSON Format
Default structured format with time-text pairs.

### SRT Format
SubRip subtitle format with timestamps and sequence numbers.

### Text Format
Plain text with timestamps inline.