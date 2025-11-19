/**
 * Port allocation utilities for test isolation
 */
import { createServer } from 'net';

/**
 * Find an available port starting from the given port
 * @param startPort - Port to start searching from
 * @returns Promise resolving to available port number
 */
export async function getAvailablePort(startPort: number = 9000): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.listen(startPort, () => {
      const port = (server.address() as any).port;
      server.close(() => resolve(port));
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Port in use, try next one
        resolve(getAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Get a random port in a range (for test isolation)
 * @param min - Minimum port number
 * @param max - Maximum port number
 * @returns Random port in range
 */
export function getRandomPort(min: number = 9000, max: number = 9999): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Wait for a port to become available (useful after server stop)
 * @param port - Port to check
 * @param maxAttempts - Maximum number of retry attempts
 * @param delayMs - Delay between attempts in milliseconds
 */
export async function waitForPortAvailable(
  port: number,
  maxAttempts: number = 10,
  delayMs: number = 100
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const availablePort = await getAvailablePort(port);
      if (availablePort === port) {
        return true;
      }
    } catch (err) {
      // Port still in use, wait and retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return false;
}
