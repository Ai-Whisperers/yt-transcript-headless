# Architecture Documentation

**Doc-Type:** Architecture Guide · Version 1.1.0 · Updated 2025-11-15 · AI Whisperers

## Overview

Hexagonal architecture implementation with clear separation between business logic and infrastructure. The system follows a disposable resource pattern with request queue-based concurrency control for optimal resource management.

## Layers

### Domain Layer
Location: `api/src/domain/`

**Entities:**
- `TranscriptSegment`: Core transcript data model
- `TranscriptFormat`: Supported output formats (JSON, SRT, Text)
- `TranscriptRequest/Response`: API contracts for single video extraction
- `PlaylistRequest/Response`: API contracts for playlist extraction
- `PlaylistTypes`: Playlist metadata and video information models

**Error Models:**
- `AppError`: Base application error class
- `OperationalError`: Expected errors (validation, extraction failures)
- Domain-specific errors: `MissingFieldError`, `InvalidFormatError`, `InvalidURLError`

**Characteristics:**
- Zero external dependencies
- Pure business models
- Framework agnostic
- Immutable data structures

### Application Layer
Location: `api/src/application/`

**Use Cases:**
- `TranscribeVideoUseCase`: Orchestrates single video transcript extraction
- `TranscribePlaylistUseCase`: Orchestrates playlist batch processing

**Responsibilities:**
- Business logic coordination
- Input validation (URL format, parameters)
- Output formatting
- Error handling and classification
- Abort signal handling for client disconnects

### Infrastructure Layer
Location: `api/src/infrastructure/`

**Core Adapters:**
- `BrowserManager`: Playwright browser lifecycle with disposable pattern
- `TranscriptExtractor`: YouTube video DOM interaction and extraction
- `PlaylistExtractor`: YouTube playlist parsing and video enumeration
- `RequestQueue`: Promise-based concurrency control with timeout handling
- `Logger`: Winston logging adapter with structured output

**HTTP Layer:**
- `routes.ts`: Express route handlers with async error handling
- `middleware/`: Observability and error handling middleware
  - `correlationIdMiddleware`: Request tracing via X-Correlation-ID
  - `requestContextMiddleware`: Logger injection with request metadata
  - `requestLoggingMiddleware`: HTTP request/response logging
  - `metricsMiddleware`: Request duration and endpoint tracking
  - `errorHandlerMiddleware`: Centralized error response formatting
  - `asyncHandler`: Async route wrapper with error propagation

**Observability:**
- `MetricsCollector`: Centralized metrics collection (requests, errors, latencies, queue stats, browser lifecycle)
- Winston logging with JSON format for production
- Correlation IDs for distributed tracing

**External Dependencies:**
- Playwright 1.40+ for browser automation
- Express 4.18+ for HTTP server
- Winston 3.11+ for structured logging
- Helmet 7.1+ for security headers
- express-rate-limit 7.1+ for API rate limiting

## Data Flow

### Single Video Extraction

```
HTTP Request
    ↓
Middleware Stack (correlation ID, logging, metrics)
    ↓
Route Handler (/api/transcribe)
    ↓
RequestQueue.add() → Queue Management (max 3 concurrent, 100 max size)
    ↓
TranscribeVideoUseCase.execute(request, abortSignal)
    ↓
TranscriptExtractor.extract(videoUrl)
    ↓
BrowserManager.runIsolated(work callback)
    ↓
Fresh Chromium Launch (headless + stealth)
    ↓
YouTube Navigation & DOM Interaction
    ↓
Transcript Segments Extracted
    ↓
Browser Cleanup (always, success OR failure)
    ↓
Response ← Formatted TranscriptResponse
```

### Playlist Extraction

```
HTTP Request
    ↓
Middleware Stack (correlation ID, logging, metrics)
    ↓
Route Handler (/api/transcribe/playlist)
    ↓
RequestQueue.add() → Queue Management
    ↓
TranscribePlaylistUseCase.execute(request, abortSignal)
    ↓
PlaylistExtractor.extractPlaylistInfo() → Get video URLs
    ↓
For each video: TranscribeVideoUseCase.execute()
    ↓
Batch Processing with Error Collection
    ↓
Response ← PlaylistResponse (videos + errors)
```

### Browser Lifecycle (Disposable Pattern)

