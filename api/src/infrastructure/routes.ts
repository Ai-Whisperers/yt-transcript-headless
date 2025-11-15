import { Router, Request, Response } from 'express';
import { TranscribeVideoUseCase } from '../application/TranscribeVideoUseCase';
import { TranscriptExtractor } from './TranscriptExtractor';
import { BrowserManager } from './BrowserManager';
import { Logger } from './Logger';
import { TranscriptRequest, TranscriptFormat } from '../domain/TranscriptSegment';
import { asyncHandler, metricsCollector } from './middleware';
import {
  MissingFieldError,
  InvalidFormatError
} from '../domain/errors';
import { ExpressMCPHandler } from '../mcp/express-mcp-handler';
import { RequestQueue } from './RequestQueue';

export function createRouter(): Router {
  const router = Router();
  const logger = new Logger('api-routes');
  const browserLogger = new Logger('browser-manager');
  const queueLogger = new Logger('request-queue');

  // Initialize shared components
  const browserManager = new BrowserManager(browserLogger);
  const extractor = new TranscriptExtractor(browserManager, logger);
  const transcribeUseCase = new TranscribeVideoUseCase(extractor, logger);
  const mcpHandler = new ExpressMCPHandler();

  // Initialize request queue (3 concurrent, max 100 queued, 60s timeout)
  const requestQueue = new RequestQueue(3, 100, 60000, queueLogger);

  // Health check endpoint with metrics
  router.get('/health', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('health');

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'yt-transcript-api',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      correlationId: req.correlationId
    };

    logger.info('Health check', { correlationId: req.correlationId });
    res.json(health);
  }));

  // Metrics endpoint
  router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('metrics');

    // Update queue stats in metrics collector
    metricsCollector.updateQueueStats(requestQueue.getStats());

    const metrics = metricsCollector.getMetrics();

    logger.info('Metrics requested', { correlationId: req.correlationId });

    res.json({
      success: true,
      data: {
        ...metrics,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  }));

  // Main transcribe endpoint (with queue)
  router.post('/transcribe', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('transcribe');
    const startTime = Date.now();

    // Validate required fields before queueing
    const { url, format } = req.body;

    if (!url) {
      throw new MissingFieldError('url');
    }

    if (format && !Object.values(TranscriptFormat).includes(format)) {
      throw new InvalidFormatError(format, Object.values(TranscriptFormat));
    }

    const request: TranscriptRequest = {
      url,
      format: format as TranscriptFormat
    };

    logger.info('Queueing transcript extraction', {
      videoUrl: url,
      format: format || 'default',
      correlationId: req.correlationId,
      queueStats: requestQueue.getStats()
    });

    try {
      // Queue the extraction task
      const result = await requestQueue.add(async () => {
        // Create AbortController to handle client disconnects
        const abortController = new AbortController();

        // Kill browser if client disconnects early
        req.on('close', () => {
          logger.warn('Client disconnected - aborting extraction', {
            correlationId: req.correlationId
          });
          abortController.abort();
        });

        logger.info('Starting transcript extraction from queue', {
          videoUrl: url,
          correlationId: req.correlationId
        });

        const extractionResult = await transcribeUseCase.execute(request, abortController.signal);

        // Check if request was aborted
        if (abortController.signal.aborted) {
          logger.info('Request aborted during extraction', {
            correlationId: req.correlationId
          });
          throw new Error('Request aborted');
        }

        return extractionResult;
      });

      const duration = Date.now() - startTime;
      logger.metric('transcribe', duration, {
        videoUrl: url,
        correlationId: req.correlationId
      });

      res.json(result);
    } catch (error: any) {
      // Handle queue-specific errors
      if (error.message === 'Queue is full. Please try again later.') {
        res.status(503).json({
          success: false,
          error: {
            message: 'Service is currently at capacity. Please try again later.',
            code: 'QUEUE_FULL',
            details: {
              queueStats: requestQueue.getStats()
            }
          }
        });
        return;
      }

      if (error.message === 'Request timed out in queue') {
        res.status(504).json({
          success: false,
          error: {
            message: 'Request timed out waiting in queue',
            code: 'QUEUE_TIMEOUT',
            details: {
              queueStats: requestQueue.getStats()
            }
          }
        });
        return;
      }

      throw error;
    }
  }));

  // Get supported formats
  router.get('/formats', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('formats');

    logger.info('Formats requested', { correlationId: req.correlationId });

    res.json({
      success: true,
      data: {
        formats: Object.values(TranscriptFormat),
        default: TranscriptFormat.JSON,
        correlationId: req.correlationId
      }
    });
  }));

  // MCP endpoint temporarily disabled - needs MCP handler fixes
  // router.post('/mcp', asyncHandler(async (req: Request, res: Response) => {
  //   const logger = req.logger || new Logger('mcp');
  //
  //   logger.info('MCP request received', {
  //     method: req.body.method,
  //     correlationId: req.correlationId
  //   });
  //
  //   await mcpHandler.handleMCPRequest(req, res, () => {});
  // }));

  // Cleanup on shutdown (no longer needed with disposable browsers, but kept for compatibility)
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received - graceful shutdown initiated');
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received - graceful shutdown initiated');
  });

  return router;
}