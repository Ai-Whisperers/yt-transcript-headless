# YouTube Headless Transcript Extractor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-green)](https://playwright.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
[![Version](https://img.shields.io/badge/version-0.1.0--alpha-orange)](https://github.com/Ai-Whisperers/yt-transcript-headless)

**Doc-Type:** Main Documentation · Version 0.1.0-alpha · Updated 2025-11-15 · AI Whisperers

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

### Recent Updates (v0.1.0-alpha)

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

- **Headless Operation:** Runs without UI rendering for optimal performance
- **Disposable Browser Pattern:** Resource cleanup with automatic browser lifecycle management
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
│   │   ├── application/    # Use cases (TranscribeVideoUseCase)
│   │   ├── domain/         # Models (TranscriptSegment) + Errors (AppError, OperationalError, ValidationError)
│   │   ├── infrastructure/ # Playwright engine, REST endpoints, middleware
│   │   │   ├── BrowserManager.ts          # Browser lifecycle with stealth config
│   │   │   ├── TranscriptExtractor.ts     # Extraction logic with retry
│   │   │   ├── Logger.ts                  # Winston logging
│   │   │   ├── routes.ts                  # Express routes
│   │   │   ├── middleware/                # Observability & error handling
│   │   │   └── swagger.yaml               # OpenAPI 3.0 spec
│   │   └── mcp/            # Model Context Protocol server
│   │       ├── mcp-server.ts              # MCP standalone server
│   │       └── express-mcp-handler.ts     # MCP HTTP integration
│   ├── tests/
│   │   ├── unit/           # Domain/application layer tests
│   │   └── e2e/            # API integration tests
│   └── Dockerfile          # Multi-stage production build
│
└── web/                    # React + Vite dashboard
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   └── services/       # Axios API client
    └── Dockerfile          # Built in multi-stage with API
```

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
- `GET /api/health` - Health check endpoint
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

# Browser Configuration
MAX_CONCURRENT_BROWSERS=5         # Max browser instances
TIMEOUT_MS=30000                  # Operation timeout
ENABLE_STEALTH=true               # Enable anti-detection
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