/**
 * Long-Running Request Helper for E2E Testing
 * Handles keeping HTTP connections alive during browser automation
 */

import { Agent } from 'http';

export interface RequestKeepAliveConfig {
  timeout: number; // Request timeout in ms
  keepAlive: boolean;
  keepAliveMsecs: number;
  maxSockets: number;
}

/**
 * Creates an HTTP agent configured for long-running requests
 * Prevents SuperTest from closing connections prematurely
 */
export function createLongRunningAgent(config?: Partial<RequestKeepAliveConfig>): Agent {
  const defaults: RequestKeepAliveConfig = {
    timeout: 120000, // 2 minutes
    keepAlive: true,
    keepAliveMsecs: 60000, // 1 minute
    maxSockets: 10
  };

  const finalConfig = { ...defaults, ...config };

  return new Agent({
    keepAlive: finalConfig.keepAlive,
    keepAliveMsecs: finalConfig.keepAliveMsecs,
    maxSockets: finalConfig.maxSockets,
    timeout: finalConfig.timeout
  });
}

/**
 * Delays execution to allow async operations to settle
 */
export async function waitForQueueSettlement(ms: number = 1000): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Polls a condition until it becomes true or times out
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<boolean> {
  const timeout = options.timeout || 10000;
  const interval = options.interval || 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await Promise.resolve(condition());
    if (result) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Wraps a SuperTest request to prevent premature connection closure
 */
export function keepAliveWrapper(request: any): any {
  return request
    .timeout(120000) // 2 minute timeout
    .set('Connection', 'keep-alive')
    .set('Keep-Alive', 'timeout=120');
}
