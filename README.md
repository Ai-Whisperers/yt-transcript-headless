# YouTube Headless Transcript Extractor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-green)](https://playwright.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
[![Version](https://img.shields.io/badge/version-0.5.0--beta-blue)](https://github.com/Ai-Whisperers/yt-transcript-headless)

**Doc-Type:** Main Documentation · Version 0.5.0-beta · Updated 2025-12-03 · AI Whisperers

A production-ready headless YouTube transcript extraction service built with Playwright, featuring advanced error handling, observability, and MCP protocol support.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Documentation](#api-documentation)
- [MCP Protocol Integration](#mcp-protocol-integration)
- [Technical Implementation](#technical-implementation)
- [Deployment](#deployment)
- [Development](#development)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

## Overview

This project provides a robust solution for extracting YouTube video transcripts using headless browser automation. It implements stealth techniques and human-like behavior patterns to reliably extract transcripts from YouTube's embedded transcript feature.

### Recent Updates

**v0.6.0-beta (2025-12-03) - RAG & Persistence Layer:**
- **RAG (Retrieval-Augmented Generation):** Vendor-agnostic semantic search and AI chat
  - Local embeddings via Xenova/transformers (384-dim, no API costs)
  - llama.cpp LLM integration (local, privacy-preserving)
  - Qdrant vector store (high-performance similarity search)
  - Easy provider swapping via environment variables
- **Persistence Layer:** SQLite-based caching and job tracking
  - Automatic transcript caching with LRU eviction
  - Job tracking with status management
  - Cache hit optimization (~99% faster for cached transcripts)
  - Cache management API endpoints
- **Semantic Search:** Find relevant transcript segments by meaning
- **RAG Chat:** Conversational AI with transcript context
- See [RAG-IMPLEMENTATION.md](RAG-IMPLEMENTATION.md) for setup guide

**v0.5.0-beta (2025-12-03) - Parallel Processing & Real-time Progress:**
- **Parallel Processing:** Both batch and playlist now process videos concurrently (3x-5x faster)
- **SSE Progress Streaming:** Real-time progress updates via Server-Sent Events
- New streaming endpoints:
  - `POST /api/transcribe/batch/stream` - Start batch with progress streaming
  - `POST /api/transcribe/playlist/stream` - Start playlist with progress streaming
  - `GET /api/transcribe/batch/progress/:jobId` - SSE endpoint for batch progress
  - `GET /api/transcribe/playlist/progress/:jobId` - SSE endpoint for playlist progress
- Progress events: `started`, `processing`, `itemCompleted`, `completed`, `failed`, `aborted`
- Added ProgressStream infrastructure for SSE connections
- Playlist now uses BrowserPool (same as batch) for parallel extraction
- New environment variables: `PLAYLIST_CONCURRENCY`, `BATCH_CONCURRENCY`

**v0.4.0-beta (2025-12-03) - Batch Processing & Browser Pooling:**
- Added `POST /api/transcribe/batch` endpoint for batch URL processing
- Implemented BrowserPool for efficient browser context reuse
- Added PooledTranscriptExtractor for batch operations
- Added BatchTranscribeUseCase with URL validation and deduplication
- New environment variables for batch and pool configuration
- Updated health endpoint with browser pool statistics

**v0.3.0-beta (2025-11-19) - Code Quality & Documentation:**
- Removed dead code (BrowserManager.autoScroll static method)
- Consolidated duplicated logic into shared utilities
- Created `utils/async-helpers.ts` for shared wait() function
- Created `utils/error-handlers.ts` for shared queue error handling
- Improved code maintainability with net reduction of 9 lines
- Reorganized documentation structure with comprehensive index
- Created module-specific READMEs for api/ and web/
- Moved all docs to `/docs` directory for better organization

**v0.1.0-alpha - Foundation:**

**Phase 2 - Enhanced YouTube URL Validation:**
- Comprehensive URL format validation with detailed error messages
- Support for multiple YouTube URL patterns (youtube.com, youtu.be)
- Query parameter extraction and validation

**Phase 1 - Disposable Browser Pattern:**
- Browser instances created per request with automatic cleanup
- Memory leak prevention and resource management
- Isolated browser contexts for parallel requests

**Advanced Error Handling & Observability:**
- Structured error responses with operational error classification
- Correlation IDs for distributed tracing
- Request context tracking and metrics middleware
- Winston logging with JSON format for production

**MCP Protocol Integration:**
- Model Context Protocol server for AI agent integration
- Standalone and HTTP integration modes
- Tools for transcript extraction, URL validation, and batch processing

### Key Features

- **RAG & Semantic Search:** AI-powered transcript search and conversational chat with vendor-agnostic architecture
- **Persistence Layer:** SQLite caching with 99% performance gain for cached transcripts
- **Parallel Processing:** Concurrent video extraction with configurable worker count (3-5x faster)
- **Real-time Progress:** Server-Sent Events (SSE) for live extraction progress updates
- **Headless Operation:** Runs without UI rendering for optimal performance
- **Disposable Browser Pattern:** Resource cleanup with automatic browser lifecycle management
- **Browser Pooling:** Reusable browser contexts for efficient batch operations
- **Batch URL Processing:** Process multiple YouTube URLs in a single request
- **Playlist Support:** Extract transcripts from entire YouTube playlists with parallel processing
- **Enhanced URL Validation:** Comprehensive YouTube URL format validation with detailed error messages
- **Stealth Mode:** Anti-detection measures including user agent spoofing, plugin mocking, and randomized delays
- **Advanced Error Handling:** Structured error responses with operational error classification
- **Observability Built-in:** Correlation IDs, request context tracking, metrics middleware, and Winston logging
- **MCP Protocol Support:** Model Context Protocol server for AI agent integration
- **Microservice Architecture:** Stateless API design ready for Kubernetes deployment
- **Multi-Format Output:** Supports JSON, SRT, and plain text formats
- **Production-Ready:** Multi-stage Docker builds, health checks, rate limiting, and graceful shutdown
- **Web Dashboard:** React + Vite UI for easy interaction

## Architecture

The project follows hexagonal architecture principles with clear separation of concerns:

```
PROJECT/
├── api/                    # Headless transcript microservice
│   ├── src/
│   │   ├── application/    # Use cases
│   │   │   ├── TranscribeVideoUseCase.ts      # Single video extraction
│   │   │   ├── TranscribePlaylistUseCase.ts   # Playlist extraction
│   │   │   └── BatchTranscribeUseCase.ts      # Batch URL extraction
│   │   ├── domain/         # Models + Errors
│   │   │   ├── TranscriptSegment.ts           # Core transcript types
│   │   │   ├── PlaylistTypes.ts               # Playlist request/response
│   │   │   ├── BatchTypes.ts                  # Batch request/response
│   │   │   └── errors/                        # Error hierarchy
│   │   ├── infrastructure/ # Playwright engine, REST endpoints, middleware
│   │   │   ├── BrowserManager.ts          # Disposable browser instances
│   │   │   ├── BrowserPool.ts             # Reusable browser context pool
│   │   │   ├── TranscriptExtractor.ts     # Extraction with BrowserManager
│   │   │   ├── PooledTranscriptExtractor.ts  # Extraction with BrowserPool
│   │   │   ├── PlaylistExtractor.ts       # Playlist video ID extraction
│   │   │   ├── ProgressStream.ts          # SSE progress streaming
│   │   │   ├── RequestQueue.ts            # Concurrency control
│   │   │   ├── Logger.ts                  # Winston logging
│   │   │   ├── routes.ts                  # Express routes
│   │   │   ├── middleware/                # Observability & error handling
│   │   │   ├── utils/                     # Shared utilities
│   │   │   └── swagger.yaml               # OpenAPI 3.0 spec
│   │   └── mcp/            # Model Context Protocol server
│   │       ├── mcp-server.ts              # MCP standalone server
│   │       └── express-mcp-handler.ts     # MCP HTTP integration
│   ├── tests/
│   │   ├── unit/           # Domain/application layer tests
│   │   └── e2e/            # API integration tests
│   ├── README.md           # API module documentation
│   └── Dockerfile          # Multi-stage production build
│
├── web/                    # React + Vite dashboard
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/       # Axios API client
│   ├── README.md           # Web module documentation
│   └── Dockerfile          # Built in multi-stage with API
│
├── docs/                   # Project documentation
│   ├── README.md           # Documentation index
│   ├── STRUCTURE.md        # Project organization guide
│   ├── ARCHITECTURE.md     # System design
│   ├── API.md              # API specification
│   ├── DEPLOYMENT.md       # Deployment guide
│   ├── mcp/                # MCP protocol docs
│   └── cloudflare/         # Cloud integration docs
│
└── local-dev/              # Development bootstrap
    ├── README.md           # Development setup guide
    ├── docker-compose.dev.yml
    └── scripts/            # Start/stop/test scripts
```

### Backend ↔ Frontend Integration

- **Local development:** Run the API on port `3000` (`npm run dev` inside `api/`) and the React dashboard on port `5173` (`npm run dev` inside `web/`). The UI reads `VITE_API_URL` (defaults to `http://localhost:3000/api`) and sends every request through the typed Axios client in `web/src/services/api.ts`, so both batch and playlist flows share the same contract as `api/src/infrastructure/routes.ts`.
- **Shared observability:** Every HTTP call includes a correlation ID header and is throttled by the Express middleware stack defined in `api/src/server.ts`, so rate limits, request queueing, and SSE progress streaming automatically apply to UI interactions.
- **Production bundling:** `Dockerfile` builds the Vite assets first, copies them into `/app/public`, and the Express server serves them via the SPA fallback. As a result, `docker-compose up` ships a single container where `/api/**` is handled by the backend router and everything else is served statically.
- **Streaming endpoints:** For playlists or large batches the API returns a job ID plus `/api/transcribe/*/progress/:jobId` SSE endpoints. The frontend connects via `EventSource` while the backend pushes incremental progress through `ProgressStream`, so real-time updates work identically in both dev and containerized deployments.

## Quick Start

### Prerequisites

- Node.js 18+
- Docker Desktop (for containerization)
- Chromium browser (installed via Playwright)

### Installation

```bash
# Clone the repository
git clone https://github.com/Ai-Whisperers/yt-transcript-headless
cd yt-transcript-headless

# Install API dependencies
cd api
npm install
npx playwright install chromium

# Install web dependencies
cd ../web
npm install
```

### Running Locally

#### API Service

```bash
cd api
npm run dev
# API runs on http://localhost:3000
```

#### Web Dashboard

```bash
cd web
npm run dev
# Dashboard runs on http://localhost:5173
```

### Terminal-Friendly CLI

Prefer to stay in the terminal? A lightweight interactive client ships with the API package:

```bash
cd api
npm run cli               # prompts for mode, URLs, format, etc.
CLI_API_URL=http://hosted-api.example.com/api npm run cli
```

- Menu-driven wrapper around the REST API (single video, playlist, and batch modes plus health checks).
- Automatically decorates requests with correlation IDs and lets you persist transcripts/SRTs/JSON summaries to disk.
- Defaults to `http://localhost:3000/api` but honors `CLI_API_URL` or `API_URL` so you can point it at remote deployments or Docker containers.

### Docker Deployment

```bash
# Build unified production image (API + Web)
docker build -t yt-transcript:latest .

# Run container with recommended resource limits
docker run -d \
  --name yt-transcript-api \
  --shm-size=1gb \
  --memory=2g \
  --cpus=2 \
  --ulimit nofile=65536:65536 \
  -p 3000:3000 \
  yt-transcript:latest

# Alternative: Build and run API only (development)
cd api
docker build -t yt-transcript-api .
docker run -d \
  --name yt-transcript-api \
  --shm-size=1gb \
  --memory=2g \
  --cpus=2 \
  --ulimit nofile=65536:65536 \
  -p 3000:3000 \
  yt-transcript-api
```

**Important Docker Runtime Flags:**
- `--shm-size=1gb` - Chromium requires shared memory for rendering (default 64MB is insufficient)
- `--memory=2g` - Memory limit (recommended: 2GB minimum for browser operations)
- `--cpus=2` - CPU limit (recommended: 2 CPUs for concurrent extractions)
- `--ulimit nofile=65536:65536` - File descriptor limit (prevents "too many open files" errors)

## API Documentation

### REST API Endpoints

**Primary Endpoint:**
```
POST /api/transcribe
Content-Type: application/json
```

**Additional Endpoints:**
- `GET /api/health` - Health check endpoint with memory metrics
- `GET /api/health/browser` - Browser health check (60s cache)
- `GET /api/metrics` - Observability metrics (requests, errors, latencies, queue stats)
- `POST /api/transcribe/playlist` - Playlist transcription (YouTube playlist URLs)
- `POST /api/transcribe/batch` - Batch URL transcription (array of video URLs)
- `POST /api/transcribe/batch/stream` - Batch with SSE progress streaming
- `POST /api/transcribe/playlist/stream` - Playlist with SSE progress streaming
- `GET /api/transcribe/batch/progress/:jobId` - SSE endpoint for batch progress
- `GET /api/transcribe/playlist/progress/:jobId` - SSE endpoint for playlist progress
- `GET /api/formats` - Get supported transcript formats
- `GET /api-docs` - Interactive Swagger UI documentation

### Request Body

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "format": "json" // Options: "json", "srt", "text"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "transcript": [
      {
        "time": "0:00",
        "text": "Hello, welcome to the video..."
      }
    ],
    "format": "json",
    "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
    "extractedAt": "2025-11-14T12:00:00Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "message": "Failed to extract transcript",
    "code": "EXTRACTION_FAILED",
    "details": {
      "correlationId": "abc-123",
      "timestamp": "2025-11-15T12:00:00Z"
    }
  }
}
```

**Error Codes:**
- `INVALID_URL` - YouTube URL validation failed
- `EXTRACTION_FAILED` - Transcript extraction failed after retries
- `TIMEOUT` - Operation exceeded timeout limit
- `RATE_LIMIT_EXCEEDED` - Too many requests from IP
- `QUEUE_FULL` - Service at capacity (503)
- `QUEUE_TIMEOUT` - Request timed out in queue (504)
- `EMPTY_PLAYLIST` - Playlist contains no videos
- `NO_VALID_URLS` - Batch contains no valid YouTube URLs

### Batch URL Endpoint

**Request:**
```json
{
  "urls": [
    "https://www.youtube.com/watch?v=VIDEO_ID_1",
    "https://www.youtube.com/watch?v=VIDEO_ID_2",
    "https://youtu.be/VIDEO_ID_3"
  ],
  "format": "json"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "batchId": "uuid-here",
    "totalUrls": 3,
    "processedUrls": 3,
    "successfulExtractions": 2,
    "failedExtractions": 1,
    "results": [
      {
        "videoId": "VIDEO_ID_1",
        "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID_1",
        "success": true,
        "transcript": [...],
        "extractedAt": "2025-12-03T12:00:00Z",
        "processingTimeMs": 5000
      }
    ],
    "format": "json",
    "startedAt": "2025-12-03T12:00:00Z",
    "completedAt": "2025-12-03T12:00:15Z",
    "totalProcessingTimeMs": 15000
  }
}
```

### SSE Progress Streaming

For long-running batch or playlist operations, use the streaming endpoints to receive real-time progress updates.

**Starting a Streaming Batch Request:**
```bash
curl -X POST http://localhost:3000/api/transcribe/batch/stream \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://youtube.com/watch?v=video1", "https://youtube.com/watch?v=video2"]}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "sseEndpoint": "/api/transcribe/batch/progress/550e8400-e29b-41d4-a716-446655440000",
    "totalUrls": 2,
    "message": "Connect to SSE endpoint for progress updates"
  }
}
```

**Connecting to SSE Progress Stream:**
```javascript
const eventSource = new EventSource('/api/transcribe/batch/progress/550e8400-...');

