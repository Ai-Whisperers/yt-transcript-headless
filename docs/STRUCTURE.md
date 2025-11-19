# Project Structure Reference
Doc-Type: Technical Reference · Version 1.0.0 · Updated 2025-11-19 · AI Whisperers

## Purpose

This document clarifies the project structure to prevent confusion about "duplicate" configurations. Each folder serves a distinct purpose.

## Root Directory Structure

```
simple-yt-transcript-extractor/
├── api/                      # Backend source code (Node.js + TypeScript)
├── web/                      # Frontend source code (React + TypeScript)
├── local-dev/                # Development bootstrap (Docker + scripts)
├── local/                    # Documentation and planning artifacts
├── k8s/                      # Kubernetes manifests (production)
├── scripts/                  # Utility scripts (stealth testing, etc.)
├── docs/                     # Project documentation (architecture, deployment, MCP, etc.)
├── Dockerfile                # Production multi-stage build
├── docker-compose.yml        # Production deployment
└── README.md                 # Main project documentation
```

## Folder Purposes

### `/api` - Backend Source
**Purpose:** All backend application code
**Contents:**
- `src/` - TypeScript source (domain, application, infrastructure layers)
- `tests/` - Jest unit and E2E tests
- `Dockerfile` - Multi-stage build with development target
- `package.json` - Backend dependencies and scripts

**Run commands:**
```bash
cd api
npm run dev      # Hot reload development
npm run build    # Compile TypeScript
npm start        # Run production build
npm test         # Run tests
```

### `/web` - Frontend Source
**Purpose:** All frontend application code
**Contents:**
- `src/` - React components and pages
- `services/` - API client
- `Dockerfile` - Multi-stage build with development target
- `package.json` - Frontend dependencies and scripts

**Run commands:**
```bash
cd web
npm run dev      # Vite dev server
npm run build    # Production build
npm test         # Run Vitest tests
```

### `/local-dev` - Development Bootstrap
**Purpose:** Bootstrap configurations for local development (Docker-based)
**NOT source code:** All scripts reference `../api` and `../web`

**Contents:**
- `docker-compose.dev.yml` - Development orchestration (hot-reload)
- `scripts/` - Start/stop/test scripts (Bash + Node.js test)
- `.env.*.template` - Environment variable templates

**Key principle:** Vendor-agnostic bootstrap only, no application code

**Run commands:**
```bash
cd local-dev
./scripts/start-all.sh       # Start with Docker
./scripts/start-native.sh    # Start without Docker
./scripts/stop-all.sh        # Stop Docker services
./scripts/test-all.sh        # Run all tests
node ./scripts/test-transcript.js  # Quick API test
```

### `/local` - Documentation & Planning
**Purpose:** Internal documentation, planning artifacts, and future features
**Contents:**
- `abstraction.md` / `abstraction-toon.md` - Architecture analysis
- `optimization.md` - Performance optimization notes
- `examples/` - Code examples and snippets
- `future-features/` - Feature planning
- `legacy/` - Archived old implementations

**Note:** This folder is gitignored and used for local notes/planning

### `/k8s` - Kubernetes Manifests
**Purpose:** Production Kubernetes deployment configurations
**Contents:**
- Deployment, Service, ConfigMap manifests
- Resource limits, health checks
- Production-ready orchestration

**Deploy commands:**
```bash
kubectl apply -f k8s/
kubectl get pods -n yt-transcript
```

### `/scripts` - Utility Scripts
**Purpose:** Project-wide utility scripts
**Contents:**
- `stealth-ab-test.ts` - Browser stealth testing
- Other automation utilities

**Run commands:**
```bash
cd api  # Scripts use api dependencies
npm run stealth-test
npm run stealth-test:quick
```

### `/docs` - Additional Documentation
**Purpose:** Supplementary documentation files
**Contents:**
- Architecture diagrams
- API design documents
- Deployment guides

## Docker Configurations Explained

### Why Multiple Docker Files?

**This is NOT duplication** - each serves a different deployment scenario:

| File | Purpose | Target Audience |
|------|---------|----------------|
| `Dockerfile` (root) | Production multi-stage build | CI/CD, production deployments |
| `docker-compose.yml` (root) | Production orchestration | Production servers, Kubernetes init |
| `local-dev/docker-compose.dev.yml` | Development with hot-reload | Local developers |
| `api/Dockerfile` | Individual API service build | Development, testing, multi-service |
| `web/Dockerfile` | Individual Web service build | Development, testing, multi-service |

### Production vs Development

