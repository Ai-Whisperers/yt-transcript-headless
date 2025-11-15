# YouTube Transcript Extractor - Project Standards
Doc-Type: Project-Level Configuration · Version 1.0.0 · Updated 2025-11-15 · AI Whisperers

## Purpose & Scope

This manifest defines project-specific development standards for the YouTube Transcript Headless Extractor microservice. These standards ensure consistency, maintainability, and production-readiness across the codebase.

**Scope:** Project-level configuration (.claude/)
**Inheritance:** Inherits from user-level preferences (~/.claude/CLAUDE.md)

---

## Project Overview

**Mission:** Provide a reliable, headless YouTube transcript extraction service using browser automation with anti-detection stealth techniques.

**Core Technology:**
- Backend: Node.js 18+ with TypeScript, Express, Playwright
- Frontend: React 18+ with TypeScript, Vite
- Deployment: Docker multi-stage builds, Kubernetes-ready
- Testing: Jest (unit & e2e)

**Architecture Style:** Hexagonal/Clean Architecture with Domain-Driven Design principles

---

## Architecture Standards

### Layer Separation

Strict adherence to hexagonal architecture with three distinct layers:

```
api/src/
├── domain/              # Pure business logic, no dependencies
│   └── TranscriptSegment.ts   # Domain models, interfaces, enums
├── application/         # Use cases orchestrating domain logic
│   └── TranscribeVideoUseCase.ts
└── infrastructure/      # External concerns (HTTP, browser, logging)
    ├── routes.ts        # Express route handlers
    ├── BrowserManager.ts
    ├── TranscriptExtractor.ts
    └── Logger.ts
```

**Rules:**
- Domain layer has ZERO external dependencies (no Express, Playwright, etc.)
- Application layer depends only on domain layer
- Infrastructure layer implements interfaces defined in domain
- All external dependencies isolated in infrastructure layer

### Dependency Injection Pattern

Always use constructor injection for testability:

```typescript
// CORRECT: Constructor injection
export class TranscribeVideoUseCase {
  constructor(
    private extractor: TranscriptExtractor,
    private logger: Logger
  ) {}
}

// INCORRECT: Direct instantiation
export class TranscribeVideoUseCase {
  private extractor = new TranscriptExtractor(); // NO
}
```

### Single Responsibility Principle

Each class serves exactly one purpose:
- BrowserManager: Browser lifecycle and stealth configuration
- TranscriptExtractor: Transcript extraction logic with retry mechanism
- TranscribeVideoUseCase: Orchestrate extraction workflow
- Logger: Centralized logging with Winston

---

## Code Quality Requirements

### TypeScript Standards

**Compiler Configuration:**
- Strict mode enabled (strictNullChecks, strictFunctionTypes)
- Target: ES2022, Module: CommonJS (backend) / ESNext (frontend)
- No implicit any allowed in new code
- All public APIs must have explicit return types

**Type Safety:**
```typescript
// CORRECT: Explicit types and null checks
async extract(videoUrl: string): Promise<TranscriptSegment[]> {
  const transcript = await this.extractSegments(page);
  if (!transcript || transcript.length === 0) {
    throw new Error('No transcript found');
  }
  return transcript;
}

// INCORRECT: Implicit any, missing null checks
async extract(videoUrl) {  // NO: implicit any
  return await this.extractSegments(page); // NO: no validation
}
```

### Naming Conventions

**Files:**
- PascalCase for classes: `BrowserManager.ts`, `TranscriptExtractor.ts`
- camelCase for utilities: `routes.ts`, `swagger.yaml`
- Test files: `*.test.ts` or `*.spec.ts`

**Code:**
- Classes/Interfaces: PascalCase (`TranscriptSegment`, `ErrorResponse`)
- Functions/Variables: camelCase (`extractTranscript`, `videoUrl`)
- Constants/Enums: PascalCase for enums, UPPER_SNAKE_CASE for constants
- Private members: prefix with `private` keyword (not underscore)

### Error Handling Philosophy

**Structured Error Responses:**
```typescript
// Domain-level error responses
interface ErrorResponse {
  success: false;
  error: {
    message: string;      // Human-readable
    code: string;         // Machine-readable (INVALID_URL, EXTRACTION_FAILED)
    details?: any;        // Optional stack trace or context
  };
}
```

**Retry Logic with Progressive Delays:**
```typescript
// Implement retry with exponential backoff
while (attempt < this.maxRetries) {
  try {
    return await this.attemptExtraction(videoUrl);
  } catch (error) {
    if (attempt < this.maxRetries) {
      await this.wait(2000 * attempt); // Progressive delay
    }
  }
}
```

**Graceful Degradation:**
- Always provide fallback extraction methods
- Log warnings instead of failing for non-critical operations
- Return meaningful error messages to API consumers

---

## Security Requirements

### Defense in Depth

**Application Security:**
- Helmet middleware for security headers (CSP disabled for Swagger UI)
- CORS configured with environment-based origins
- Rate limiting: 10 requests/minute per IP on /api/transcribe
- Input validation on all API endpoints
- No sensitive data in logs (sanitize URLs, user agents)