eventSource.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  console.log(`Status: ${progress.status}, Progress: ${progress.currentIndex}/${progress.totalItems}`);

  if (progress.status === 'completed' || progress.status === 'failed') {
    eventSource.close();
  }
};
```

**Progress Event Types:**
| Event | Description |
|:------|:------------|
| `connected` | Client connected to SSE stream |
| `started` | Job processing has begun |
| `processing` | Currently extracting a video |
| `itemCompleted` | A video extraction finished (includes success/failure) |
| `completed` | All videos processed successfully |
| `failed` | Job failed with error |
| `aborted` | Job was cancelled |
| `done` | Stream closing |

### MCP Protocol Integration

The service includes a Model Context Protocol server for AI agent integration:

**Running MCP Server (Standalone):**
```bash
cd api
npm run mcp
```

**Available MCP Tools:**
- `extract_transcript` - Extract transcript from YouTube URL
- `validate_url` - Validate YouTube URL format
- `batch_extract` - Extract transcripts from multiple URLs

**MCP Configuration:**
```json
{
  "mcpServers": {
    "youtube-transcript": {
      "command": "node",
      "args": ["dist/mcp/mcp-server.js"],
      "cwd": "/path/to/api"
    }
  }
}
```

## Technical Implementation

### Stealth Techniques

The service implements several anti-detection measures:

- Custom user agent strings
- Realistic viewport settings
- Randomized delays between actions
- Navigator webdriver flag removal
- Plugin and language spoofing
- Resource blocking for faster execution

### Extraction Flow

1. **Launch Browser:** Initialize headless Chromium with stealth configuration
2. **Navigate:** Load YouTube video page with optimized settings
3. **Expand Description:** Click "Show more" if needed
4. **Open Transcript:** Locate and click transcript button with fallback logic
5. **Extract Data:** Parse transcript segments with timestamps
6. **Format Output:** Convert to requested format (JSON/SRT/Text)
7. **Clean Up:** Close browser context and return results

## Deployment

### Kubernetes

The service is designed for Kubernetes deployment with horizontal scaling capabilities:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: yt-transcript-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: yt-transcript-api
  template:
    metadata:
      labels:
        app: yt-transcript-api
    spec:
      containers:
      - name: api
        image: yt-transcript-api:latest
        ports:
        - containerPort: 3000
```