**Production (root):**
- Multi-stage build: Frontend → Backend → Runtime
- Single optimized container with both API + Web static files
- Playwright browser included
- Health checks, security hardening
- Runs on port 3000

```bash
docker build -t yt-transcript:prod .
docker run -p 3000:3000 yt-transcript:prod
```

**Development (local-dev):**
- Separate API and Web containers
- Source mounted as read-only volumes
- Hot-reload enabled (tsx watch, Vite HMR)
- Debug-friendly (logs, dev dependencies)
- API: 3000, Web: 5173

```bash
cd local-dev
docker-compose -f docker-compose.dev.yml up
```

## Common Misconceptions

### ❌ "There are duplicate docker-compose files"
**Reality:** Root is for production, local-dev is for development with hot-reload.

### ❌ "Test scripts should be in root"
**Reality:** Node.js test scripts belong in `local-dev/scripts/` since we use Docker for development.

### ❌ "The /local folder is part of the app"
**Reality:** It's gitignored documentation for internal planning, not deployed code.

### ❌ "We should consolidate all Dockerfiles"
**Reality:** Multi-stage builds in individual services enable flexible deployment (monolith or microservices).

## Development Workflow

### Starting Development

```bash
# Option 1: Docker (recommended)
cd local-dev
./scripts/start-all.sh
# API: http://localhost:3000
# Web: http://localhost:5173

# Option 2: Native Node.js
cd local-dev
./scripts/start-native.sh
```

### Making Changes

1. Edit source in `api/src/` or `web/src/`
2. Changes auto-reload (Docker or native)
3. View logs in terminal
4. API docs: http://localhost:3000/api-docs

### Testing

```bash
cd local-dev

# Unit tests
./scripts/test-api.sh unit

# E2E tests
./scripts/test-api.sh e2e

# Integration tests
./scripts/test-integration.sh

# Quick API test (requires running API)
node ./scripts/test-transcript.js
```

### Production Build

```bash
# Build production image
docker build -t yt-transcript:v1.0.0 .

# Test production locally
docker run -p 3000:3000 yt-transcript:v1.0.0

# Deploy to production
docker push registry/yt-transcript:v1.0.0
kubectl apply -f k8s/
```

## File Cleanup Rules

### Should be in root:
- Production Dockerfile
- Production docker-compose.yml
- README.md, LICENSE, .gitignore
- Source folders (api/, web/)
- Deployment manifests (k8s/)

### Should be in local-dev/:
- Development docker-compose.yml
- Bootstrap scripts (start/stop/test)
- Development .env templates
- Node.js test scripts (test-transcript.js)

### Should NOT be in root:
- Log files (*.log) - gitignored
- Test scripts (*.js) - belongs in local-dev/scripts/
- node_modules/ - gitignored
- Build artifacts (dist/, build/) - gitignored

### Should be gitignored:
- local/ - Personal notes and planning
- .env files - Secrets
- *.log - Runtime logs
- node_modules/, dist/, build/ - Generated files

## Quick Reference

| Task | Command |
|------|---------|
| Start development (Docker) | `cd local-dev && ./scripts/start-all.sh` |
| Start development (Native) | `cd local-dev && ./scripts/start-native.sh` |
| Stop development | `cd local-dev && ./scripts/stop-all.sh` |
| Run all tests | `cd local-dev && ./scripts/test-all.sh` |
| Quick API test | `cd local-dev && node ./scripts/test-transcript.js` |
| Build production | `docker build -t yt-transcript:prod .` |
| Deploy to K8s | `kubectl apply -f k8s/` |
| View API docs | http://localhost:3000/api-docs |

## Migration to New Platform

To deploy on a different platform (AWS, Azure, Vercel, etc.):

1. **Keep unchanged:** `api/`, `web/` folders (source code)
2. **Replace:** `local-dev/` with platform-specific bootstrap (e.g., `aws/`, `vercel/`)
3. **Update:** CI/CD to reference new deployment configs
4. **No code changes required** - Architecture is vendor-agnostic

## Related Documentation

- [Main README](../README.md) - Project overview
- [Documentation Index](README.md) - Complete documentation navigation
- [Local Development README](../local-dev/README.md) - Development bootstrap guide
- [API README](../api/README.md) - Backend documentation
- [Web README](../web/README.md) - Frontend documentation
- [Project Standards](../.claude/CLAUDE.md) - Coding standards and architecture principles

---

**Last Updated:** 2025-11-19
**Maintainer:** AI Whisperers
**Purpose:** Clarify project structure and prevent confusion about "duplicate" configurations
