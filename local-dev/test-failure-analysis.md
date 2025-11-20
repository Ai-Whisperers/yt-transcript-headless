# Test Failure Analysis - Remaining 6 Failures
Doc-Type: Technical Analysis · Version 1.0 · Created 2025-11-19 · AI Whisperers

## Executive Summary

**Status:** 6 of 62 tests failing (84% pass rate)
**Progress:** Improved from 14 failures → 6 failures (8 tests fixed by port conflict resolution)
**Categories:** 4 runtime failures, 2 TypeScript compilation errors

---

## Test Failure Breakdown

| # | Test Suite | Test Name | Category | Root Cause |
|:--|:-----------|:----------|:---------|:-----------|
| 1 | concurrency.e2e.test.ts | Queue metrics under load | Runtime | Mock server not started, timing issue |
| 2 | browser-lifecycle.e2e.test.ts | Invalid video URL recovery | Runtime | 30s timeout, mock server ERR_CONNECTION_REFUSED |
| 3 | browser-lifecycle.e2e.test.ts | Malformed request bodies | Runtime | Response body undefined (route handler issue) |
| 4 | client-disconnect.e2e.test.ts | Request timeout gracefully | Runtime | Queue not settling (active=1, expected=0) |
| 5 | client-disconnect.e2e.test.ts | Browser cleanup after timeout | Runtime | Queue not settling (active=2, expected=0) |
| 6 | client-disconnect.e2e.test.ts | Multiple failed requests | Runtime | Queue not settling (active=3, expected=0) |
| 7 | unit/browser-lifecycle.test.ts | (All tests) | Compilation | TypeScript error: Property 'version' doesn't exist |
| 8 | full-stack.playwright.test.ts | (All tests) | Compilation | TypeScript error: async function signature mismatch |

---

## Failure #1: Concurrency Queue Metrics Test

### Test Location
`tests/e2e/concurrency.e2e.test.ts:126`

### Error
```typescript
expect(received).toBeGreaterThan(expected)
Expected: > 0
Received:   0

const totalInFlight = metrics.queue.active + metrics.queue.pending;
expect(totalInFlight).toBeGreaterThan(0);  // FAILS
```

### Root Cause
**Race Condition:** Test checks queue metrics immediately during parallel request processing, but requests complete too fast with mock server. The queue processes and clears before the metrics check happens.

### Evidence
```
Mock YouTube server listening on port 9815
ERR_CONNECTION_REFUSED at http://localhost:9815/watch?v=veryslow
```
- Mock server STARTED on port 9815
- But requests getting ERR_CONNECTION_REFUSED
- Indicates mock server not fully ready when requests fire

### Solution
```typescript
// Current (BROKEN)
const requests = videoIds.map(videoId =>
  keepAliveWrapper(request(app).post('/api/transcribe'))
    .send({ url: `${mockServer.getBaseUrl()}/watch?v=${videoId}`, format: 'json' })
);
await Promise.allSettled(requests);

// Immediately check metrics (too fast)
const beforeMetrics = await request(app).get('/api/metrics');

// Fixed (ADD DELAY)
const requests = videoIds.map(videoId =>
  keepAliveWrapper(request(app).post('/api/transcribe'))
    .send({ url: `${mockServer.getBaseUrl()}/watch?v=${videoId}`, format: 'json' })
);

// Fire requests but don't wait
const requestPromises = Promise.allSettled(requests);

// Wait a bit for queue to populate, THEN check metrics
await new Promise(resolve => setTimeout(resolve, 500));
const beforeMetrics = await request(app).get('/api/metrics');

// Now wait for all to complete
await requestPromises;
```

**Alternatively:** Add server readiness check
```typescript
beforeAll(async () => {
  // ... start mock server
  await mockServer.start();

  // Verify server is ready by making test request
  await retryUntilSuccess(async () => {
    const response = await fetch(`${mockServer.getBaseUrl()}/watch?v=test`);
    if (!response.ok) throw new Error('Server not ready');
  }, { maxAttempts: 10, delayMs: 100 });
});
```

---

## Failure #2: Invalid Video URL Recovery (Timeout)

### Test Location
`tests/e2e/browser-lifecycle.e2e.test.ts:202`

### Error
```
thrown: "Exceeded timeout of 30000 ms for a test."
```

### Root Cause
**Mock Server Not Running:** Test tries to extract from mock server but gets ERR_CONNECTION_REFUSED repeatedly, causing 3 retries with progressive delays (2s, 4s, 6s), eventually exceeding 30s timeout.

### Evidence from Logs
```
2025-11-19 12:28:52.932 [api-routes] Extraction attempt 3/3
2025-11-19 12:28:55.450 [browser-manager] error: BrowserManager.runIsolated error
"errorMessage": "page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:9504/watch?v=leak1"
```