```
Request Arrives
    ↓
BrowserManager.runIsolated() called
    ↓
1. Launch fresh Chromium instance
   ├─ Record launch duration
   └─ Apply stealth configuration
    ↓
2. Create browser context with retry (max 3 attempts)
   └─ Record retry if context creation fails
    ↓
3. Create page and attach crash listeners
    ↓
4. Execute work callback (extraction logic)
    ↓
5. Cleanup (ALWAYS executed in finally block)
   ├─ Close page
   ├─ Close context
   ├─ Close browser
   └─ Record cleanup failures
    ↓
Metrics Recorded (launch count, duration, failures, retries)
```

## Key Design Decisions

### Disposable Browser Pattern
**Rationale:** Prevent memory leaks and resource exhaustion
- Fresh Chromium instance launched per request
- Guaranteed cleanup in finally block (success OR failure)
- Isolated contexts for parallel requests
- Metrics tracking for lifecycle monitoring

### Request Queue with Concurrency Control
**Rationale:** Prevent resource exhaustion and manage system load
- Maximum 3 concurrent browser operations (configurable via `QUEUE_MAX_CONCURRENT`)
- Maximum 100 queued requests (configurable via `QUEUE_MAX_SIZE`)
- 60-second timeout (configurable via `QUEUE_TIMEOUT_MS`)
- Automatic abort on client disconnect

### Dependency Injection
**Rationale:** Testability and flexibility
- Use cases receive infrastructure services via constructor injection
- No direct instantiation of external dependencies in domain/application layers
- Enables easy mocking for unit tests

### Retry Logic with Progressive Delays
**Rationale:** Handle transient YouTube layout changes and network issues
- Browser context creation: 3 attempts with 1s, 2s, 3s delays
- Extraction attempts: 3 times with 2s, 4s, 6s delays
- Fallback extraction methods with multiple selector strategies

### Abort Signal Propagation
**Rationale:** Resource cleanup on client disconnect
- AbortController attached to request lifecycle
- Browser killed immediately when client disconnects
- Prevents zombie processes and wasted resources

### Stealth Techniques
**Rationale:** Reliable transcript extraction
- Navigator webdriver flag removal
- Chrome runtime object mocking
- Realistic user agents (latest Chrome version)
- Plugin and language spoofing
- Human-like randomized delays
- Resource blocking (images, ads, analytics)

## Service Components

### BrowserManager
**Location:** `api/src/infrastructure/BrowserManager.ts`

**Responsibilities:**
- Disposable browser lifecycle management (launch → use → cleanup)
- Stealth configuration application (navigator spoofing, chrome object mocking)
- Context creation with retry logic (max 3 attempts)
- Abort signal handling for client disconnects
- Metrics instrumentation (launch duration, cleanup failures)

**Key Methods:**
- `runIsolated<T>(work, abortSignal)`: Execute callback in isolated browser with guaranteed cleanup
- `createContextWithRetry(browser, maxRetries)`: Create context with retry logic
- `applyStealth(context)`: Apply anti-detection measures
- `autoScroll(page)`: Human-like scrolling for dynamic content

### RequestQueue
**Location:** `api/src/infrastructure/RequestQueue.ts`

**Responsibilities:**
- Concurrency control (max 3 concurrent operations)
- Queue size management (max 100 queued requests)
- Timeout enforcement (60s default)
- Statistics tracking (pending, active, completed, failed)

**Configuration:**
- `maxConcurrent`: Environment variable `QUEUE_MAX_CONCURRENT` (default: 3)
- `maxSize`: Environment variable `QUEUE_MAX_SIZE` (default: 100)
- `timeoutMs`: Environment variable `QUEUE_TIMEOUT_MS` (default: 60000)

### TranscriptExtractor
**Location:** `api/src/infrastructure/TranscriptExtractor.ts`

**Responsibilities:**
- YouTube video DOM interaction
- Multiple selector strategies with fallback
- Transcript panel auto-scroll
- Segment parsing and formatting

**Extraction Strategy:**
1. Navigate to video URL
2. Expand description if needed
3. Locate transcript button (10+ selector variations)
4. Open transcript panel
5. Auto-scroll to load all segments
6. Parse time-text pairs
7. Format output (JSON/SRT/Text)

### PlaylistExtractor
**Location:** `api/src/infrastructure/PlaylistExtractor.ts`