**Docker Security:**
- Non-root user execution (appuser with audio/video groups)
- Multi-stage builds to minimize attack surface
- Only production dependencies in final image
- Health checks for container orchestration

**Browser Sandbox:**
```typescript
// Playwright security flags
args: [
  '--no-sandbox',           // Required for Docker
  '--disable-setuid-sandbox',
  '--disable-web-security', // Only for transcript extraction
  '--disable-dev-shm-usage'
]
```

### Anti-Detection Stealth Techniques

**Required Stealth Measures:**
1. Custom user agent (latest Chrome version)
2. Viewport randomization (1920x1080 baseline)
3. Navigator.webdriver flag removal
4. Plugin array mocking (PDF viewer, NaCl)
5. Language/locale spoofing (en-US)
6. Playwright traces removal (`delete window.__playwright`)
7. Human-like delays with randomization

**Implementation Pattern:**
```typescript
// Always use random delays between interactions
await page.click(selector, {
  delay: BrowserManager.randomDelay(100, 300)
});
await this.wait(BrowserManager.randomDelay(500, 1000));
```

---

## Development Workflow

### Local Development Setup

```bash
# API development (hot reload)
cd api
npm run dev          # tsx watch on port 3000

# Web development (hot reload)
cd web
npm run dev          # Vite dev server on port 5173

# Run tests
npm test             # All tests
npm run test:unit    # Unit tests only
npm run test:e2e     # E2E tests only
```

### Environment Variables

**Required Variables:**
```env
PORT=3000
NODE_ENV=development|production
LOG_LEVEL=info|debug|warn|error
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=10
```

**Optional Variables:**
```env
MAX_CONCURRENT_BROWSERS=5
TIMEOUT_MS=30000
ENABLE_STEALTH=true
```

### Git Workflow

**Commit Message Style:**
- Follow existing repository style (imperative mood)
- Examples: "Fix TypeScript build errors for production Docker build"
- Use prefixes: `fix:`, `feat:`, `docs:`, `refactor:`, `test:`

**Branch Strategy:**
- Main branch: `main` (production-ready)
- Feature branches: `feature/description`
- Bugfix branches: `fix/description`
- Never force push to main

---

## Testing Strategy

### Test Organization

```
api/tests/
├── unit/           # Unit tests for domain/application logic
│   ├── TranscribeVideoUseCase.test.ts
│   └── TranscriptExtractor.test.ts
└── e2e/            # End-to-end API tests
    └── api.e2e.test.ts
```

### Testing Principles

**Unit Tests:**
- Mock all infrastructure dependencies (BrowserManager, Logger)
- Test domain logic in isolation
- Validate error handling paths
- Target: >80% coverage on domain/application layers

**E2E Tests:**
- Use supertest for API endpoint testing
- Mock Playwright browser for deterministic tests
- Validate full request/response cycles
- Test rate limiting behavior

**Example Test Pattern:**
```typescript
describe('TranscribeVideoUseCase', () => {
  let useCase: TranscribeVideoUseCase;
  let mockExtractor: jest.Mocked<TranscriptExtractor>;

  beforeEach(() => {
    mockExtractor = {
      extract: jest.fn()
    } as any;
    useCase = new TranscribeVideoUseCase(mockExtractor, mockLogger);
  });

  it('should validate YouTube URL format', async () => {
    const result = await useCase.execute({ url: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_URL');
  });
});
```

---

## Docker & Deployment

### Multi-Stage Build Pattern

**Build Stages:**
1. `frontend-builder`: Build React app (npm ci, vite build)
2. `backend-builder`: Compile TypeScript (npm ci, tsc)
3. `production runtime`: Playwright base + production artifacts

**Optimization Rules:**
- Use `npm ci` (not `npm install`) for deterministic builds
- `--only=production` flag for runtime dependencies
- Copy only built artifacts (dist/, public/) to final stage
- Install only Chromium browser (not full Playwright suite)

**Health Checks:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health'...)"
```

### Kubernetes Readiness

**Stateless Design:**
- No session storage (API is completely stateless)
- Browser instances created/destroyed per request
- Horizontal scaling supported (replicas: 3+)

**Resource Limits:**
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"
```

**Graceful Shutdown:**
- SIGTERM/SIGINT handlers implemented
- Browser cleanup on shutdown
- 10-second timeout for in-flight requests

---

## API Design Patterns

### RESTful Conventions

**Endpoints:**
- `GET /api/health` - Health check
- `POST /api/transcribe` - Extract transcript
- `GET /api/formats` - Get supported formats

**Response Format:**
```typescript
// Success response
{
  success: true,
  data: {
    transcript: TranscriptSegment[],
    format: string,
    videoUrl: string,
    extractedAt: string
  }
}

// Error response
{
  success: false,
  error: {
    message: string,
    code: string,
    details?: any
  }
}
```

### Swagger Documentation

**Requirements:**
- OpenAPI 3.0.3 specification in `swagger.yaml`
- Document all endpoints with examples
- Include rate limiting information
- Specify request/response schemas
- Provide curl examples in descriptions

---

## Frontend Development

### React Component Organization

