# Bootstrap & Infrastructure Improvement Plan
Doc-Type: Planning Document · Version 1.0 · Updated 2025-11-15 · AI Whisperers

## Purpose

This document tracks identified gaps in the local development bootstrap process and production deployment infrastructure. It serves as a roadmap for ensuring all features are properly initialized, documented, and deployable.

---

## Executive Summary

**Review Date:** 2025-11-15
**Scope:** local-dev bootstrap, Docker configuration, Kubernetes readiness
**Status:** Multiple critical gaps identified requiring attention

**Overall Assessment:**
- ✅ Core development workflow functional (Docker + Native)
- ✅ Multi-stage Docker builds properly configured
- ❌ Missing environment templates block first-time setup
- ❌ No Kubernetes manifests despite "K8s-ready" claims
- ⚠️ New features undocumented in bootstrap layer

---

## Findings

### ✅ What's Working Well

**Docker Development Setup:**
- `api/Dockerfile` has proper development stage (stage 0) with Playwright
- `web/Dockerfile` has proper development stage (stage 0) with Vite
- `docker-compose.dev.yml` correctly references development targets
- Hot reload configured for both API and Web

**Scripts Infrastructure:**
- Comprehensive script coverage:
  - `start-all.sh` - Docker orchestration
  - `start-native.sh` - Native Node.js execution
  - `start-api.sh` / `start-web.sh` - Individual services
  - `stop-all.sh` - Cleanup
  - `test-all.sh` / `test-api.sh` / `test-integration.sh` - Testing
- Proper error handling and dependency checks
- PID tracking for native processes

**Production Docker Build (Root Dockerfile):**
- Multi-stage build with frontend-builder, backend-builder, production runtime
- Security: Non-root user (appuser) with audio/video groups
- Health check configured correctly (`/api/health`)
- Playwright Chromium installed in production
- swagger.yaml properly copied to dist/infrastructure

**Feature Coverage in Docker:**
All major API features are initialized:
- ✅ BrowserManager with stealth configuration
- ✅ TranscriptExtractor with retry logic (3 attempts, progressive delay)
- ✅ PlaylistExtractor for playlist transcription
- ✅ RequestQueue (3 concurrent, max 100 queued, 60s timeout)
- ✅ Logger with Winston (correlation IDs, structured logging)
- ✅ Error handling middleware (observability stack)
- ✅ Rate limiting (10 requests/min per IP)
- ✅ CORS & Helmet security
- ✅ Graceful shutdown handlers (SIGTERM/SIGINT)
- ✅ MCP protocol support (standalone + HTTP)

---

## Critical Gaps

### 1. Missing Environment Templates

**Issue:**
Bootstrap scripts and README reference `.env.*.template` files that don't exist.

**Impact:**
- First-time setup fails without proper environment configuration
- Users don't know what variables are available/required
- No guidance on development vs production settings

**Missing Files:**
```
local-dev/.env.api.template
local-dev/.env.web.template
local-dev/.env.test.template
```

**Required Variables (from code analysis):**

**API (.env.api.template):**
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Logging
LOG_LEVEL=info

# Security & CORS
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=10

# Browser Configuration
MAX_CONCURRENT_BROWSERS=5
TIMEOUT_MS=30000
ENABLE_STEALTH=true

# Request Queue (undocumented)
QUEUE_MAX_CONCURRENT=3
QUEUE_MAX_SIZE=100
QUEUE_TIMEOUT_MS=60000
```

**Web (.env.web.template):**
```env
# API Configuration
VITE_API_URL=http://localhost:3000
```

**Test (.env.test.template):**
```env
# Test Server
PORT=3001
NODE_ENV=test
LOG_LEVEL=error

