# Local Development Bootstrap
Doc-Type: Technical Guide · Version 1.0 · Updated 2025-11-14 · AI Whisperers

## Purpose

This folder contains **bootstrap configurations only**. No source code or dependencies live here. All actual code resides in:
- `../api/` - Backend source code
- `../web/` - Frontend source code
- `../tests/` - Test suites

This separation enables vendor-agnostic deployment and clean separation of concerns.

## Quick Start

### Option 1: Docker (Recommended)
```bash
# Start all services
./scripts/start-all.sh

# Stop all services
./scripts/stop-all.sh
```

**Services available at:**
- API: http://localhost:3000
- API Documentation: http://localhost:3000/api-docs (Swagger UI)
- Web: http://localhost:5173

### Option 2: Native Development
```bash
# Start all services natively (no Docker)
./scripts/start-native.sh

# Or start individual services
./scripts/start-api.sh    # API only
./scripts/start-web.sh    # Web only
```

### Option 3: Testing
```bash
# Run all tests (unit + E2E + integration)
./scripts/test-all.sh

# Run specific test types
./scripts/test-api.sh unit           # Unit tests only
./scripts/test-api.sh e2e            # E2E tests only
./scripts/test-integration.sh        # Integration tests only
```

## Configuration

### First-Time Setup
1. Copy environment templates:
   ```bash
   cp .env.api.template .env.api
   cp .env.web.template .env.web
   ```

2. Customize environment variables in `.env.api` and `.env.web`

3. For Docker: Ensure Docker daemon is running
   For Native: Ensure Node.js v20+ is installed

### Environment Variables

**API (.env.api)**
- `PORT` - API server port (default: 3000)
- `CORS_ORIGIN` - Web client origin (default: http://localhost:5173)
- `PLAYWRIGHT_HEADLESS` - Run browser headlessly (default: true)
- `LOG_LEVEL` - Logging verbosity (debug, info, warn, error)

**Web (.env.web)**
- `VITE_API_URL` - Backend API endpoint (default: http://localhost:3000)

**Testing (.env.test)**
- `PORT` - Test server port (default: 3001)
- `TEST_VIDEO_URL` - YouTube video URL for testing
- `TEST_TIMEOUT` - Test timeout in milliseconds

## Architecture

```
local-dev/
├── docker-compose.dev.yml    # Orchestration config
├── scripts/                  # Bootstrap scripts
│   ├── start-all.sh         # Start with Docker
│   ├── start-native.sh      # Start without Docker
│   ├── start-api.sh         # API only (native)
│   ├── start-web.sh         # Web only (native)
│   ├── stop-all.sh          # Stop Docker services
│   ├── test-all.sh          # Run complete test suite
│   ├── test-api.sh          # Run API tests (unit/e2e)
│   └── test-integration.sh  # Run integration tests
├── .env.api.template        # API config template
├── .env.web.template        # Web config template
├── .env.test.template       # Test config template
└── README.md                # This file
```

### Key Principles
1. **Bootstrap only** - No source code or dependencies
2. **Vendor agnostic** - Easy migration between hosting platforms
3. **Source referenced** - All code runs from `../api` and `../web`
4. **Clean separation** - Development setup isolated from production config

## Docker Details

The `docker-compose.dev.yml` mounts source directories as read-only volumes:
- API source → `/app/src`
- Web source → `/app/src`, `/app/components`, `/app/pages`, `/app/services`

This enables hot-reloading while preventing accidental modification through containers.

## Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i :3000  # API
lsof -i :5173  # Web

# Kill the process
kill -9 <PID>
```

### Docker Issues
```bash
# Clean rebuild
cd local-dev
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up --build
```

### Native Dependency Issues
```bash
# Clean install API dependencies
cd ../api
rm -rf node_modules package-lock.json
npm install

# Clean install Web dependencies
cd ../web
rm -rf node_modules package-lock.json
npm install
```

## Development Workflow

1. **Start services** - Use one of the quick start methods
2. **View API docs** - Navigate to http://localhost:3000/api-docs for interactive Swagger UI
3. **Make changes** - Edit source in `../api` or `../web`
4. **Hot reload** - Changes auto-reload (both Docker and native)
5. **Run tests** - Execute `./scripts/test-all.sh` or specific test types
6. **Stop services** - Ctrl+C (native) or `./scripts/stop-all.sh` (Docker)

## API Documentation

The API includes interactive Swagger UI documentation available at:
- **Development:** http://localhost:3000/api-docs

**Features:**
- Interactive API testing
- Request/response schemas
- OpenAPI 3.0 specification
- Example requests and responses

**Endpoints:**
- `GET /api/health` - Health check
- `POST /api/transcribe` - Extract YouTube transcript
- `GET /api/formats` - Get supported output formats

## Testing

The testing infrastructure is centralized in `local-dev/scripts/`:

**Test Types:**
1. **Unit Tests** - Test individual components in isolation
2. **E2E Tests** - Test complete workflows
3. **Integration Tests** - Test API with real YouTube videos

**Running Tests:**
```bash
# Complete test suite
./scripts/test-all.sh

# Individual test types
./scripts/test-api.sh unit
./scripts/test-api.sh e2e
./scripts/test-integration.sh
```

**Test Configuration:**
- Tests run against source code in `../api`
- Test environment configured via `.env.test`
- Integration tests automatically start/stop services

## Migration Guide

To deploy to a new platform:
1. Keep `../api` and `../web` as-is
2. Replace `local-dev/` with platform-specific config (e.g., `k8s/`, `aws/`, `vercel/`)
3. Update CI/CD to reference new deployment config
4. No changes to source code required

## Related Documentation

- [API Documentation](../api/README.md)
- [Web Documentation](../web/README.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Main README](../README.md)