```
web/src/
├── components/     # Reusable UI components
├── pages/          # Page-level components
├── services/       # API client (api.ts)
└── main.tsx        # Application entry point
```

### API Client Pattern

**Centralized Axios Instance:**
```typescript
class TranscriptAPI {
  private client = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' }
  });

  async extractTranscript(request: TranscriptRequest) {
    // Type-safe API calls with error handling
  }
}
```

**Type Consistency:**
- Share TypeScript interfaces between frontend/backend
- Use enums for format validation
- Mirror domain models in frontend services

---

## Logging Standards

### Winston Configuration

**Log Levels:**
- `error`: Extraction failures, unhandled exceptions
- `warn`: Retry attempts, fallback methods activated
- `info`: Request lifecycle, successful extractions
- `debug`: Detailed browser interactions (development only)

**Structured Logging:**
```typescript
logger.info('Starting transcript extraction', {
  videoUrl: request.url,
  format: request.format,
  attempt: 1
});

logger.error('Extraction failed', {
  error: error.message,
  stack: error.stack,
  videoUrl: request.url
});
```

**Production Logging:**
- Console output: colorized simple format
- File output: JSON format (error.log, combined.log)
- No sensitive data in logs (sanitize before logging)

---

## Performance Optimization

### Browser Resource Blocking

```typescript
// Block unnecessary resources for faster loading
await page.route('**/*.{png,jpg,jpeg,webp,svg,gif,ico,woff,woff2}',
  route => route.abort()
);
await page.route('**/{ads,analytics,tracking}/**',
  route => route.abort()
);
```

### Timeout Configuration

- Page navigation: 30 seconds
- Transcript panel load: 10 seconds
- Element visibility checks: 2-3 seconds
- API request timeout: 60 seconds (frontend)

### Retry Strategy

- Max retries: 3 attempts
- Progressive delay: 2000ms * attempt number
- Fallback extraction methods after primary failure

---

## Common Pitfalls & Solutions

### Issue: YouTube Layout Changes

**Solution:** Multiple selector strategies with fallback methods
```typescript
const transcriptSelectors = [
  'button[aria-label*="transcript" i]',
  'button[title*="Transcript" i]',
  'yt-button-shape button:has-text("Show transcript")',
  // ... more selectors
];

for (const selector of transcriptSelectors) {
  if (await page.locator(selector).isVisible()) {
    await page.click(selector);
    break;
  }
}
```

### Issue: Partial Transcript Loading

**Solution:** Auto-scroll with timeout protection
```typescript
private async autoScrollTranscript(page: Page) {
  // Scroll within transcript container until bottom reached
  // Include 10-second timeout to prevent infinite loops
}
```

### Issue: Detection by YouTube

**Solution:** Comprehensive stealth initialization
- Navigator proxy with webdriver=false
- Chrome runtime object mocking
- Permission query interception
- Random human-like delays

---

## Dependencies Management

### Backend Critical Dependencies

```json
{
  "express": "^4.18.2",       // Web framework
  "playwright": "^1.40.0",    // Headless browser
  "winston": "^3.11.0",       // Logging
  "helmet": "^7.1.0",         // Security headers
  "express-rate-limit": "^7.1.5",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "swagger-ui-express": "^5.0.0"
}
```

### Frontend Critical Dependencies

```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "axios": "^1.6.2",
  "vite": "^5.0.8"
}
```

**Update Policy:**
- Security patches: immediate update
- Minor versions: review changelog, test thoroughly
- Major versions: requires architecture review
- Playwright updates: validate stealth techniques still work

---

## Future Roadmap Considerations

When extending this project, maintain these principles:

**Potential Features:**
- Multiple language support for transcripts
- Transcript translation service integration
- Batch processing endpoint for multiple videos
- WebSocket streaming for real-time extraction updates
- Caching layer (Redis) for frequently accessed transcripts

**Architecture Preservation:**
- Keep domain logic pure and testable
- Add new use cases in application layer
- Implement new services in infrastructure layer
- Maintain backward compatibility in API responses
- Document breaking changes in CHANGELOG.md

---

## Development Commands Reference

```bash
# API Development
npm run dev          # Hot reload development server
npm run build        # Compile TypeScript to dist/
npm start            # Run production build
npm test             # Run all tests
npm run lint         # ESLint validation

# Web Development
npm run dev          # Vite dev server with HMR
npm run build        # TypeScript compilation + Vite build
npm run preview      # Preview production build

# Docker Operations
docker build -t yt-transcript-api .
docker run -p 3000:3000 yt-transcript-api
docker-compose -f local-dev/docker-compose.dev.yml up

# Production Deployment
docker build -t yt-transcript:v1.0.0 .
docker push registry/yt-transcript:v1.0.0
kubectl apply -f k8s/deployment.yaml
```

---

## Changelog

| Date       | Version | Description                              |
|:-----------|:--------|:-----------------------------------------|
| 2025-11-15 | v1.0.0  | Initial project standards documentation  |

---

**Maintainer:** AI Whisperers
**License:** MIT
**Support:** https://github.com/Ai-Whisperers/yt-transcript-headless/issues
