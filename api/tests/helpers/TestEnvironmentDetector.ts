/**
 * Test Environment Detector
 * Determines whether to run tests with real browsers or mocks
 */

export interface TestEnvironment {
  useRealBrowsers: boolean;
  useMockYouTube: boolean;
  browserTimeout: number;
  requestTimeout: number;
}

/**
 * Detects test environment configuration from environment variables
 */
export function detectTestEnvironment(): TestEnvironment {
  const env = process.env;

  return {
    // Use real browsers only in CI or when explicitly enabled
    useRealBrowsers: env.E2E_REAL_BROWSERS === 'true' || env.CI === 'true',

    // Use mock YouTube by default (faster, more reliable)
    useMockYouTube: env.E2E_MOCK_YOUTUBE !== 'false',

    // Longer timeouts for real browsers
    browserTimeout: env.E2E_REAL_BROWSERS === 'true' ? 60000 : 10000,

    // Longer request timeouts for real extraction
    requestTimeout: env.E2E_REAL_BROWSERS === 'true' ? 120000 : 10000
  };
}

/**
 * Conditionally skip tests based on environment
 */
export function skipIfNoRealBrowsers(testEnv: TestEnvironment): boolean {
  return !testEnv.useRealBrowsers;
}

/**
 * Get appropriate video URL based on environment
 */
export function getTestVideoUrl(videoId: string, testEnv: TestEnvironment, mockServerUrl?: string): string {
  if (testEnv.useMockYouTube && mockServerUrl) {
    return `${mockServerUrl}/watch?v=${videoId}`;
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}