### Environment Variables

**Required:**
```env
PORT=3000
NODE_ENV=production
```

**Optional (with defaults):**
```env
# Logging
LOG_LEVEL=info                    # debug, info, warn, error

# Security & Rate Limiting
CORS_ORIGIN=*                     # Allowed CORS origins
RATE_LIMIT_WINDOW=60000           # Rate limit window (ms)
RATE_LIMIT_MAX=10                 # Max requests per window

# Request Queue Configuration
QUEUE_MAX_CONCURRENT=3            # Max concurrent browser operations
QUEUE_MAX_SIZE=100                # Max queued requests
QUEUE_TIMEOUT_MS=60000            # Queue timeout (ms)

# Browser Configuration
TIMEOUT_MS=30000                  # Page navigation timeout
ENABLE_STEALTH=true               # Enable anti-detection (stealth techniques)

# Playlist Configuration
PLAYLIST_RATE_LIMIT_WINDOW=300000 # Playlist rate limit window (5 min)
PLAYLIST_RATE_LIMIT_MAX=3         # Max playlist requests per window
PLAYLIST_MAX_VIDEOS_LIMIT=100     # Max videos per playlist
PLAYLIST_CONCURRENCY=3            # Parallel workers for playlist extraction

# Batch Configuration
BATCH_RATE_LIMIT_WINDOW=300000    # Batch rate limit window (5 min)
BATCH_RATE_LIMIT_MAX=5            # Max batch requests per window
BATCH_MAX_SIZE=50                 # Max URLs per batch request
BATCH_CONCURRENCY=3               # Parallel workers for batch extraction

# Browser Pool Configuration (for batch/playlist operations)
POOL_MAX_CONTEXTS=5               # Max browser contexts in pool
POOL_CONTEXT_MAX_AGE=300000       # Context max age before recycling (5 min)
POOL_CONTEXT_MAX_USES=10          # Max extractions per context
POOL_ACQUIRE_TIMEOUT=30000        # Timeout waiting for available context
```

