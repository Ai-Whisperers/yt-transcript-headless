# Test Implementation Plan
Doc-Type: Implementation Plan · Version 1.0 · Created 2025-11-19 · AI Whisperers

## Executive Summary

**Current Status:** INCOMPLETE - 5 of 8 test suites failing, significant coverage gaps
**Test Results:** 14 failed, 4 skipped, 44 passed (62 total tests)
**Pass Rate:** 71% (44/62 passed tests)
**Time:** 140.4 seconds

---

## Test Suite Status

### Passing Tests (3 suites, 44 tests)

| Test Suite | Status | Tests | Notes |
|:-----------|:-------|:------|:------|
| unit/request-queue.test.ts | ✅ PASS | Multiple | Queue management working correctly |
| unit/url-validation.test.ts | ✅ PASS | Multiple | URL validation logic solid |
| unit/playlist-extraction.test.ts | ✅ PASS | Multiple | Playlist extraction tested |

### Failing Tests (5 suites, 14 tests)

| Test Suite | Status | Duration | Primary Issue |
|:-----------|:-------|:---------|:-------------|
| e2e/browser-lifecycle.e2e.test.ts | ❌ FAIL | - | Port 9997 EADDRINUSE conflict |
| e2e/concurrency.e2e.test.ts | ❌ FAIL | 106.57s | Timeout issues, mock server problems |
| e2e/client-disconnect.e2e.test.ts | ❌ FAIL | 22.75s | Client disconnect scenarios failing |
| unit/browser-lifecycle.test.ts | ❌ FAIL | - | Browser lifecycle unit tests broken |
| e2e/full-stack.playwright.test.ts | ❌ FAIL | - | Full stack integration failing |

### Critical Issues Identified

**Issue #1: Port Conflicts (browser-lifecycle.e2e.test.ts)**
```
Error: listen EADDRINUSE: address already in use :::9997
Location: tests/helpers/MockYouTubeServer.ts:104
```
- **Root Cause:** Mock server not properly cleaning up between tests
- **Impact:** All 8 tests in browser-lifecycle.e2e.test.ts fail immediately
- **Fix:** Implement proper beforeEach/afterEach cleanup with unique ports per test

**Issue #2: Transcript Panel Timeout (concurrency.e2e.test.ts)**
```
Error: page.waitForSelector: Timeout 10000ms exceeded
Selector: 'ytd-transcript-segment-list-renderer, ytd-transcript-renderer'
```
- **Root Cause:** Mock YouTube server not rendering expected transcript DOM
- **Impact:** Tests wait 10s then fail, causing slow suite execution
- **Fix:** Update MockYouTubeServer to include proper transcript panel HTML

**Issue #3: Jest Hanging After Completion**
```
Jest did not exit one second after the test run has completed.
This usually means that there are asynchronous operations that weren't stopped in your tests.
```
- **Root Cause:** Browser instances or timers not cleaned up
- **Impact:** Test suite hangs after completion
- **Fix:** Run `jest --detectOpenHandles` and add proper cleanup in afterEach hooks

---

## Coverage Gap Analysis

### Source Files vs Test Coverage

**Total Source Files:** 23 TypeScript files
**Files with Tests:** ~8 files (35% coverage estimate)
**Files Missing Tests:** ~15 files (65% gap)

### Missing Unit Tests

| Category | File | Priority | Rationale |
|:---------|:-----|:---------|:----------|
| **Domain Errors** | errors/AppError.ts | HIGH | Core error handling logic, should be 100% covered |
| | errors/OperationalError.ts | HIGH | Custom error classes need validation |
| | errors/ValidationError.ts | HIGH | Validation error scenarios must be tested |
| **Application** | TranscribeVideoUseCase.ts | MEDIUM | Covered indirectly in e2e, needs unit tests |
| | TranscribePlaylistUseCase.ts | HIGH | No test coverage at all, critical feature |
| **Infrastructure** | Logger.ts | MEDIUM | Logging logic should be testable |
| | TranscriptExtractor.ts | HIGH | Core extraction logic needs direct tests |
| | PlaylistExtractor.ts | MEDIUM | Partially covered, needs more edge cases |
| | middleware/errorHandler.ts | HIGH | Error middleware critical for API responses |
| | middleware/observability.ts | MEDIUM | Metrics and tracing logic |
| | utils/async-helpers.ts | LOW | Simple wait() function, low priority |
| | utils/error-handlers.ts | MEDIUM | Queue error response formatting |
| **MCP** | mcp-server.ts | LOW | MCP integration, can defer |
| | express-mcp-handler.ts | LOW | MCP HTTP handler, can defer |

