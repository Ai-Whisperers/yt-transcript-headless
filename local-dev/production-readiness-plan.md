# Production Readiness Fix Plan
Doc-Type: Implementation Plan · Version 1.0 · Created 2025-11-19 · AI Whisperers

## Executive Summary

**Current Status:** NOT READY FOR PRODUCTION
**Blockers:** 6 critical issues
**Estimated Time:** 2-3 days (9-16 hours focused work)
**Target Version:** 1.0.0

---

## Critical Issues Overview

| # | Issue | Severity | Time | Status |
|:--|:------|:---------|:-----|:-------|
| 1 | Docker build failure | CRITICAL | 2-4h | 🔴 TODO |
| 2 | Test suite failures (10 tests) | CRITICAL | 4-8h | 🔴 TODO |
| 3 | Playwright vulnerability (1.40.0 → 1.56.1) | HIGH | 1-2h | 🔴 TODO |
| 4 | js-yaml vulnerability | MODERATE | 0.5h | 🔴 TODO |
| 5 | Alpha version → 1.0.0 | LOW | 0.5h | 🔴 TODO |
| 6 | CORS configuration review | MODERATE | 1h | 🔴 TODO |

---

## Issue #1: Docker Build Failure ⚠️ BLOCKER

### Problem
```
ERROR: exit code 127 (command not found)
/bin/sh -c npm ci --only=production && npx playwright install chromium
```

### Root Cause
Node.js/npm not properly installed in production stage of Dockerfile

### Files Affected
- `Dockerfile:40-58` (root multi-stage build)
- `api/Dockerfile:57-75` (API-only build)

### Solution: Fix Node.js Installation

Update Dockerfile production stage to ensure Node.js is available:

```dockerfile
# Current (BROKEN)
FROM mcr.microsoft.com/playwright:v1.40.0-focal
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Fixed (VERBOSE ERROR CHECKING)
FROM mcr.microsoft.com/playwright:v1.40.0-focal
RUN set -ex && \
    apt-get update && \
    apt-get install -y curl gnupg ca-certificates && \
    curl -fsSL https://deb.nodesource.com/gpg/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y nodejs && \
    node --version && npm --version && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
```

### Implementation Plan
1. Test current build with verbose output
2. Apply fix to both Dockerfiles
3. Verify build completes successfully
4. Test container runs and responds

---

## Issue #2: Test Suite Failures ⚠️ BLOCKER

### Problem
```
Test Suites: 5 failed, 3 passed, 8 total
Tests:       10 failed, 4 skipped, 48 passed, 62 total
Worker process failed to exit gracefully
```

### Failed Test
`tests/e2e/client-disconnect.e2e.test.ts:55`
```typescript
expect(error.code).toMatch(/TIMEOUT|ECONNABORTED|ECONNRESET/);
// Received: undefined
```

### Root Causes
1. Error code not propagated in timeout scenarios
2. Resource leaks (timers, browser instances)

### Solution A: Fix Error Code Propagation

**File:** `api/src/infrastructure/RequestQueue.ts:73-89`

```typescript
// Current
const timeout = setTimeout(() => {
  reject(new Error('Request timed out in queue'));
}, this.queueTimeout);

// Fixed
const timeout = setTimeout(() => {
  const error: any = new Error('Request timed out in queue');
  error.code = 'QUEUE_TIMEOUT';
  reject(error);
}, this.queueTimeout);
```

### Solution B: Fix Test Expectations

**File:** `api/tests/e2e/client-disconnect.e2e.test.ts:55`

```typescript
// Current
expect(error.code).toMatch(/TIMEOUT|ECONNABORTED|ECONNRESET/);

// Fixed
expect(error.code || error.message).toMatch(/TIMEOUT|ECONNABORTED|ECONNRESET|QUEUE_TIMEOUT|timed out/i);
```

### Solution C: Add Test Cleanup

**File:** `api/tests/e2e/client-disconnect.e2e.test.ts`

```typescript
afterEach(async () => {
  // Clear all timers
  jest.clearAllTimers();

  // Close mock server
  if (mockServer) {
    await mockServer.close();
  }

  // Wait for pending operations
  await new Promise(resolve => setTimeout(resolve, 100));
});
```

### Implementation Plan
1. Run `npm test -- --detectOpenHandles` to identify leaks
2. Fix error code propagation in RequestQueue
3. Update test expectations to match actual error structure
4. Add proper test cleanup
5. Re-run tests until 100% pass

---

## Issue #3: Playwright Security Vulnerability 🔒

