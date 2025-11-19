import { Response } from 'express';
import { RequestQueue } from '../RequestQueue';

/**
 * Shared error handling utilities
 */

/**
 * Send queue full error response
 * @param res - Express response object
 * @param correlationId - Request correlation ID (optional)
 * @param requestQueue - Queue instance for stats
 */
export function sendQueueFullError(
  res: Response,
  correlationId: string | undefined,
  requestQueue: RequestQueue
): void {
  res.status(503).json({
    success: false,
    error: {
      message: 'Service is currently at capacity. Please try again later.',
      code: 'QUEUE_FULL',
      timestamp: new Date().toISOString(),
      correlationId: correlationId,
      context: {
        queueStats: requestQueue.getStats()
      }
    }
  });
}