### Missing E2E Test Scenarios

| Scenario | Priority | Description |
|:---------|:---------|:------------|
| Rate limiting | HIGH | Test rate limit enforcement (10 req/min) |
| CORS validation | MEDIUM | Test CORS headers with different origins |
| Health check endpoint | HIGH | Test /api/health response format |
| Metrics endpoint | MEDIUM | Test /api/metrics returns correct stats |
| Format conversion | HIGH | Test JSON → SRT → Text format conversions |
| Playlist edge cases | HIGH | Empty playlists, invalid playlist URLs |
| Browser crash recovery | MEDIUM | Test behavior when browser crashes mid-extraction |
| Queue full scenario | HIGH | Test 503 response when queue at capacity |
| Concurrent requests | HIGH | Fix existing concurrency.e2e.test.ts |

---

## Implementation Plan

### Phase 1: Fix Existing Failing Tests (Priority 1)

**Goal:** Get all existing 8 test suites passing
**Estimated Time:** 4-6 hours

#### Task 1.1: Fix Port Conflicts (browser-lifecycle.e2e.test.ts)
```typescript
// Solution: Use dynamic port allocation
let dynamicPort = 9997;

beforeEach(async () => {
  dynamicPort = await getNextAvailablePort(dynamicPort);
  mockServer = new MockYouTubeServer(dynamicPort);
  await mockServer.start();
});

afterEach(async () => {
  if (mockServer) {
    await mockServer.stop();
    mockServer = null;
  }
});
```

**Files to Modify:**
- `tests/e2e/browser-lifecycle.e2e.test.ts`
- `tests/helpers/MockYouTubeServer.ts` (add proper cleanup)

#### Task 1.2: Fix Mock Server Transcript Rendering
```typescript
// Solution: Add transcript panel HTML to mock server response
app.get('/watch', (req, res) => {
  res.send(`
    <html>
      <body>
        <button aria-label="Show transcript">Show transcript</button>
        <ytd-transcript-segment-list-renderer>
          <div class="segment" data-start="0">Hello world</div>
          <div class="segment" data-start="5">Test transcript</div>
        </ytd-transcript-segment-list-renderer>
      </body>
    </html>
  `);
});
```

**Files to Modify:**
- `tests/helpers/MockYouTubeServer.ts` (update HTML template)

#### Task 1.3: Add Proper Test Cleanup
```bash
# Run to identify open handles
cd api && npm test -- --detectOpenHandles

# Add cleanup to all e2e tests
afterEach(async () => {
  jest.clearAllTimers();
  if (mockServer) await mockServer.stop();
  if (testServer) await testServer.close();
  await new Promise(resolve => setTimeout(resolve, 100)); // Wait for cleanup
});
```

**Files to Modify:**
- `tests/e2e/concurrency.e2e.test.ts`
- `tests/e2e/client-disconnect.e2e.test.ts`
- `tests/e2e/full-stack.playwright.test.ts`
- `tests/unit/browser-lifecycle.test.ts`

### Phase 2: Add Missing Unit Tests (Priority 2)

**Goal:** Achieve >80% unit test coverage
**Estimated Time:** 6-8 hours

#### Task 2.1: Domain Error Tests
**File:** `tests/unit/domain-errors.test.ts` (NEW)

**Test Cases:**
- AppError constructor with all parameters
- AppError serialization to ErrorResponse
- OperationalError vs programmer error classification
- InvalidUrlError with URL context
- ExtractionFailedError with retry context
- PlaylistError with playlist URL
- ValidationError with field details
- Error code constants (INVALID_URL, EXTRACTION_FAILED, etc.)

#### Task 2.2: TranscribePlaylistUseCase Tests
**File:** `tests/unit/transcribe-playlist-use-case.test.ts` (NEW)

**Test Cases:**
- Extract playlist with valid playlist URL
- Handle invalid playlist URL
- Handle empty playlist (0 videos)
- Handle single video playlist
- Handle large playlist (>20 videos)
- Concurrent video extraction within playlist
- Partial failure (some videos fail, others succeed)
- Error aggregation in playlist results

