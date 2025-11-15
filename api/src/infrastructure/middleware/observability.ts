import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Logger } from '../Logger';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
      logger?: Logger;
    }
  }
}

/**
 * Correlation ID middleware - adds unique ID to each request for tracing
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = req.headers['x-correlation-id'] as string || randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
}

/**
 * Request context middleware - attaches logger with correlation ID
 */
export function requestContextMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    req.startTime = Date.now();
    req.logger = logger.child({
      correlationId: req.correlationId,
      requestId: req.correlationId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    next();
  };
}

/**
 * Request logging middleware - logs HTTP requests with timing
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const logger = req.logger || new Logger('http');

  // Log incoming request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Capture response finish event
  const originalEnd = res.end.bind(res);
  res.end = function (chunk?: any, encoding?: any, callback?: any): Response {
    const duration = req.startTime ? Date.now() - req.startTime : 0;

    logger.httpRequest(
      req.method,
      req.path,
      res.statusCode,
      duration,
      {
        correlationId: req.correlationId,
        statusCode: res.statusCode,
        contentLength: res.get('content-length')
      }
    );

    return originalEnd(chunk, encoding, callback) as Response;
  };

  next();
}

/**
 * Metrics collector for observability
 */
export class MetricsCollector {
  private metrics: Map<string, number> = new Map();
  private requestCounts: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private latencies: Map<string, number[]> = new Map();
  private queueStats: any = null;

  /**
   * Record request metric
   */
  recordRequest(endpoint: string): void {
    const current = this.requestCounts.get(endpoint) || 0;
    this.requestCounts.set(endpoint, current + 1);
  }

  /**
   * Record error metric
   */
  recordError(errorCode: string): void {
    const current = this.errorCounts.get(errorCode) || 0;
    this.errorCounts.set(errorCode, current + 1);
  }

  /**
   * Record latency metric
   */
  recordLatency(operation: string, durationMs: number): void {
    const latencies = this.latencies.get(operation) || [];
    latencies.push(durationMs);
    this.latencies.set(operation, latencies);

    // Keep only last 100 measurements
    if (latencies.length > 100) {
      latencies.shift();
    }
  }

  /**
   * Update queue statistics
   */
  updateQueueStats(stats: any): void {
    this.queueStats = stats;
  }

  /**
   * Get metrics summary
   */
  getMetrics() {
    const summary: any = {
      requests: Object.fromEntries(this.requestCounts),
      errors: Object.fromEntries(this.errorCounts),
      latencies: {},
      queue: this.queueStats || {
        pending: 0,
        active: 0,
        completed: 0,
        failed: 0,
        totalProcessed: 0
      }
    };

    // Calculate latency statistics
    for (const [operation, values] of this.latencies.entries()) {
      if (values.length === 0) continue;

      const sorted = [...values].sort((a, b) => a - b);
      summary.latencies[operation] = {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      };
    }

    return summary;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics.clear();
    this.requestCounts.clear();
    this.errorCounts.clear();
    this.latencies.clear();
  }
}

// Singleton metrics collector
export const metricsCollector = new MetricsCollector();

/**
 * Metrics collection middleware
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const endpoint = `${req.method} ${req.route?.path || req.path}`;

  metricsCollector.recordRequest(endpoint);

  const originalEnd = res.end.bind(res);
  res.end = function (chunk?: any, encoding?: any, callback?: any): Response {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    metricsCollector.recordLatency(endpoint, duration);

    return originalEnd(chunk, encoding, callback) as Response;
  };

  next();
}