## Development

### Testing

```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# All tests
npm test
```

### Code Style

The project follows SOLID principles and clean architecture patterns:

- Single Responsibility Principle in domain models
- Dependency Injection for testability
- Interface segregation for flexibility
- Clear separation between layers
- Strict TypeScript configuration with no implicit any

### Observability & Monitoring

**Built-in Features:**
- **Correlation IDs:** Track requests across distributed systems
- **Request Context:** Capture request metadata (method, URL, user agent, IP)
- **Structured Logging:** Winston with JSON format for production
- **Metrics Middleware:** Request duration, status code tracking
- **Error Classification:** Operational vs programmer errors
- **Health Checks:** `/api/health` endpoint with Docker healthcheck

**Log Levels:**
```typescript
logger.debug('Browser navigation details', { url, viewport });
logger.info('Transcript extraction started', { videoUrl, format });
logger.warn('Retry attempt after failure', { attempt, maxRetries });
logger.error('Extraction failed', { error, correlationId });
```

### Advanced Features

**Disposable Browser Pattern:**
- Browser instances created per request
- Automatic resource cleanup on success/failure
- Memory leak prevention
- Isolated contexts for parallel requests

**Enhanced URL Validation:**
- Comprehensive YouTube URL format checking
- Support for multiple URL patterns (youtube.com, youtu.be)
- Query parameter extraction and validation
- Detailed error messages for invalid formats