### Why Mock Server Fails
Looking at logs, mock server **does** start successfully on dynamic ports (9815, 9504, etc.), but:
1. **Port mismatch:** Test registers video on one mock server instance, but tries to connect to different port
2. **Premature server stop:** Mock server stops before all concurrent tests finish
3. **Shared mock server:** Multiple tests sharing same mock server instance causing conflicts

### Solution Option A: Ensure Mock Server Running
```typescript
it('should recover from invalid video URLs', async () => {
  // VERIFY mock server is accessible before testing
  const pingUrl = `${mockServer.getBaseUrl()}/watch?v=test`;
  const pingResponse = await fetch(pingUrl);
  expect(pingResponse.status).toBeLessThan(500); // Should get 404, not connection error

  // Now run actual test
  mockServer.registerVideo({
    videoId: 'INVALID_VIDEO',
    title: 'Invalid Video',
    hasTranscript: false
  });

  const response = await keepAliveWrapper(request(app).post('/api/transcribe'))
    .send({
      url: `${mockServer.getBaseUrl()}/watch?v=INVALID_VIDEO`,
      format: 'json'
    });

  expect(response.body).toHaveProperty('success');
}, 30000);
```

### Solution Option B: Increase Timeout
```typescript
it('should recover from invalid video URLs', async () => {
  // ... test code
}, 60000); // Increase from 30s to 60s
```

### Solution Option C: Fix Mock Server Lifecycle
```typescript
// Problem: Mock server stops before all tests complete
afterAll(async () => {
  // Wait for ALL in-flight requests to complete
  await waitForQueueSettlement(5000);

  // Then stop mock server
  if (mockServer) {
    await mockServer.stop();
    await new Promise(resolve => setTimeout(resolve, 200)); // Extra delay
  }
});
```

---

## Failure #3: Malformed Request Bodies

### Test Location
`tests/e2e/browser-lifecycle.e2e.test.ts:236`

### Error
```typescript
expect(response.body.success).toBe(false);
// Expected: false
// Received: undefined
```

### Root Cause
**Response body is undefined or not JSON.** The route handler for invalid URLs may be:
1. Returning empty response
2. Returning HTML error page instead of JSON
3. Crashing before response is sent

### Analysis
```typescript
// Test sends invalid URL
const response = await request(app)
  .post('/api/transcribe')
  .send({
    url: 'not-a-url',
    format: 'invalid-format'
  });

expect(response.status).toBe(400); // This probably passes
expect(response.body.success).toBe(false); // FAILS - body undefined
expect(response.body.error.code).toBe('INVALID_URL');
```

### Investigation Needed
Check `routes.ts:~200` for `/api/transcribe` POST handler:
- Does it validate URL BEFORE queueing?
- Does it catch ValidationError and return JSON?
- Is there an error handler middleware that converts errors to JSON?

### Expected Behavior
```typescript
// routes.ts should have validation
router.post('/transcribe', async (req, res) => {
  try {
    // Validate URL format
    const urlValidation = validateYouTubeUrl(req.body.url);
    if (!urlValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          message: urlValidation.error,
          code: 'INVALID_URL',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Rest of handler...
  } catch (error) {
    // Error handler
  }
});
```

### Solution
1. **Check current validation logic** in routes.ts
2. **Ensure error responses are JSON**, not HTML
3. **Add explicit Content-Type: application/json** to error responses
4. **Test with curl** to see actual response:
```bash
curl -X POST http://localhost:3000/api/transcribe \
  -H "Content-Type: application/json" \
  -d '{"url":"not-a-url","format":"json"}' \
  -v
```

---

## Failures #4-6: Client Disconnect Queue Not Settling

### Test Locations
- `tests/e2e/client-disconnect.e2e.test.ts:69` (active=1, expected=0)
- `tests/e2e/client-disconnect.e2e.test.ts:105` (active=2, expected=0)
- `tests/e2e/client-disconnect.e2e.test.ts:144` (active=3, expected=0)

### Error Pattern
```typescript
await waitForQueueSettlement(1000);
const metrics = await request(app).get('/api/metrics');
expect(metrics.body.data.queue.active).toBe(0);  // FAILS

// Expected: 0
// Received: 1 (or 2, or 3)
```

### Root Cause
**Insufficient Queue Settlement Time:** Tests are aborting requests (via timeout), but the queue takes longer than expected to clean up browser instances and mark tasks as complete.

### Evidence
```
2025-11-19 12:26:14.647 [browser-manager] error: BrowserManager.runIsolated error
  "errorMessage": "page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:9815/watch?v=veryslow"

2025-11-19 12:26:14.720 [api-routes] warn: Attempt 1 failed
2025-11-19 12:26:19.352 [api-routes] warn: Attempt 2 failed
2025-11-19 12:26:19.407 [api-routes] warn: Attempt 2 failed
```

