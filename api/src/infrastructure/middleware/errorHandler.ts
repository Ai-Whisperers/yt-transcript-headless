import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../domain/errors';
import { Logger } from '../Logger';
import { metricsCollector } from './observability';

/**
 * Centralized error handling middleware
 */
export function errorHandler(logger: Logger) {
  return (err: Error, req: Request, res: Response, next: NextFunction): void => {
    const correlationId = req.correlationId || 'unknown';
    const requestLogger = req.logger || logger;

    // Handle operational errors (AppError)
    if (err instanceof AppError) {
      metricsCollector.recordError(err.code);

      requestLogger.error('Operational error', err, {
        correlationId,
        path: req.path,
        method: req.method
      });

      res.status(err.statusCode).json(err.toJSON(correlationId));
      return;
    }

    // Handle unexpected errors
    metricsCollector.recordError('UNEXPECTED_ERROR');

    requestLogger.error('Unexpected error', err, {
      correlationId,
      path: req.path,
      method: req.method,
      stack: err.stack
    });

    // Don't expose internal error details in production
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

    res.status(500).json({
      success: false,
      error: {
        message,
        code: 'INTERNAL_ERROR',
        correlationId,
        timestamp: new Date().toISOString()
      }
    });
  };
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  const logger = req.logger || new Logger('http');

  logger.warn('Route not found', {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path
  });

  res.status(404).json({
    success: false,
    error: {
      message: 'Endpoint not found',
      code: 'NOT_FOUND',
      path: req.path,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Async handler wrapper to catch async errors
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