**Retry Strategy:**
- Progressive delay between retries (2s, 4s, 6s)
- Maximum 3 retry attempts
- Graceful degradation with fallback selectors
- Detailed logging for debugging

## Tech Stack

### Backend

| Technology | Version | Purpose |
|:-----------|:--------|:--------|
| **Node.js** | 18+ | Runtime environment |
| **TypeScript** | 5.3+ | Type-safe development |
| **Express** | 4.18+ | Web framework |
| **Playwright** | 1.40+ | Headless browser automation |
| **Winston** | 3.11+ | Structured logging |
| **Helmet** | 7.1+ | Security headers |
| **express-rate-limit** | 7.1+ | API rate limiting |
| **Zod** | 3.25+ | Schema validation |
| **MCP SDK** | 1.22+ | Model Context Protocol |
| **Jest** | 29.7+ | Testing framework |

### Frontend

| Technology | Version | Purpose |
|:-----------|:--------|:--------|
| **React** | 18.2+ | UI framework |
| **TypeScript** | 5.2+ | Type safety |
| **Vite** | 5.0+ | Build tool & dev server |
| **Axios** | 1.6+ | HTTP client |

### DevOps

| Technology | Purpose |
|:-----------|:--------|
| **Docker** | Multi-stage containerization |
| **Playwright Base Image** | Pre-configured browser environment |
| **Docker Compose** | Local development orchestration |
| **Kubernetes** | Production deployment (ready) |

## Documentation

Complete documentation is organized in the `/docs` directory:

- **[Documentation Index](docs/README.md)** - Complete documentation navigation
- **[Project Structure](docs/STRUCTURE.md)** - Understanding codebase organization
- **[Architecture](docs/ARCHITECTURE.md)** - System design and patterns
- **[API Reference](docs/API.md)** - RESTful API specification
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Multi-platform deployment
- **[MCP Quick Start](docs/mcp/MCP-QUICKSTART.md)** - MCP protocol integration
- **[Local Development](local-dev/README.md)** - Development environment setup

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or suggestions, please open an issue on the [GitHub repository](https://github.com/Ai-Whisperers/yt-transcript-headless/issues).

## Acknowledgments

- **Playwright Team** - Excellent browser automation framework with powerful API
- **Anthropic** - Model Context Protocol SDK for AI agent integration
- **Express.js Community** - Robust middleware ecosystem (helmet, cors, rate-limit)
- **Winston** - Comprehensive logging library with multiple transports
- **Open Source Community** - Stealth techniques, anti-detection patterns, and best practices
- **TypeScript Team** - Type safety and developer experience improvements

---

**Note:** This tool is for educational and legitimate use cases only. Please respect YouTube's Terms of Service and content creators' rights when using this service.
