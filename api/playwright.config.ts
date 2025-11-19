import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Test Configuration for Full-Stack E2E Tests
 * Tests the complete frontend-backend integration with real browser automation
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Match test files ending with .playwright.test.ts to avoid Jest test conflicts
  testMatch: /.*\.playwright\.test\.ts/,

  // Run tests in serial for full-stack tests to avoid port conflicts
  fullyParallel: false,

  // Fail the build on CI if tests were accidentally left in debug mode
  forbidOnly: !!process.env.CI,

  // Retry failed tests twice (flaky browser operations)
  retries: process.env.CI ? 2 : 1,

  // Number of workers (limit to 1 for full-stack tests to avoid port conflicts)
  workers: 1,

  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],

  // Global timeout for each test
  timeout: 120000, // 2 minutes per test (generous for extraction operations)

  // Expect timeout for assertions
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },

  // Shared settings for all projects
  use: {
    // Base URL for frontend (tests will override as needed)
    baseURL: 'http://localhost:5174',

    // Collect trace on first retry of failed tests
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Action timeout
    actionTimeout: 10000, // 10 seconds for click, fill, etc.

    // Navigation timeout
    navigationTimeout: 30000, // 30 seconds for page navigation
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment to test on additional browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Web server configuration (optional - tests start their own servers)
  // This is disabled since full-stack tests manage their own server lifecycle
  webServer: undefined,
});
