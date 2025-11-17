import { Router, Request, Response } from 'express';
import { TranscribeVideoUseCase } from '../application/TranscribeVideoUseCase';
import { TranscribePlaylistUseCase } from '../application/TranscribePlaylistUseCase';
import { TranscriptExtractor } from './TranscriptExtractor';
import { PlaylistExtractor } from './PlaylistExtractor';
import { BrowserManager } from './BrowserManager';
import { Logger } from './Logger';
import { TranscriptRequest, TranscriptFormat } from '../domain/TranscriptSegment';
import { PlaylistRequest } from '../domain/PlaylistTypes';
import { asyncHandler, metricsCollector } from './middleware';
import {
  MissingFieldError,
  InvalidFormatError
} from '../domain/errors';
import { ExpressMCPHandler } from '../mcp/express-mcp-handler';
import { RequestQueue } from './RequestQueue';

export interface RouterContext {
  router: Router;
  requestQueue: RequestQueue;
}

export function createRouter(): RouterContext {
  const router = Router();
  const logger = new Logger('api-routes');
  const browserLogger = new Logger('browser-manager');
  const queueLogger = new Logger('request-queue');
  const playlistLogger = new Logger('playlist-extractor');

  // Initialize shared components
  const browserManager = new BrowserManager(browserLogger);
  const extractor = new TranscriptExtractor(browserManager, logger);
  const playlistExtractor = new PlaylistExtractor(browserManager, playlistLogger);
  const transcribeUseCase = new TranscribeVideoUseCase(extractor, logger);
  const transcribePlaylistUseCase = new TranscribePlaylistUseCase(
    playlistExtractor,
    transcribeUseCase,
    playlistLogger
  );
  const mcpHandler = new ExpressMCPHandler();

  // Initialize request queue with environment-based configuration
  const queueMaxConcurrent = parseInt(process.env.QUEUE_MAX_CONCURRENT || '3', 10);
  const queueMaxSize = parseInt(process.env.QUEUE_MAX_SIZE || '100', 10);
  const queueTimeoutMs = parseInt(process.env.QUEUE_TIMEOUT_MS || '60000', 10);

  logger.info('Request queue configuration', {
    maxConcurrent: queueMaxConcurrent,
    maxSize: queueMaxSize,
    timeoutMs: queueTimeoutMs
  });

  const requestQueue = new RequestQueue(
    queueMaxConcurrent,
    queueMaxSize,
    queueTimeoutMs,
    queueLogger
  );

  // Health check endpoint with metrics
  router.get('/health', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('health');

    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
    const usedMemory = memoryUsage.heapUsed + memoryUsage.external;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    // Log warning if memory usage exceeds 80%
    if (memoryUsagePercent > 80) {
      logger.warn('High memory usage detected', {
        memoryUsagePercent: memoryUsagePercent.toFixed(2),
        heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
        externalMB: (memoryUsage.external / 1024 / 1024).toFixed(2),
        correlationId: req.correlationId
      });
    }

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'yt-transcript-api',
      uptime: process.uptime(),
      memory: {
        raw: memoryUsage,
        heapUsedMB: parseFloat((memoryUsage.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotalMB: parseFloat((memoryUsage.heapTotal / 1024 / 1024).toFixed(2)),
        externalMB: parseFloat((memoryUsage.external / 1024 / 1024).toFixed(2)),
        rssMB: parseFloat((memoryUsage.rss / 1024 / 1024).toFixed(2)),
        usagePercent: parseFloat(memoryUsagePercent.toFixed(2))
      },
      queue: requestQueue.getStats(),
      correlationId: req.correlationId
    };

    logger.info('Health check', { correlationId: req.correlationId, queueStats: requestQueue.getStats() });
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

  // Browser health check endpoint with caching
  let browserHealthCache: {
    result: any;
    timestamp: number;
  } | null = null;
  const BROWSER_HEALTH_CACHE_TTL = 60000; // 60 seconds

  router.get('/health/browser', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('browser-health');
    const now = Date.now();

    // Return cached result if available and not expired
    if (browserHealthCache && (now - browserHealthCache.timestamp) < BROWSER_HEALTH_CACHE_TTL) {
      logger.info('Returning cached browser health check', {
        cacheAge: now - browserHealthCache.timestamp,
        correlationId: req.correlationId
      });
      return res.json(browserHealthCache.result);
    }

    // Perform browser health check
    logger.info('Performing browser health check', { correlationId: req.correlationId });

    try {
      const healthResult = await browserManager.runIsolated(async (page, context, browser) => {
        const browserVersion = browser.version();

        // Verify page is functional
        await page.evaluate(() => true);

        return {
          browserHealthy: true,
          chromiumVersion: browserVersion,
          canLaunch: true,
          lastChecked: new Date().toISOString(),
          correlationId: req.correlationId
        };
      });

      // Cache successful result
      browserHealthCache = {
        result: healthResult,
        timestamp: now
      };

      logger.info('Browser health check passed', {
        chromiumVersion: healthResult.chromiumVersion,
        correlationId: req.correlationId
      });

      res.json(healthResult);
    } catch (error: any) {
      logger.error('Browser health check failed', error, {
        correlationId: req.correlationId
      });

      const failureResult = {
        browserHealthy: false,
        chromiumVersion: null,
        canLaunch: false,
        lastChecked: new Date().toISOString(),
        error: error.message,
        correlationId: req.correlationId
      };

      // Don't cache failure results to allow quick recovery
      res.status(503).json(failureResult);
    }
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
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId,
            context: {
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
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId,
            context: {
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

  // Playlist transcribe endpoint
  router.post('/transcribe/playlist', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('transcribe-playlist');
    const startTime = Date.now();

    // Validate required fields before queueing
    const { url, format, maxVideos } = req.body;

    if (!url) {
      throw new MissingFieldError('url');
    }

    if (format && !Object.values(TranscriptFormat).includes(format)) {
      throw new InvalidFormatError(format, Object.values(TranscriptFormat));
    }

    // Validate and cap maxVideos to prevent resource exhaustion
    const MAX_VIDEOS_LIMIT = parseInt(process.env.PLAYLIST_MAX_VIDEOS_LIMIT || '100', 10);
    const requestedMaxVideos = maxVideos || 100;

    if (requestedMaxVideos > MAX_VIDEOS_LIMIT) {
      logger.warn('Requested maxVideos exceeds limit, capping to maximum', {
        requested: requestedMaxVideos,
        capped: MAX_VIDEOS_LIMIT,
        correlationId: req.correlationId
      });
    }

    const request: PlaylistRequest = {
      url,
      format: format as TranscriptFormat,
      maxVideos: Math.min(requestedMaxVideos, MAX_VIDEOS_LIMIT)
    };

    logger.info('Queueing playlist transcription', {
      playlistUrl: url,
      format: format || 'default',
      maxVideos: request.maxVideos,
      correlationId: req.correlationId,
      queueStats: requestQueue.getStats()
    });

    try {
      // Queue the playlist extraction task
      const result = await requestQueue.add(async () => {
        // Create AbortController to handle client disconnects
        const abortController = new AbortController();

        // Kill browser if client disconnects early
        req.on('close', () => {
          logger.warn('Client disconnected - aborting playlist extraction', {
            correlationId: req.correlationId
          });
          abortController.abort();
        });

        logger.info('Starting playlist transcription from queue', {
          playlistUrl: url,
          correlationId: req.correlationId
        });

        const playlistResult = await transcribePlaylistUseCase.execute(request, abortController.signal);

        // Check if request was aborted
        if (abortController.signal.aborted) {
          logger.info('Playlist request aborted during extraction', {
            correlationId: req.correlationId
          });
          throw new Error('Request aborted');
        }

        return playlistResult;
      });

      const duration = Date.now() - startTime;
      logger.metric('transcribe-playlist', duration, {
        playlistUrl: url,
        correlationId: req.correlationId,
        processedVideos: result.data?.processedVideos || 0
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
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId,
            context: {
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
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId,
            context: {
              queueStats: requestQueue.getStats()
            }
          }
        });
        return;
      }

      throw error;
    }
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

  return { router, requestQueue };
}