**Problem:** Tests are creating requests that fail due to ERR_CONNECTION_REFUSED, triggering retry logic (2s, 4s, 6s delays), and tests check queue metrics before retries complete.

### Timeline Analysis
```
T+0s:    Test starts, sends request with 2s timeout
T+2s:    Request times out (client disconnect)
T+2s:    Browser extraction starts (unaware of client disconnect initially)
T+2s:    ERR_CONNECTION_REFUSED (mock server not running)
T+4s:    Retry attempt 1 (2s delay)
T+4s:    ERR_CONNECTION_REFUSED again
T+8s:    Retry attempt 2 (4s delay)
T+8s:    ERR_CONNECTION_REFUSED again
T+14s:   Retry attempt 3 (6s delay)
T+14s:   Finally marks as failed, removes from queue
T+0.1s:  Test checks metrics (TOO EARLY!)
```

### Solution Option A: Increase Settlement Time
```typescript
// Current (BROKEN)
await waitForQueueSettlement(1000); // 1 second

// Fixed
await waitForQueueSettlement(5000); // 5 seconds (allows time for retries to fail)
```

### Solution Option B: Disable Retries for These Tests
```typescript
// Set env var to disable retries in queue during disconnect tests
beforeAll(() => {
  process.env.MAX_RETRIES = '1'; // Only 1 attempt, no retries
});

afterAll(() => {
  delete process.env.MAX_RETRIES;
});
```

### Solution Option C: Actually Start Mock Server
**The REAL issue:** These tests are supposed to test client disconnect behavior, but mock server is not running at all, so requests are failing for wrong reason.

```typescript
beforeAll(async () => {
  // ... existing setup

  // START MOCK SERVER for disconnect tests
  const randomStart = getRandomPort(9500, 9700);
  mockServerPort = await getAvailablePort(randomStart);
  mockServer = new MockYouTubeServer(mockServerPort);
  await mockServer.start();

  // Verify it's running
  const healthCheck = await fetch(`http://localhost:${mockServerPort}/watch?v=test`);
  expect(healthCheck.status).toBeLessThan(500);
});
```

**Then in tests:**
```typescript
it('should handle request timeout gracefully', async () => {
  // Register video with VERY SLOW response
  mockServer.registerVideo({
    videoId: 'timeout1',
    title: 'Timeout Test',
    hasTranscript: true,
    transcriptSegments: [{ time: '0:00', text: 'This will timeout' }],
    responseDelay: 10000 // 10 seconds
  });

  try {
    await request(app)
      .post('/api/transcribe')
      .send({
        url: `${mockServer.getBaseUrl()}/watch?v=timeout1`,
        format: 'json'
      })
      .timeout(2000); // 2 second client timeout
  } catch (error) {
    // Expected timeout
  }

  // NOW wait for queue to settle (request aborted, browser cleaning up)
  await waitForQueueSettlement(3000); // Longer wait
  const metrics = await request(app).get('/api/metrics');
  expect(metrics.body.data.queue.active).toBe(0);
}, 15000);
```

---

## Failure #7: Unit Browser Lifecycle TypeScript Error

### Test Location
`tests/unit/browser-lifecycle.test.ts:101`

### Error
```
TS2339: Property 'version' does not exist on type 'never'.
await capturedBrowser.version();
                     ~~~~~~~
```

### Root Cause
**Mock Type Issue:** The mocked Browser type is inferred as `never` because mock setup is incomplete.

### Investigation
```typescript
// Likely current code
const mockBrowser = {
  // Mock methods
};

// Later in test
await capturedBrowser.version(); // TypeScript doesn't know what capturedBrowser is
```

### Solution
```typescript
// Add proper type to mock
import { Browser } from 'playwright';

const mockBrowser = {
  version: jest.fn().mockResolvedValue('1.40.0'),
  close: jest.fn().mockResolvedValue(undefined),
  newContext: jest.fn().mockResolvedValue(mockContext),
  // ... other methods
} as unknown as Browser;

// OR use jest.MockedObject
const mockBrowser: jest.Mocked<Browser> = {
  version: jest.fn().mockResolvedValue('1.40.0'),
  // ...
} as any;
```

### Quick Fix
```typescript
// Cast to any to bypass type checking (temporary)
await (capturedBrowser as any).version();

// Better: Fix mock setup to include version method
```

---

## Failure #8: Full-Stack Playwright TypeScript Error

### Test Location
`tests/e2e/full-stack.playwright.test.ts:103, 122, 158, 179`

### Error
```
TS2559: Type '({ page }: { page: any; }) => Promise<void>' has no properties in common with type 'TestDetails'.

