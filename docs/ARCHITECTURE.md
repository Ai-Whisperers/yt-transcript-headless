# Architecture Documentation

**Doc-Type:** Architecture Guide · Version 1.0.0 · Updated 2025-11-14 · AI Whisperers

## Overview

Hexagonal architecture implementation with clear separation between business logic and infrastructure.

## Layers

### Domain Layer
Location: `api/src/domain/`

**Entities:**
- `TranscriptSegment`: Core transcript data model
- `TranscriptFormat`: Supported output formats
- `TranscriptRequest/Response`: API contracts

**Characteristics:**
- No external dependencies
- Pure business models
- Framework agnostic

### Application Layer
Location: `api/src/application/`

**Use Cases:**
- `TranscribeVideoUseCase`: Orchestrates transcript extraction

**Responsibilities:**
- Business logic coordination
- Input validation
- Output formatting
- Error handling

### Infrastructure Layer
Location: `api/src/infrastructure/`

**Adapters:**
- `BrowserManager`: Playwright browser lifecycle
- `TranscriptExtractor`: YouTube DOM interaction
- `Logger`: Winston logging adapter
- `routes`: Express HTTP adapter

**External Dependencies:**
- Playwright for browser automation
- Express for HTTP server
- Winston for logging

## Data Flow

```
Request → Routes → UseCase → Extractor → Browser → YouTube
                      ↓
Response ← Routes ← UseCase ← TranscriptSegments
```

## Key Design Decisions

### Dependency Injection
Use cases receive infrastructure services via constructor injection.

### Retry Logic
Extraction attempts up to 3 times with progressive delays.

### Resource Management
Browser contexts closed after each extraction to prevent memory leaks.

### Stealth Techniques
- Navigator property spoofing
- Realistic user agents
- Human-like delays
- Resource blocking

## Service Components

### BrowserManager
- Singleton browser instance
- Stealth configuration
- Context creation per request

### TranscriptExtractor
- Multiple selector strategies
- Fallback extraction methods
- Auto-scroll implementation

### Logger
- Environment-based configuration
- Structured logging
- File output in production

## Error Handling

Hierarchical error handling:
1. Domain validation errors
2. Infrastructure failures
3. Network timeouts
4. Unexpected exceptions

## Security Considerations

- Input validation at use case level
- Rate limiting at route level
- CORS configuration
- Helmet.js protection
- No credential storage