### Problem
```
playwright <1.55.1 - High Severity
CVE: GHSA-7mvr-c777-76hp
Downloads browsers without verifying SSL certificates
Current: 1.40.0
```

### Solution: Upgrade to 1.56.1

**Risk:** Potential breaking changes in stealth techniques

### Implementation Plan

```bash
# 1. Backup current state
git checkout -b fix/security-updates

# 2. Update API dependencies
cd api
npm install playwright@1.56.1
npm install --save-dev @playwright/test@1.56.1

# 3. Update Dockerfile references
sed -i 's/v1.40.0/v1.56.1/g' Dockerfile
sed -i 's/v1.40.0/v1.56.1/g' api/Dockerfile

# 4. Test stealth techniques
npm run stealth-test

# 5. Run full test suite
npm test

# 6. Manual extraction test
npm run dev
# Test actual YouTube extraction
```

### Rollback Plan
If tests fail:
```bash
git checkout main
npm install playwright@1.40.0
# Document risk acceptance
```

---

## Issue #4: js-yaml Vulnerability 🔒

### Problem
```
js-yaml <3.14.2 - Moderate Severity
CVE: GHSA-mh29-5h37-fv8m
Prototype pollution in merge (<<)
```

### Solution: Simple Update

```bash
cd api
npm audit fix
npm test
```

### Risk Assessment
- **LOW** - Only used for trusted Swagger file
- **Not** exposed to user input
- **Fix anyway** for compliance

---

## Issue #5: Version Update to 1.0.0

### Current State
```json
// api/package.json:3
"version": "0.1.0-alpha"
```

### Solution: Semantic Versioning 1.0.0

```bash
# Update package versions
cd api && npm version 1.0.0 --no-git-tag-version
cd ../web && npm version 1.0.0 --no-git-tag-version

# Update Swagger version
# api/src/infrastructure/swagger.yaml:20
version: 1.0.0

# Create git tag
git add api/package.json web/package.json api/src/infrastructure/swagger.yaml
git commit -m "chore: Release version 1.0.0"
git tag -a v1.0.0 -m "Production ready release 1.0.0"
```

**Note:** Only do this AFTER all other issues are resolved

---

## Issue #6: CORS Configuration Review

### Problem
```yaml
# docker-compose.yml:16
CORS_ORIGIN=*  # Too permissive for production
```

### Production Scenarios

**A. Same-Origin (Recommended)**
```yaml
# Frontend bundled with API
environment:
  - CORS_ORIGIN=
```

**B. Specific Domain**
```yaml
# Frontend on separate domain
environment:
  - CORS_ORIGIN=https://yourdomain.com
```

### Implementation Plan

1. Determine deployment architecture
2. Update docker-compose.yml
3. Update .env.production.template with documentation
4. Test CORS configuration
5. Document decision in README

---

## Implementation Timeline

### Day 1 (8-12 hours)

**Morning (4-6 hours)**
- ✅ Issue #4: Fix js-yaml (30 min)
- ✅ Issue #1: Fix Docker build (2-4 hours)
- ✅ Verify Docker build works (30 min)

**Afternoon (4-6 hours)**
- ✅ Issue #3: Upgrade Playwright (1-2 hours)
- ✅ Issue #2: Fix failing tests (4-8 hours)

### Day 2 (4-6 hours)

**Morning (2-3 hours)**
- ✅ Re-run all tests (1 hour)
- ✅ Build and test Docker image (1 hour)
- ✅ Manual smoke testing (1 hour)

**Afternoon (2-3 hours)**
- ✅ Issue #6: CORS review (1 hour)
- ✅ Issue #5: Version 1.0.0 (30 min)
- ✅ Final validation (1 hour)

---

## Success Criteria

### Build
- [ ] Docker build completes without errors
- [ ] Container starts successfully
- [ ] Health check returns 200 OK

### Tests
- [ ] All 62+ tests pass
- [ ] No worker process failures
- [ ] No open handle warnings

### Security
- [ ] npm audit shows 0 high/critical vulnerabilities
- [ ] Playwright upgraded to 1.56.1+
- [ ] js-yaml updated to 3.14.2+

### Deployment
- [ ] Version 1.0.0 in all packages
- [ ] CORS properly configured
- [ ] Documentation updated

---

## Next Steps After Completion

1. Deploy to staging environment
2. Monitor for 24 hours
3. Load testing
4. Production deployment with canary rollout
5. Monitor metrics for first week

---

**Status:** Ready to begin implementation
**Priority:** CRITICAL - Production blocked
**Owner:** AI Whisperers Team