# Test Data
TEST_VIDEO_URL=https://www.youtube.com/watch?v=dQw4w9WgXcQ
TEST_PLAYLIST_URL=https://www.youtube.com/playlist?list=PLtest
TEST_TIMEOUT=60000
```

**Priority:** 🔴 Critical (blocks first-time setup)

---

### 2. Missing Kubernetes Manifests

**Issue:**
README claims "Kubernetes-ready" and shows example K8s YAML, but no actual manifests exist.

**Impact:**
- Cannot deploy to Kubernetes without creating manifests from scratch
- Example in README is incomplete (missing ConfigMap, Secrets, Ingress)
- No resource limits/requests defined
- No autoscaling configuration

**Missing Directory & Files:**
```
k8s/
├── namespace.yaml           # Namespace isolation
├── configmap.yaml          # Non-sensitive configuration
├── secret.yaml             # Sensitive configuration (empty template)
├── deployment.yaml         # Pod deployment with resource limits
├── service.yaml            # ClusterIP service
├── ingress.yaml            # External access configuration
├── hpa.yaml                # Horizontal Pod Autoscaler
└── README.md               # K8s deployment guide
```

**Required Kubernetes Resources:**

**Deployment Considerations:**
- Replicas: 3 (default), scalable to 10
- Resource requests: 512Mi memory, 500m CPU
- Resource limits: 2Gi memory, 2000m CPU
- Liveness probe: `/api/health` every 30s
- Readiness probe: `/api/health` with 10s initial delay
- Environment variables from ConfigMap + Secrets
- Security context: runAsNonRoot, readOnlyRootFilesystem (where possible)

**Service Considerations:**
- Type: ClusterIP (internal) or LoadBalancer (external)
- Port: 3000 (container) → 80 (service)
- Target port: 3000

**Ingress Considerations:**
- TLS termination
- Path-based routing: `/api/*` → backend service
- CORS headers for frontend
- Rate limiting annotations (nginx ingress controller)

**HPA Considerations:**
- Min replicas: 3
- Max replicas: 10
- Target CPU utilization: 70%
- Target memory utilization: 80%
- Metrics server required

**Priority:** 🟠 High (required for production deployment)

---

### 3. Health Check Endpoint Mismatch

**Issue:**
`docker-compose.dev.yml` uses incorrect health check path.

**Current:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
```

**Should Be:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
```

**Impact:**
- Development containers fail health checks
- False negative health status in `docker ps`
- May cause restart loops in orchestration

**Location:** `local-dev/docker-compose.dev.yml:24`

**Priority:** 🟠 High (affects developer experience)

---

### 4. API Development Dockerfile Missing swagger.yaml

**Issue:**
Development stage doesn't copy `swagger.yaml`, causing Swagger UI to fail in dev containers.

**Current (api/Dockerfile:1-35):**
```dockerfile
# Stage 0: Development
FROM mcr.microsoft.com/playwright:v1.40.0-focal AS development
# ... other steps ...
COPY . .
# ❌ swagger.yaml is in .dockerignore or not explicitly copied
```

**Should Include:**
```dockerfile
# Ensure swagger.yaml is available for API docs
RUN mkdir -p src/infrastructure
COPY src/infrastructure/swagger.yaml ./src/infrastructure/swagger.yaml
```

**Impact:**
- Swagger UI at `/api-docs` returns 404 or error in development
- API documentation unavailable in Docker dev environment

**Location:** `api/Dockerfile` development stage (lines 1-35)

**Priority:** 🟡 Medium (degrades developer experience)

---

### 5. Undocumented Features in Bootstrap Layer

**Issue:**
New features exist in codebase but are not documented in `local-dev/README.md` or environment templates.

**Undocumented Features:**

**1. Request Queue System**
- **What:** Concurrency limiting with configurable queue size and timeout
- **Code:** `api/src/infrastructure/RequestQueue.ts`
- **Usage:** Wraps `/api/transcribe` and `/api/transcribe/playlist` endpoints
- **Configuration:** Hardcoded (3 concurrent, max 100 queued, 60s timeout)
- **Missing:** Environment variables for tuning, documentation in README

**2. Metrics Endpoint**
- **What:** Observability endpoint exposing request metrics and queue stats
- **Code:** `api/src/infrastructure/routes.ts:58-76`
- **Endpoint:** `GET /api/metrics`
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "totalRequests": 123,
      "successfulRequests": 120,
      "failedRequests": 3,
      "averageResponseTime": 1234.56,
      "queueStats": {
        "size": 5,
        "active": 3,
        "completed": 100,
        "failed": 2
      },
      "timestamp": "2025-11-15T12:00:00Z",
      "correlationId": "abc-123"
    }
  }
  ```
- **Missing:** Documentation in README, Swagger spec

**3. Playlist Transcription**
- **What:** Extract transcripts from all videos in a YouTube playlist
- **Code:** `api/src/application/TranscribePlaylistUseCase.ts`
- **Endpoint:** `POST /api/transcribe/playlist`
- **Request:**
  ```json
  {
    "url": "https://www.youtube.com/playlist?list=PLxxx",
    "format": "json",
    "maxVideos": 100
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "playlistUrl": "...",
      "processedVideos": 10,
      "transcripts": [{ "videoUrl": "...", "transcript": [...] }],
      "extractedAt": "2025-11-15T12:00:00Z"
    }
  }
  ```
- **Missing:** Documentation in README, Swagger spec, local-dev examples

**4. MCP HTTP Endpoint**
- **What:** Model Context Protocol HTTP integration (currently disabled)
- **Code:** `api/src/mcp/express-mcp-handler.ts`
- **Endpoint:** `POST /api/mcp` (commented out in routes.ts:299-309)
- **Status:** Temporarily disabled pending handler fixes
- **Missing:** Documentation, re-enabling plan, integration tests

**5. AbortController Client Disconnect Handling**
- **What:** Gracefully abort extraction when client disconnects
- **Code:** `api/src/infrastructure/routes.ts:109-118`
- **Behavior:** Listens to `req.on('close')` and aborts browser operation
- **Impact:** Prevents zombie browser processes
- **Missing:** Documentation, metrics tracking for aborted requests

**Priority:** 🟡 Medium (affects documentation completeness)

---

### 6. Swagger Specification Gaps

**Issue:**
OpenAPI spec doesn't cover all endpoints and new features.

**Missing from swagger.yaml:**
- `GET /api/metrics` endpoint
- `POST /api/transcribe/playlist` endpoint
- Error response schemas for new error codes:
  - `QUEUE_FULL` (503)
  - `QUEUE_TIMEOUT` (504)
- Request queue statistics in responses
- Correlation ID in all responses

**Location:** `api/src/infrastructure/swagger.yaml`

**Priority:** 🟡 Medium (affects API documentation)

---

## Improvement Plan

### Phase 1: Critical Fixes (Immediate)

**Goal:** Unblock first-time setup and fix broken features

**Tasks:**
1. ✅ **Create .env.api.template**
   - Include all environment variables from code analysis
   - Document purpose of each variable
   - Provide sensible defaults for development

2. ✅ **Create .env.web.template**
   - API URL configuration
   - Development-friendly defaults

3. ✅ **Create .env.test.template**
   - Test-specific configuration
   - Sample YouTube URLs for testing

4. ✅ **Fix health check in docker-compose.dev.yml**
   - Change `/health` to `/api/health` (line 24)

5. ✅ **Fix swagger.yaml in API development Dockerfile**
   - Explicitly copy swagger.yaml in development stage
   - Ensure API docs work in Docker dev environment

**Acceptance Criteria:**
- New users can run `./scripts/start-all.sh` without manual env file creation
- Health checks pass in development containers
- Swagger UI accessible at `http://localhost:3000/api-docs` in Docker dev

**Estimated Effort:** 2 hours

---

### Phase 2: Kubernetes Deployment (High Priority)

**Goal:** Enable production deployment to Kubernetes clusters

**Tasks:**
1. ✅ **Create k8s/ directory structure**

2. ✅ **Create namespace.yaml**
   - Namespace: `yt-transcript`
   - Resource quotas and limits

3. ✅ **Create configmap.yaml**
   - Non-sensitive configuration:
     - `PORT=3000`
     - `LOG_LEVEL=info`
     - `ENABLE_STEALTH=true`
     - Queue configuration
     - Rate limiting settings

4. ✅ **Create secret.yaml (template)**
   - Sensitive configuration placeholders:
     - `CORS_ORIGIN` (if restricted)
     - Future API keys
   - Instructions for populating secrets

5. ✅ **Create deployment.yaml**
   - 3 replicas (default)
   - Resource requests: 512Mi / 500m CPU
   - Resource limits: 2Gi / 2000m CPU
   - Liveness probe: `/api/health` every 30s
   - Readiness probe: `/api/health` with 10s delay
   - Environment from ConfigMap + Secrets
   - Security context: runAsNonRoot

6. ✅ **Create service.yaml**
   - ClusterIP service
   - Port 80 → 3000
   - Selector: app=yt-transcript-api

7. ✅ **Create ingress.yaml**
   - TLS termination (cert-manager integration)
   - Path routing: `/api/*`
   - Rate limiting annotations
   - CORS headers

8. ✅ **Create hpa.yaml**
   - Min: 3 replicas
   - Max: 10 replicas
   - Target CPU: 70%
   - Target Memory: 80%

9. ✅ **Create k8s/README.md**
   - Deployment guide
   - Prerequisites (metrics-server, cert-manager)
   - kubectl commands for deployment
   - Troubleshooting section

**Acceptance Criteria:**
- Deploy to K8s with single command: `kubectl apply -k k8s/`
- Pods pass health checks and enter Ready state
- HPA scales based on load
- Ingress routes traffic correctly
- All environment variables propagate from ConfigMap/Secrets

**Estimated Effort:** 6 hours

---

### Phase 3: Documentation & Feature Coverage (Medium Priority)

**Goal:** Document all features in bootstrap and API layers

**Tasks:**
1. ✅ **Update local-dev/README.md**
   - Add Request Queue section (configuration, behavior)
   - Document `/api/metrics` endpoint
   - Document `/api/transcribe/playlist` endpoint
   - Add MCP integration status and roadmap
   - Add AbortController behavior explanation

2. ✅ **Update api/src/infrastructure/swagger.yaml**
   - Add `/api/metrics` endpoint spec
   - Add `/api/transcribe/playlist` endpoint spec
   - Add new error codes: QUEUE_FULL, QUEUE_TIMEOUT
   - Document correlation ID in all responses
   - Document queue statistics in responses

3. ✅ **Update root README.md**
   - Add metrics endpoint to API documentation section
   - Add playlist transcription to features list
   - Document request queue behavior
   - Add client disconnect handling to advanced features

4. ✅ **Create DEPLOYMENT.md** (new file in root)
   - Kubernetes deployment guide
   - Docker production deployment guide
   - Environment variable reference (complete)
   - Monitoring & observability setup
   - Scaling considerations

**Acceptance Criteria:**
- All endpoints documented in Swagger UI
- README accurately reflects all features
- Deployment guide covers multiple platforms
- No feature exists without documentation

**Estimated Effort:** 4 hours

---

### Phase 4: Environment Variable Consistency (Low Priority)

**Goal:** Make queue configuration tunable via environment variables

**Tasks:**
1. ✅ **Add environment variables for RequestQueue**
   - `QUEUE_MAX_CONCURRENT` (default: 3)
   - `QUEUE_MAX_SIZE` (default: 100)
   - `QUEUE_TIMEOUT_MS` (default: 60000)

2. ✅ **Update RequestQueue initialization in routes.ts**
   - Read from environment variables
   - Fall back to sensible defaults
   - Log configuration on startup

3. ✅ **Update .env.api.template**
   - Add queue configuration variables
   - Document purpose and impact

4. ✅ **Update ConfigMap for K8s**
   - Include queue configuration
   - Document tuning guidelines

**Acceptance Criteria:**
- Queue behavior tunable without code changes
- Environment variables documented in templates
- K8s ConfigMap includes queue settings
- Logger outputs queue config on startup

**Estimated Effort:** 2 hours

---

### Phase 5: MCP Integration Completion (Future)

**Goal:** Re-enable and document MCP HTTP endpoint

**Tasks:**
1. ⏸️ **Fix MCP handler issues**
   - Debug current implementation
   - Fix integration with Express middleware
   - Ensure correlation IDs propagate

2. ⏸️ **Re-enable /api/mcp endpoint**
   - Uncomment in routes.ts
   - Add comprehensive error handling
   - Add request/response logging

3. ⏸️ **Update Swagger spec**
   - Document MCP endpoint
   - Document MCP protocol schema
   - Provide example requests

4. ⏸️ **Create MCP integration tests**
   - Test all MCP tools (extract_transcript, validate_url, batch_extract)
   - Test error handling
   - Test with real MCP clients

5. ⏸️ **Document MCP usage**
   - Update README with MCP HTTP endpoint
   - Create examples for AI agent integration
   - Document vs standalone MCP server

**Acceptance Criteria:**
- MCP HTTP endpoint functional and tested
- Documentation covers both standalone and HTTP modes
- Integration tests pass
- Example MCP client configuration provided

**Estimated Effort:** 6 hours

**Status:** Blocked pending MCP handler debugging

---

### Phase 6: Monitoring & Observability Stack (Future)

**Goal:** Production-grade monitoring and alerting

**Tasks:**
1. ⏸️ **Create Prometheus configuration**
   - Scrape `/api/metrics` endpoint
   - Custom metrics for queue stats
   - Recording rules for SLIs

2. ⏸️ **Create Grafana dashboards**
   - Request rate, error rate, duration
   - Queue size, active requests
   - Browser instance tracking
   - Memory/CPU utilization

3. ⏸️ **Configure alerts**
   - Queue full threshold (>90%)
   - Error rate threshold (>5%)
   - Response time threshold (>10s p95)
   - Browser crash detection

4. ⏸️ **Add OpenTelemetry tracing**
   - Distributed tracing across services
   - Browser operation spans
   - Database query spans (if applicable)

5. ⏸️ **Update K8s manifests**
   - Prometheus ServiceMonitor CRD
   - Grafana dashboard ConfigMaps
   - Alert rules

**Acceptance Criteria:**
- Prometheus collects metrics from all pods
- Grafana dashboards visualize key metrics
- Alerts fire on threshold violations
- Traces available in Jaeger/Tempo

**Estimated Effort:** 8 hours

**Status:** Future enhancement

---

## Risk Assessment

### High Risk Items

**1. Missing Environment Templates**
- **Risk:** New developers cannot set up project
- **Mitigation:** Create templates immediately (Phase 1)
- **Likelihood:** 100% (already affecting users)

**2. Incorrect Health Check Path**
- **Risk:** Containers fail health checks, restart loops
- **Mitigation:** One-line fix in docker-compose.dev.yml
- **Likelihood:** 100% (affects all Docker dev users)

**3. No Kubernetes Manifests**
- **Risk:** Cannot deploy to production K8s
- **Mitigation:** Create comprehensive K8s manifests (Phase 2)
- **Likelihood:** 100% if attempting K8s deployment

### Medium Risk Items

**4. Undocumented Features**
- **Risk:** Users unaware of advanced capabilities
- **Mitigation:** Comprehensive documentation update (Phase 3)
- **Likelihood:** 80% (confuses advanced users)

**5. Hardcoded Queue Configuration**
- **Risk:** Cannot tune for different workloads
- **Mitigation:** Environment variable support (Phase 4)
- **Likelihood:** 60% (becomes issue at scale)

### Low Risk Items

**6. Missing Swagger Specs**
- **Risk:** API documentation incomplete
- **Mitigation:** Update OpenAPI spec (Phase 3)
- **Likelihood:** 40% (users can still read code)

**7. MCP Endpoint Disabled**
- **Risk:** Advertised feature not functional
- **Mitigation:** Debug and re-enable (Phase 5)
- **Likelihood:** 30% (only affects AI agent users)

---

## Success Metrics

### Phase 1 (Critical Fixes)
- ✅ New developer setup time: <5 minutes
- ✅ Docker dev environment: 100% health check pass rate
- ✅ Swagger UI accessible: 100% uptime

### Phase 2 (Kubernetes)
- ✅ K8s deployment time: <2 minutes (after prerequisites)
- ✅ Pod Ready state: <30 seconds after deployment
- ✅ HPA scaling response time: <60 seconds

### Phase 3 (Documentation)
- ✅ Documentation coverage: 100% of endpoints
- ✅ Swagger spec completeness: All endpoints + schemas
- ✅ User questions about features: 50% reduction

### Phase 4 (Configuration)
- ✅ Queue tuning flexibility: 0 code changes required
- ✅ Configuration validation: 100% on startup

### Phase 5 (MCP)
- ✅ MCP endpoint uptime: >99.9%
- ✅ MCP test coverage: >80%

### Phase 6 (Observability)
- ✅ Metrics collection: 100% of pods
- ✅ Alert accuracy: <5% false positives
- ✅ Trace sampling: 1% of requests

---

## Implementation Priority

**Immediate (This Week):**
1. Create .env templates (2h)
2. Fix health check path (15min)
3. Fix swagger.yaml copy (15min)

**High Priority (Next Week):**
4. Create Kubernetes manifests (6h)
5. Update documentation (4h)

**Medium Priority (Next 2 Weeks):**
6. Environment variable support for queue (2h)
7. Update Swagger specs (2h)

**Future (Backlog):**
8. MCP endpoint re-enablement (6h)
9. Observability stack (8h)

---

## Notes & Considerations

### Design Decisions

**1. Environment Templates vs Defaults**
- **Decision:** Use .env templates with documented defaults
- **Rationale:** Explicit configuration reduces magic, easier debugging
- **Trade-off:** Requires one-time setup vs zero-config

**2. Kubernetes Resource Limits**
- **Decision:** Conservative defaults (512Mi/500m CPU requests)
- **Rationale:** Prevent resource contention, predictable scheduling
- **Trade-off:** May under-utilize nodes vs risk OOM kills

**3. Request Queue Configuration**
- **Decision:** Make queue tunable via environment variables
- **Rationale:** Workload varies (single tenant vs multi-tenant)
- **Trade-off:** More configuration surface vs operational flexibility

### Open Questions

1. **Should we provide Helm charts in addition to raw K8s manifests?**
   - Pros: Easier parameterization, environment management
   - Cons: Additional complexity, another tool to learn
   - Recommendation: Start with raw manifests, add Helm if needed

2. **Should RequestQueue limits be per-instance or cluster-wide?**
   - Current: Per-instance (each pod has own queue)
   - Alternative: Shared queue (Redis-backed)
   - Recommendation: Keep per-instance for simplicity, revisit if needed

3. **Should MCP HTTP endpoint be re-enabled before comprehensive testing?**
   - Current: Disabled pending fixes
   - Risk: Advertised feature doesn't work
   - Recommendation: Fix and test thoroughly before re-enabling

4. **Should we add a monitoring stack to local-dev?**
   - Pros: Easier development of metrics/alerts
   - Cons: Heavier local resource usage
   - Recommendation: Optional docker-compose.monitoring.yml

---

## Change Log

| Date       | Version | Description                                      |
|:-----------|:--------|:-------------------------------------------------|
| 2025-11-15 | v1.0.0  | Initial bootstrap review and improvement plan    |

---

**Next Review:** 2025-12-01 (after Phase 1 & 2 completion)