**Responsibilities:**
- YouTube playlist metadata extraction
- Video enumeration with auto-scroll
- Batch processing coordination

**Key Methods:**
- `extractPlaylistInfo(playlistUrl)`: Get playlist metadata and video URLs
- Auto-scroll playlist container until all videos loaded
- Handle empty playlists gracefully

### MetricsCollector
**Location:** `api/src/infrastructure/middleware/observability.ts`

**Responsibilities:**
- Request counting by endpoint
- Error counting by error code
- Latency tracking with percentiles (p50, p95, p99)
- Queue statistics (pending, active, completed, failed)
- Browser lifecycle metrics (launch count, duration, failures, retries)

**Retention Policy:**
- Last 100 latency measurements per operation
- Last 100 browser launch duration measurements

### Logger
**Location:** `api/src/infrastructure/Logger.ts`

**Responsibilities:**
- Winston-based structured logging
- Environment-based configuration (development vs production)
- Child logger creation with context (correlation ID, request metadata)

**Log Levels:**
- `debug`: Browser interaction details (development only)
- `info`: Request lifecycle, successful operations
- `warn`: Retry attempts, fallback methods, high memory usage
- `error`: Extraction failures, unhandled exceptions

**Output:**
- Development: Colorized console output
- Production: JSON format to error.log and combined.log

## Error Handling

### Hierarchical Error Classification

**Domain Layer Errors (400-level):**
- `MissingFieldError`: Required field not provided (400)
- `InvalidFormatError`: Unsupported output format (400)
- `InvalidURLError`: Malformed YouTube URL (400)
- `EmptyPlaylistError`: Playlist contains no videos (400)

**Infrastructure Layer Errors (500-level):**
- `EXTRACTION_FAILED`: Transcript extraction failed after retries (500)
- `NO_TRANSCRIPT`: Video has no available transcript (404)
- Browser launch/crash failures (500)

**Queue Errors (503/504):**
- `QUEUE_FULL`: Service at capacity, queue size exceeded (503)
- `QUEUE_TIMEOUT`: Request timed out waiting in queue (504)

**Rate Limiting Errors:**
- `RATE_LIMITED`: Too many requests from IP (429)

### Error Response Format

All errors follow consistent structure:
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error description",
    "code": "MACHINE_READABLE_CODE",
    "details": {
      "correlationId": "uuid-for-tracing",
      "timestamp": "2025-11-15T12:00:00Z"
    }
  }
}
```

### Error Handling Flow

```
Error Thrown
    ↓
Domain/Application Layer Validation → OperationalError
    ↓
Infrastructure Layer Failure → Logged with correlation ID
    ↓
Middleware Error Handler → Formatted Error Response
    ↓
Client receives structured error + HTTP status code
```

## Security Considerations

### Input Validation
- YouTube URL format validation at use case level
- Format enum validation (JSON, SRT, Text only)
- MaxVideos parameter bounds checking (1-100)
- Query parameter sanitization

### Rate Limiting
- 10 requests/minute per IP on `/api/transcribe` and `/api/transcribe/playlist`
- No rate limiting on health check and metrics endpoints
- Configurable via `RATE_LIMIT_WINDOW` and `RATE_LIMIT_MAX` environment variables
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`

### HTTP Security Headers (Helmet.js)
- Content Security Policy (CSP) disabled for Swagger UI
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security in production
- X-XSS-Protection enabled

### CORS Configuration
- Environment-based origin whitelist via `CORS_ORIGIN`
- Default: Allow all origins in development
- Production: Restrict to specific domains

### Resource Isolation
- Disposable browser instances prevent cross-request contamination
- No session storage or cookies
- Stateless API design (horizontal scaling safe)

### Logging Security
- No sensitive data logged (URLs sanitized)
- Structured logging with correlation IDs
- Error stack traces logged but not exposed to clients
- Production logs written to files (not just console)

### Docker Security
- Non-root user execution (`appuser` with UID 1000)
- Multi-stage builds minimize attack surface
- Only production dependencies in final image
- Health checks for container orchestration

### Browser Sandbox
```typescript
args: [
  '--no-sandbox',           // Required for Docker (controlled environment)
  '--disable-setuid-sandbox',
  '--disable-web-security', // Only for transcript extraction (no user data)
  '--disable-dev-shm-usage'
]
```

**Rationale:** Browser runs in isolated container with no access to user data or credentials.