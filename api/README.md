# YouTube Transcript API
**Doc-Type:** Module Documentation · Version 0.1.0-alpha · Updated 2025-11-19 · AI Whisperers

## Purpose

Backend API service for YouTube transcript extraction using headless browser automation with Playwright.

---

## Quick Start

### Development Mode
```bash
npm run dev      # Hot reload with tsx watch
```

### Production Build
```bash
npm run build    # Compile TypeScript to dist/
npm start        # Run production server
```

### Testing
```bash
npm test         # Run all tests (unit + e2e)
npm run test:unit    # Unit tests only
npm run test:e2e     # End-to-end tests only
```

### MCP Server
```bash
npm run mcp          # Run standalone MCP server
npm run mcp:build    # Build and run MCP server
```

---

## Architecture

### Hexagonal/Clean Architecture

```
src/
├── domain/              # Pure business logic
│   ├── TranscriptSegment.ts
│   ├── PlaylistTypes.ts
│   └── errors/
│       ├── AppError.ts
│       ├── OperationalError.ts
│       └── ValidationError.ts
│
├── application/         # Use cases
│   ├── TranscribeVideoUseCase.ts
│   └── TranscribePlaylistUseCase.ts
│
└── infrastructure/      # External concerns
    ├── BrowserManager.ts
    ├── TranscriptExtractor.ts
    ├── PlaylistExtractor.ts
    ├── Logger.ts
    ├── RequestQueue.ts
    ├── routes.ts
    ├── swagger.yaml
    └── mcp/
        ├── mcp-server.ts
        └── express-mcp-handler.ts
```

### Layer Responsibilities

**Domain Layer:**
- No external dependencies
- Pure TypeScript interfaces and types
- Business rules and validations
- Custom error types

**Application Layer:**
- Orchestrate domain logic
- Use case implementations
- Business workflows
- Depends only on domain layer

**Infrastructure Layer:**
- External integrations (Playwright, Express, Winston)
- HTTP routes and middleware
- Browser automation
- Logging and observability
- MCP protocol implementation

---

## Key Features

### Browser Automation
- Headless Chromium with Playwright
- Anti-detection stealth techniques
- Resource blocking for performance
- Automatic browser cleanup per request

### Error Handling
- Structured error responses
- Operational error classification
- Correlation IDs for tracing
- Retry logic with exponential backoff

### API Endpoints
- `POST /api/transcribe` - Extract transcript
- `GET /api/health` - Health check
- `GET /api/formats` - Supported formats
- `POST /api/mcp` - MCP protocol endpoint
- `GET /api-docs` - Swagger UI

### MCP Integration
- Standalone stdio server
- Express HTTP endpoint
- Tools: extract_transcript, validate_url, batch_extract
- See [MCP Quick Start](../docs/mcp/MCP-QUICKSTART.md)

---

## Configuration

### Environment Variables

Required:
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development|production)

Optional:
- `LOG_LEVEL` - Logging verbosity (info|debug|warn|error)
- `CORS_ORIGIN` - CORS allowed origins (default: *)
- `RATE_LIMIT_WINDOW` - Rate limit window in ms (default: 60000)
- `RATE_LIMIT_MAX` - Max requests per window (default: 10)
- `ENABLE_STEALTH` - Enable stealth mode (default: true)
- `MAX_CONCURRENT_BROWSERS` - Browser pool size (default: 5)
- `TIMEOUT_MS` - Extraction timeout (default: 30000)

### Rate Limiting

Production rate limits:
- 10 requests per minute per IP
- 429 status code on limit exceeded
- Applies to `/api/transcribe` endpoint

---

## Development

### Hot Reload
```bash
npm run dev
# Changes to .ts files auto-reload via tsx watch
```

### Adding New Features

1. **Domain Layer** - Define interfaces/types in `domain/`
2. **Application Layer** - Create use case in `application/`
3. **Infrastructure Layer** - Implement external integrations
4. **Routes** - Add endpoints in `infrastructure/routes.ts`
5. **Tests** - Add unit tests in `tests/unit/`, e2e in `tests/e2e/`

### Testing Strategy

**Unit Tests:**
- Mock all infrastructure dependencies
- Test domain and application logic
- Fast, isolated, deterministic

**E2E Tests:**
- Use supertest for HTTP testing
- Mock browser automation
- Validate request/response cycles

**Stealth Tests:**
```bash
npm run stealth-test        # Full stealth validation
npm run stealth-test:quick  # Quick 10-iteration test
```

---

## Docker

### Development Build
```bash
docker build --target development -t yt-transcript-api:dev .
docker run -p 3000:3000 yt-transcript-api:dev
```

### Production Build
```bash
docker build -t yt-transcript-api:prod .
docker run -p 3000:3000 yt-transcript-api:prod
```

See [Docker Maintenance](../docs/DOCKER-MAINTENANCE.md) for advanced operations.

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run production build |
| `npm test` | Run all tests |
| `npm run test:unit` | Unit tests only |
| `npm run test:e2e` | E2E tests only |
| `npm run mcp` | Run standalone MCP server |
| `npm run mcp:build` | Build and run MCP server |
| `npm run stealth-test` | Full stealth validation |
| `npm run stealth-test:quick` | Quick stealth test (10 iterations) |
| `npm run lint` | ESLint validation |

---

## Dependencies

### Production
- `express` - Web framework
- `playwright` - Headless browser automation
- `winston` - Structured logging
- `helmet` - Security headers
- `cors` - CORS middleware
- `express-rate-limit` - API rate limiting
- `@modelcontextprotocol/sdk` - MCP protocol
- `zod` - Schema validation

### Development
- `typescript` - Type safety
- `tsx` - TypeScript execution and watch
- `jest` - Testing framework
- `ts-jest` - TypeScript Jest transformer
- `supertest` - HTTP testing
- `@playwright/test` - E2E testing utilities
- `eslint` - Code linting

---

## Related Documentation

- [Main README](../README.md) - Project overview
- [Documentation Index](../docs/README.md) - All documentation
- [Architecture](../docs/ARCHITECTURE.md) - System design
- [API Reference](../docs/API.md) - API specification
- [MCP Quick Start](../docs/mcp/MCP-QUICKSTART.md) - MCP integration
- [Project Standards](../.claude/CLAUDE.md) - Coding standards
- [Local Development](../local-dev/README.md) - Development setup

---

## Support

- **Issues:** https://github.com/Ai-Whisperers/yt-transcript-headless/issues
- **Discussions:** https://github.com/Ai-Whisperers/yt-transcript-headless/discussions

---

**Version:** 0.1.0-alpha
**License:** MIT
**Maintainer:** AI Whisperers