test('should load frontend and connect to backend health endpoint', async ({ page }) => {
                                                                       ^~~~~~~~~~~~~~~~~~~~~
```

### Root Cause
**Playwright Test API Mismatch:** The test is using Playwright's test runner syntax `test(name, async ({ page }) => {})`, but something is wrong with the function signature or test API version.

### Likely Issues
1. **Missing Playwright test fixture imports**
2. **Conflicting test runners** (Jest vs Playwright)
3. **Playwright version mismatch**

### Investigation
```typescript
// Check imports at top of file
import { test, expect } from '@playwright/test'; // Correct

// But Jest might also be loaded globally
// Check jest.config.js - is it configured to ignore .playwright.test.ts files?
```

### Solution Option A: Fix Jest Config
```javascript
// jest.config.js
module.exports = {
  // ...
  testMatch: [
    '**/?(*.)+(spec|test).[jt]s?(x)',
    '!**/*.playwright.test.ts' // EXCLUDE playwright tests from Jest
  ]
};
```

### Solution Option B: Separate Playwright Config
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.playwright.test.ts',
  use: {
    baseURL: 'http://localhost:5174',
  },
});
```

### Solution Option C: Fix Test Syntax
```typescript
// If Playwright types are wrong, try explicit typing
import { test as base, expect, Page } from '@playwright/test';

const test = base.extend<{ page: Page }>({
  // fixtures if needed
});

test('should load frontend', async ({ page }) => {
  // test code
});
```

---

## Priority Fix Order

### Immediate (High Impact, Low Effort)

**1. Fix TypeScript Compilation Errors (Failures #7-8)**
- **Impact:** Blocks 2 entire test suites (all tests skip)
- **Effort:** 30 minutes
- **Files:**
  - `tests/unit/browser-lifecycle.test.ts` (add proper mock types)
  - `jest.config.js` (exclude Playwright tests)

**2. Fix Mock Server Connection Issues (Failures #1, #2, #4-6)**
- **Impact:** Fixes 5 tests
- **Effort:** 1-2 hours
- **Root Cause:** Mock server lifecycle issues
- **Fix:** Add server readiness checks, increase settlement times

**3. Fix Malformed Request Body Response (Failure #3)**
- **Impact:** Fixes 1 test, improves error handling
- **Effort:** 30 minutes
- **Fix:** Ensure validation errors return proper JSON

### Implementation Sequence

**Step 1: TypeScript Fixes (30 min)**
```bash
1. Fix browser-lifecycle.test.ts mock types
2. Update jest.config.js to exclude *.playwright.test.ts
3. Run: npm test -- tests/unit/browser-lifecycle.test.ts
4. Verify: TypeScript compiles, tests run
```

**Step 2: Mock Server Readiness (1 hour)**
```bash
1. Add waitForServerReady() helper
2. Update all e2e beforeAll hooks to wait for mock server
3. Add logging to track mock server ports
4. Run: npm test -- tests/e2e/
5. Verify: No more ERR_CONNECTION_REFUSED
```

**Step 3: Queue Settlement (30 min)**
```bash
1. Increase waitForQueueSettlement() times in client-disconnect tests
2. Add process.env.MAX_RETRIES override for faster test cleanup
3. Run: npm test -- tests/e2e/client-disconnect.e2e.test.ts
4. Verify: Queue active count reaches 0
```

**Step 4: Validation Error Response (30 min)**
```bash
1. Check routes.ts validation logic
2. Ensure error responses are JSON with success=false
3. Add explicit Content-Type headers
4. Run: npm test -- tests/e2e/browser-lifecycle.e2e.test.ts
5. Verify: Malformed request returns proper error JSON
```

---

## Success Criteria

After implementing fixes:
- [ ] All 62 tests pass (100% pass rate)
- [ ] No TypeScript compilation errors
- [ ] No ERR_CONNECTION_REFUSED errors
- [ ] Queue metrics tests measure actual in-flight requests
- [ ] Client disconnect tests show queue settling properly
- [ ] Error responses are properly formatted JSON

---

## Estimated Time to Fix All 6 Failures

| Task | Time | Cumulative |
|:-----|:-----|:-----------|
| TypeScript errors | 30 min | 30 min |
| Mock server readiness | 1 hour | 1.5 hours |
| Queue settlement | 30 min | 2 hours |
| Validation response | 30 min | 2.5 hours |
| Testing & verification | 30 min | **3 hours total** |

---

**Status:** Analysis complete, ready for implementation
**Next Step:** Implement TypeScript fixes (highest priority, blocks 2 test suites)
**Owner:** AI Whisperers Team
**Document Version:** 1.0
**Last Updated:** 2025-11-19