#### Task 2.3: Logger Tests
**File:** `tests/unit/logger.test.ts` (NEW)

**Test Cases:**
- Winston initialization with correct config
- Log levels (debug, info, warn, error)
- Structured logging with metadata
- Production vs development format
- File logging (error.log, combined.log)
- Correlation ID in log context

#### Task 2.4: Middleware Tests
**File:** `tests/unit/middleware.test.ts` (NEW)

**Test Cases:**
- errorHandler: Converts OperationalError to JSON response
- errorHandler: Handles programmer errors (500 response)
- errorHandler: Includes correlation ID in error response
- observability: Adds correlation ID to request
- observability: Tracks request duration
- observability: Logs request/response metadata

#### Task 2.5: TranscriptExtractor Unit Tests
**File:** `tests/unit/transcript-extractor.test.ts` (NEW)

**Test Cases:**
- Extract transcript with valid selectors
- Retry logic with progressive delays (2s, 4s, 6s)
- Fallback selector strategies
- Timeout handling
- Auto-scroll transcript panel
- Parse transcript segments correctly
- Handle missing transcript button
- Handle empty transcript

### Phase 3: Add Missing E2E Tests (Priority 3)

**Goal:** Cover critical user scenarios end-to-end
**Estimated Time:** 4-6 hours

#### Task 3.1: API Endpoints E2E
**File:** `tests/e2e/api-endpoints.e2e.test.ts` (NEW)

**Test Cases:**
- GET /api/health returns 200 with memory stats
- GET /api/health/browser returns cached health status
- GET /api/metrics returns queue stats, request counts
- POST /api/transcribe with valid URL succeeds
- POST /api/transcribe with invalid URL returns 400
- POST /api/transcribe/playlist with valid playlist succeeds
- GET /api/formats returns ["json", "srt", "text"]

#### Task 3.2: Rate Limiting E2E
**File:** `tests/e2e/rate-limiting.e2e.test.ts` (NEW)

**Test Cases:**
- 10 requests within 60s succeed
- 11th request returns 429 Too Many Requests
- Rate limit resets after window expires
- Different IPs have independent rate limits

#### Task 3.3: Format Conversion E2E
**File:** `tests/e2e/format-conversion.e2e.test.ts` (NEW)

**Test Cases:**
- Request format=json returns proper JSON structure
- Request format=srt returns SRT subtitle format
- Request format=text returns plain text transcript
- Invalid format returns 400 error

#### Task 3.4: Queue Management E2E
**File:** `tests/e2e/queue-management.e2e.test.ts` (NEW)

**Test Cases:**
- Queue accepts up to maxSize requests
- Request beyond maxSize returns 503 QUEUE_FULL
- Queue processes requests with max concurrency (3)
- Queue timeout returns 504 QUEUE_TIMEOUT
- Queue stats in metrics reflect actual state

### Phase 4: Integration & Validation (Priority 4)

**Goal:** Ensure all tests pass consistently
**Estimated Time:** 2-3 hours

#### Task 4.1: Run Full Test Suite
```bash
cd api
npm test
```

**Success Criteria:**
- All 8 original test suites pass
- All new test suites pass
- No Jest hanging issues
- Test execution time <180 seconds
- No open handle warnings

#### Task 4.2: Test Coverage Report
```bash
cd api
npm test -- --coverage
```

**Target Coverage:**
- Domain layer: >90%
- Application layer: >85%
- Infrastructure layer: >70%
- Overall: >75%

#### Task 4.3: CI/CD Integration
**File:** `.github/workflows/test.yml` (if exists)

**Ensure:**
- Tests run on every PR
- Tests run on main branch commits
- Coverage reports uploaded
- Build fails if tests fail

---

## Test Execution Strategy

### Running Tests During Development

```bash
# Run all tests
npm test

# Run specific test file
npm test -- browser-lifecycle.test.ts

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run with open handle detection
npm test -- --detectOpenHandles

# Run only unit tests
npm run test:unit

# Run only e2e tests
npm run test:e2e
```

### Test Isolation Best Practices

**1. Mock External Dependencies:**
```typescript
// Mock BrowserManager in unit tests
jest.mock('../infrastructure/BrowserManager');
const mockBrowserManager = BrowserManager as jest.MockedClass<typeof BrowserManager>;
```

