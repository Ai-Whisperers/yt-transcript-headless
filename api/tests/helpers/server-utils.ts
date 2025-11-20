/**
 * Server readiness utilities for reliable e2e testing
 */

import { MockYouTubeServer } from './MockYouTubeServer';

/**
 * Wait for mock server to be fully ready and accepting connections
 * @param server - MockYouTubeServer instance
 * @param maxAttempts - Maximum number of health check attempts
 * @param delayMs - Delay between health check attempts
 */
export async function waitForServerReady(
  server: MockYouTubeServer,
  maxAttempts: number = 20,
  delayMs: number = 100
): Promise<boolean> {
  const baseUrl = server.getBaseUrl();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Try to fetch a test endpoint
      const response = await fetch(`${baseUrl}/watch?v=_healthcheck_`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000)
      });

      // Server is ready if we get ANY response (even 404 is fine)
      // We just need to verify server is listening on the port
      if (response.status < 500 || response.status === 404) {
        return true;
      }
    } catch (error: any) {
      // Connection errors are expected while server is starting
      if (error.code === 'ECONNREFUSED' || error.name === 'FetchError') {
        // Server not ready yet, wait and retry
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      // Timeout or other errors - retry
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  // Server never became ready
  console.error(`Mock server at ${baseUrl} failed to become ready after ${maxAttempts} attempts`);
  return false;
}

/**
 * Verify server is responsive by making a test request
 * @param baseUrl - Server base URL
 * @returns True if server responds, false otherwise
 */
export async function isServerResponsive(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/watch?v=test`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    // Any response (including 404) means server is responsive
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Wait with exponential backoff for a condition to be true
 * @param condition - Async function that returns true when ready
 * @param maxAttempts - Maximum number of attempts
 * @param initialDelayMs - Initial delay between attempts
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  maxAttempts: number = 10,
  initialDelayMs: number = 100
): Promise<boolean> {
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await condition()) {
      return true;
    }

    // Exponential backoff with max 2s delay
    await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 2000)));
    delayMs *= 1.5;
  }

  return false;
}