**2. Use beforeEach/afterEach:**
```typescript
beforeEach(() => {
  // Reset mocks
  jest.clearAllMocks();
});

afterEach(async () => {
  // Cleanup resources
  jest.clearAllTimers();
  await cleanupResources();
});
```

**3. Unique Test Data:**
```typescript
// Use unique IDs per test to avoid conflicts
const testVideoId = `test-${Date.now()}-${Math.random()}`;
```

---

## Implementation Sequence

### Week 1: Fix Existing Tests
**Day 1-2:** Phase 1 (Fix failing tests)
- Task 1.1: Port conflicts
- Task 1.2: Mock server
- Task 1.3: Test cleanup

**Day 3:** Validation
- Run full test suite
- Verify all 8 suites pass
- Document fixes

### Week 2: Add Unit Tests
**Day 4-5:** Phase 2 Tasks 2.1-2.3
- Domain errors
- TranscribePlaylistUseCase
- Logger

**Day 6-7:** Phase 2 Tasks 2.4-2.5
- Middleware
- TranscriptExtractor

### Week 3: Add E2E Tests & Validate
**Day 8-9:** Phase 3 (E2E tests)
- API endpoints
- Rate limiting
- Format conversion
- Queue management

**Day 10:** Phase 4 (Integration)
- Full test suite
- Coverage reports
- CI/CD integration

---

## Success Criteria

### Test Suite Health

- [ ] All existing 8 test suites pass (0 failures)
- [ ] All new unit tests pass
- [ ] All new e2e tests pass
- [ ] Jest completes without hanging
- [ ] No open handle warnings
- [ ] Test execution time <180 seconds (3 minutes)

### Coverage Targets

- [ ] Domain layer: >90% coverage
- [ ] Application layer: >85% coverage
- [ ] Infrastructure layer: >70% coverage
- [ ] Overall project: >75% coverage

### Code Quality

- [ ] No flaky tests (100% consistent pass rate)
- [ ] All tests have descriptive names
- [ ] Test code follows project standards
- [ ] Mocks properly isolated
- [ ] No test interdependencies

---

## Risk Assessment

| Risk | Impact | Mitigation |
|:-----|:-------|:-----------|
| Mock server doesn't match real YouTube | HIGH | Use real YouTube pages for reference, update mocks regularly |
| Browser tests are flaky | HIGH | Implement robust retry logic, proper waits, deterministic test data |
| E2E tests take too long | MEDIUM | Run unit tests first, parallelize e2e tests where possible |
| Coverage targets too ambitious | MEDIUM | Focus on critical paths first, defer low-value tests |
| Test maintenance burden | MEDIUM | Keep tests simple, DRY principles, shared test helpers |

---

## Test Helpers & Utilities

### Suggested Test Helpers to Create

**File:** `tests/helpers/test-utils.ts`
```typescript
// Port allocation
export async function getNextAvailablePort(start: number): Promise<number>;

// Mock factories
export function createMockBrowserManager(): MockedBrowserManager;
export function createMockLogger(): MockedLogger;
export function createMockRequest(overrides?: Partial<Request>): Request;
export function createMockResponse(): MockedResponse;

// Test data generators
export function generateValidYouTubeUrl(): string;
export function generateInvalidYouTubeUrl(): string;
export function generateTranscriptSegments(count: number): TranscriptSegment[];

// Cleanup helpers
export async function cleanupTestResources(): Promise<void>;
export async function waitForServerShutdown(server: Server): Promise<void>;
```

---

## Appendix: Current Test Output Summary

```
Test Suites: 5 failed, 3 passed, 8 total
Tests:       14 failed, 4 skipped, 44 passed, 62 total
Snapshots:   0 total
Time:        140.398 s

FAIL tests/e2e/browser-lifecycle.e2e.test.ts
FAIL tests/e2e/concurrency.e2e.test.ts (106.57 s)
FAIL tests/e2e/client-disconnect.e2e.test.ts (22.748 s)
FAIL tests/unit/browser-lifecycle.test.ts
FAIL tests/e2e/full-stack.playwright.test.ts

PASS tests/unit/request-queue.test.ts (5.811 s)
PASS tests/unit/url-validation.test.ts
PASS tests/unit/playlist-extraction.test.ts
```

---

**Status:** Ready for implementation
**Next Step:** Begin Phase 1, Task 1.1 (Fix port conflicts)
**Owner:** AI Whisperers Team
**Document Version:** 1.0
**Last Updated:** 2025-11-19
