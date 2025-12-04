import { Router, Request, Response } from 'express';
import { TranscribeVideoUseCase } from '../application/TranscribeVideoUseCase';
import { TranscribePlaylistUseCase } from '../application/TranscribePlaylistUseCase';
import { BatchTranscribeUseCase } from '../application/BatchTranscribeUseCase';
import { SemanticSearchUseCase } from '../application/SemanticSearchUseCase';
import { RAGChatUseCase } from '../application/RAGChatUseCase';
import { AutoEmbedTranscriptUseCase } from '../application/AutoEmbedTranscriptUseCase';
import { TranscriptExtractor } from './TranscriptExtractor';
import { PlaylistExtractor } from './PlaylistExtractor';
import { PooledTranscriptExtractor } from './PooledTranscriptExtractor';
import { BrowserManager } from './BrowserManager';
import { BrowserPool, getSharedBrowserPool, shutdownSharedPool } from './BrowserPool';
import { ProgressStream, ProgressEmitter, getSharedProgressStream } from './ProgressStream';
import { RepositoryFactory } from './database/RepositoryFactory';
import { CacheEvictionService } from './database/CacheEvictionService';
import { RAGServiceFactory } from './RAGServiceFactory';
import { Logger } from './Logger';
import { TranscriptRequest, TranscriptFormat } from '../domain/TranscriptSegment';
import { PlaylistRequest } from '../domain/PlaylistTypes';
import { BatchRequest } from '../domain/BatchTypes';
import { asyncHandler, metricsCollector } from './middleware';
import {
  MissingFieldError,
  InvalidFormatError
} from '../domain/errors';
import { ExpressMCPHandler } from '../mcp/express-mcp-handler';
import { RequestQueue } from './RequestQueue';
import { sendQueueFullError } from './utils/error-handlers';
import { randomUUID } from 'crypto';

export interface RouterContext {
  router: Router;
  requestQueue: RequestQueue;
  browserPool: BrowserPool;
  progressStream: ProgressStream;
  repositoryFactory?: RepositoryFactory;
  cacheEvictionService?: CacheEvictionService;
}

export function createRouter(): RouterContext {
  const router = Router();
  const logger = new Logger('api-routes');
  const browserLogger = new Logger('browser-manager');
  const queueLogger = new Logger('request-queue');
  const playlistLogger = new Logger('playlist-extractor');
  const batchLogger = new Logger('batch-extractor');
  const poolLogger = new Logger('browser-pool');

  // Initialize shared components
  const browserManager = new BrowserManager(browserLogger);
  const extractor = new TranscriptExtractor(browserManager, logger);
  const transcribeUseCase = new TranscribeVideoUseCase(extractor, logger);
  const mcpHandler = new ExpressMCPHandler();

  // Initialize browser pool for batch and playlist operations
  const browserPool = getSharedBrowserPool(poolLogger);
  const pooledExtractor = new PooledTranscriptExtractor(browserPool, batchLogger);

  // Initialize repository factory for persistence (optional, based on environment variable)
  const enablePersistence = process.env.ENABLE_PERSISTENCE === 'true';
  let repositoryFactory: RepositoryFactory | undefined;
  let cacheRepository: ReturnType<RepositoryFactory['getCacheRepository']> | undefined = undefined;
  let jobRepository: ReturnType<RepositoryFactory['getJobRepository']> | undefined = undefined;
  let cacheEvictionService: CacheEvictionService | undefined = undefined;

  if (enablePersistence) {
    try {
      const repoLogger = new Logger('repository-factory');
      repositoryFactory = RepositoryFactory.getInstance(repoLogger);
      cacheRepository = repositoryFactory.getCacheRepository();
      jobRepository = repositoryFactory.getJobRepository();
      logger.info('Persistence enabled', {
        cacheEnabled: !!cacheRepository,
        jobTrackingEnabled: !!jobRepository
      });

      // Initialize cache eviction service
      if (cacheRepository) {
        const evictionLogger = new Logger('cache-eviction');
        cacheEvictionService = new CacheEvictionService(
          cacheRepository,
          evictionLogger
        );
        cacheEvictionService.start();
        logger.info('Cache eviction service started', {
          config: cacheEvictionService.getConfig()
        });
      }
    } catch (error: any) {
      logger.error('Failed to initialize persistence layer', error);
      logger.warn('Continuing without persistence - caching and job tracking disabled');
    }
  } else {
    logger.info('Persistence disabled - set ENABLE_PERSISTENCE=true to enable caching');
  }

  // Initialize RAG service factory (optional, based on environment variable)
  const ragLogger = new Logger('rag-services');
  const ragServiceFactory = RAGServiceFactory.getInstance(ragLogger);
  let semanticSearchUseCase: SemanticSearchUseCase | undefined;
  let ragChatUseCase: RAGChatUseCase | undefined;
  let autoEmbedUseCase: AutoEmbedTranscriptUseCase | undefined;

  if (ragServiceFactory.isRAGEnabled()) {
    try {
      const embeddingService = ragServiceFactory.getEmbeddingService();
      const llmService = ragServiceFactory.getLLMService();
      const vectorStore = ragServiceFactory.getVectorStore();

      semanticSearchUseCase = new SemanticSearchUseCase(
        embeddingService,
        vectorStore,
        ragLogger
      );

      ragChatUseCase = new RAGChatUseCase(
        embeddingService,
        llmService,
        vectorStore,
        ragLogger
      );

      autoEmbedUseCase = new AutoEmbedTranscriptUseCase(
        embeddingService,
        vectorStore,
        ragLogger
      );

      // Initialize vector store asynchronously (non-blocking)
      ragServiceFactory.initializeAll().catch(error => {
        logger.error('RAG services async initialization failed', error);
      });

      logger.info('RAG services initialized', {
        semanticSearchEnabled: !!semanticSearchUseCase,
        ragChatEnabled: !!ragChatUseCase,
        autoEmbedEnabled: !!autoEmbedUseCase
      });
    } catch (error: any) {
      logger.error('Failed to initialize RAG services', error);
      logger.warn('Continuing without RAG - semantic search and chat disabled');
    }
  } else {
    logger.info('RAG services disabled - set ENABLE_RAG=true to enable semantic search and chat');
  }

  // Initialize use cases with optional repositories
  const batchTranscribeUseCase = new BatchTranscribeUseCase(
    pooledExtractor,
    batchLogger,
    cacheRepository,
    jobRepository
  );

  // Playlist now uses pooled extractor for parallel processing
  const playlistExtractor = new PlaylistExtractor(browserManager, playlistLogger);
  const transcribePlaylistUseCase = new TranscribePlaylistUseCase(
    playlistExtractor,
    pooledExtractor,
    playlistLogger,
    cacheRepository,
    jobRepository
  );

  // Initialize progress stream for SSE
  const progressStreamLogger = new Logger('progress-stream');
  const progressStream = getSharedProgressStream(progressStreamLogger);

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
      browserPool: browserPool.getStats(),
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

        // If extraction succeeded, return result even if client disconnected
        // The abort signal is handled by BrowserManager during extraction
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
        sendQueueFullError(res, req.correlationId, requestQueue);
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

  // ============================================================================
  // Cache Management Endpoints
  // ============================================================================

  // Get cache statistics
  router.get('/cache/stats', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('cache-stats');

    if (!cacheRepository) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Persistence layer not enabled',
          code: 'PERSISTENCE_DISABLED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    try {
      const stats = await cacheRepository.getCacheStats();

      logger.info('Cache stats requested', {
        totalEntries: stats.totalEntries,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          ...stats,
          correlationId: req.correlationId
        }
      });
    } catch (error: any) {
      logger.error('Failed to get cache stats', error, { correlationId: req.correlationId });
      throw error;
    }
  }));

  // Get specific cached transcript
  router.get('/cache/:videoId', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('cache-get');
    const { videoId } = req.params;

    if (!cacheRepository) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Persistence layer not enabled',
          code: 'PERSISTENCE_DISABLED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    try {
      const cached = await cacheRepository.getTranscript(videoId);

      if (!cached) {
        return res.status(404).json({
          success: false,
          error: {
            message: `Transcript not found in cache for video: ${videoId}`,
            code: 'NOT_FOUND',
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId
          }
        });
      }

      logger.info('Cached transcript retrieved', {
        videoId,
        accessCount: cached.accessCount,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          ...cached,
          correlationId: req.correlationId
        }
      });
    } catch (error: any) {
      logger.error('Failed to get cached transcript', error, {
        videoId,
        correlationId: req.correlationId
      });
      throw error;
    }
  }));

  // Delete specific cached transcript
  router.delete('/cache/:videoId', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('cache-delete');
    const { videoId } = req.params;

    if (!cacheRepository) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Persistence layer not enabled',
          code: 'PERSISTENCE_DISABLED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    try {
      // Check if transcript exists
      const exists = await cacheRepository.hasTranscript(videoId);

      if (!exists) {
        return res.status(404).json({
          success: false,
          error: {
            message: `Transcript not found in cache for video: ${videoId}`,
            code: 'NOT_FOUND',
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId
          }
        });
      }

      await cacheRepository.deleteTranscript(videoId);

      logger.info('Cached transcript deleted', {
        videoId,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          message: `Transcript deleted from cache for video: ${videoId}`,
          videoId,
          correlationId: req.correlationId
        }
      });
    } catch (error: any) {
      logger.error('Failed to delete cached transcript', error, {
        videoId,
        correlationId: req.correlationId
      });
      throw error;
    }
  }));

  // Evict oldest cached entries (LRU eviction)
  router.post('/cache/evict', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('cache-evict');
    const { count } = req.body;

    if (!cacheRepository) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Persistence layer not enabled',
          code: 'PERSISTENCE_DISABLED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    if (!count || typeof count !== 'number' || count <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid count parameter. Must be a positive number.',
          code: 'INVALID_PARAMETER',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    try {
      const evictedCount = await cacheRepository.evictOldest(count);

      logger.info('Cache eviction completed', {
        requested: count,
        evicted: evictedCount,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          message: `Evicted ${evictedCount} oldest entries from cache`,
          requested: count,
          evicted: evictedCount,
          correlationId: req.correlationId
        }
      });
    } catch (error: any) {
      logger.error('Failed to evict cached entries', error, {
        count,
        correlationId: req.correlationId
      });
      throw error;
    }
  }));

  // Trigger automatic cache eviction with configured policies
  router.post('/cache/evict/auto', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('cache-evict-auto');

    if (!cacheEvictionService) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Cache eviction service not enabled',
          code: 'EVICTION_SERVICE_DISABLED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    try {
      const result = await cacheEvictionService.runEviction();

      logger.info('Automatic cache eviction completed', {
        ...result,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          message: `Automatic eviction completed: ${result.evictedCount} entries removed`,
          config: cacheEvictionService.getConfig(),
          result,
          correlationId: req.correlationId
        }
      });
    } catch (error: any) {
      logger.error('Automatic cache eviction failed', error, {
        correlationId: req.correlationId
      });

      res.status(500).json({
        success: false,
        error: {
          message: `Automatic cache eviction failed: ${error.message}`,
          code: 'EVICTION_FAILED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
  }));

  // Clear entire cache (DANGEROUS - requires confirmation header)
  router.delete('/cache', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('cache-clear');
    const confirmHeader = req.headers['x-confirm-clear-cache'];

    if (!cacheRepository) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Persistence layer not enabled',
          code: 'PERSISTENCE_DISABLED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    if (confirmHeader !== 'yes-clear-all-cache') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cache clear requires confirmation header: X-Confirm-Clear-Cache: yes-clear-all-cache',
          code: 'CONFIRMATION_REQUIRED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    try {
      const statsBefore = await cacheRepository.getCacheStats();
      await cacheRepository.clearCache();

      logger.warn('Entire cache cleared', {
        entriesDeleted: statsBefore.totalEntries,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          message: 'Entire cache cleared successfully',
          entriesDeleted: statsBefore.totalEntries,
          correlationId: req.correlationId
        }
      });
    } catch (error: any) {
      logger.error('Failed to clear cache', error, { correlationId: req.correlationId });
      throw error;
    }
  }));

  // RAG: Health check endpoint
  router.get('/rag/health', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('rag-health');

    try {
      const healthStatus = await ragServiceFactory.getHealthStatus();

      res.json({
        success: true,
        data: healthStatus,
        correlationId: req.correlationId
      });
    } catch (error: any) {
      logger.error('RAG health check failed', error);
      throw error;
    }
  }));

  // RAG: Semantic search endpoint
  router.post('/rag/search', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('rag-search');

    if (!semanticSearchUseCase) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'RAG services not enabled. Set ENABLE_RAG=true and configure embedding/vector store services.',
          code: 'RAG_DISABLED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    const searchRequest = {
      query: req.body.query,
      limit: req.body.limit,
      minScore: req.body.minScore,
      videoId: req.body.videoId,
      videoIds: req.body.videoIds,
      timeRange: req.body.timeRange
    };

    logger.info('Processing semantic search request', {
      query: searchRequest.query,
      limit: searchRequest.limit,
      correlationId: req.correlationId
    });

    const result = await semanticSearchUseCase.execute(searchRequest);

    if (!result.success) {
      return res.status(400).json({
        ...result,
        correlationId: req.correlationId
      });
    }

    res.json({
      ...result,
      correlationId: req.correlationId
    });
  }));

  // RAG: Chat endpoint
  router.post('/rag/chat', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('rag-chat');

    if (!ragChatUseCase) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'RAG services not enabled. Set ENABLE_RAG=true and configure all RAG services (embedding, LLM, vector store).',
          code: 'RAG_DISABLED',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }

    const chatRequest = {
      query: req.body.query,
      videoId: req.body.videoId,
      videoIds: req.body.videoIds,
      maxContextChunks: req.body.maxContextChunks,
      temperature: req.body.temperature,
      maxTokens: req.body.maxTokens,
      conversationHistory: req.body.conversationHistory
    };

    logger.info('Processing RAG chat request', {
      query: chatRequest.query,
      maxContextChunks: chatRequest.maxContextChunks,
      correlationId: req.correlationId
    });

    const result = await ragChatUseCase.execute(chatRequest);

    if (!result.success) {
      return res.status(400).json({
        ...result,
        correlationId: req.correlationId
      });
    }

    res.json({
      ...result,
      correlationId: req.correlationId
    });
  }));

  // RAG: Chat streaming endpoint (SSE)
  router.post('/rag/chat/stream', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('rag-chat-stream');

    if (!ragChatUseCase) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'RAG services not enabled',
          code: 'RAG_DISABLED'
        }
      });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chatRequest = {
      query: req.body.query,
      videoId: req.body.videoId,
      videoIds: req.body.videoIds,
      maxContextChunks: req.body.maxContextChunks,
      temperature: req.body.temperature,
      maxTokens: req.body.maxTokens,
      conversationHistory: req.body.conversationHistory
    };

    logger.info('Processing RAG chat stream request', {
      query: chatRequest.query,
      correlationId: req.correlationId
    });

    try {
      for await (const chunk of ragChatUseCase.stream(chatRequest)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.end();
    } catch (error: any) {
      logger.error('RAG chat stream failed', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }));

  // RAG: Manual embedding endpoint (chunk + embed existing transcript)
  router.post('/rag/embed', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('rag-embed');

    if (!autoEmbedUseCase) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'RAG services not enabled',
          code: 'RAG_DISABLED'
        }
      });
    }

    const embedRequest = {
      videoId: req.body.videoId,
      videoUrl: req.body.videoUrl,
      videoTitle: req.body.videoTitle,
      segments: req.body.segments,
      chunkingOptions: req.body.chunkingOptions
    };

    if (!embedRequest.videoId || !embedRequest.videoUrl || !embedRequest.segments) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields: videoId, videoUrl, segments',
          code: 'INVALID_REQUEST'
        }
      });
    }

    logger.info('Processing manual embedding request', {
      videoId: embedRequest.videoId,
      segmentCount: embedRequest.segments.length,
      correlationId: req.correlationId
    });

    const result = await autoEmbedUseCase.execute(embedRequest);

    res.json({
      ...result,
      correlationId: req.correlationId
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

        // If extraction succeeded, return result even if client disconnected
        // The abort signal is handled by BrowserManager during extraction
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
        sendQueueFullError(res, req.correlationId, requestQueue);
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

  // Batch transcribe endpoint - accepts array of URLs
  router.post('/transcribe/batch', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('transcribe-batch');
    const startTime = Date.now();

    // Validate required fields before queueing
    const { urls, format } = req.body;

    if (!urls || !Array.isArray(urls)) {
      throw new MissingFieldError('urls (array)');
    }

    if (urls.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          message: 'URLs array cannot be empty',
          code: 'EMPTY_URLS_ARRAY',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
      return;
    }

    // Validate and cap batch size
    const MAX_BATCH_SIZE = parseInt(process.env.BATCH_MAX_SIZE || '50', 10);
    if (urls.length > MAX_BATCH_SIZE) {
      logger.warn('Batch size exceeds limit, capping to maximum', {
        requested: urls.length,
        capped: MAX_BATCH_SIZE,
        correlationId: req.correlationId
      });
    }

    if (format && !Object.values(TranscriptFormat).includes(format)) {
      throw new InvalidFormatError(format, Object.values(TranscriptFormat));
    }

    const request: BatchRequest = {
      urls: urls.slice(0, MAX_BATCH_SIZE),
      format: format as TranscriptFormat
    };

    logger.info('Queueing batch transcription', {
      urlCount: request.urls.length,
      originalUrlCount: urls.length,
      format: format || 'default',
      correlationId: req.correlationId,
      queueStats: requestQueue.getStats(),
      poolStats: browserPool.getStats()
    });

    try {
      // Queue the batch extraction task
      const result = await requestQueue.add(async () => {
        // Create AbortController to handle client disconnects
        const abortController = new AbortController();

        // Abort if client disconnects
        req.on('close', () => {
          logger.warn('Client disconnected - aborting batch extraction', {
            correlationId: req.correlationId
          });
          abortController.abort();
        });

        logger.info('Starting batch transcription from queue', {
          urlCount: request.urls.length,
          correlationId: req.correlationId
        });

        const batchResult = await batchTranscribeUseCase.execute(request, abortController.signal);
        return batchResult;
      });

      const duration = Date.now() - startTime;
      logger.metric('transcribe-batch', duration, {
        urlCount: request.urls.length,
        correlationId: req.correlationId,
        processedUrls: result.data?.processedUrls || 0,
        successfulExtractions: result.data?.successfulExtractions || 0
      });

      res.json(result);
    } catch (error: any) {
      // Handle queue-specific errors
      if (error.message === 'Queue is full. Please try again later.') {
        sendQueueFullError(res, req.correlationId, requestQueue);
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

  // SSE endpoint for batch progress streaming
  router.get('/transcribe/batch/progress/:jobId', (req: Request, res: Response) => {
    const logger = req.logger || new Logger('batch-progress-sse');
    const { jobId } = req.params;

    logger.info('SSE client connecting for batch progress', {
      jobId,
      correlationId: req.correlationId
    });

    progressStream.addClient(jobId, res);
  });

  // SSE endpoint for playlist progress streaming
  router.get('/transcribe/playlist/progress/:jobId', (req: Request, res: Response) => {
    const logger = req.logger || new Logger('playlist-progress-sse');
    const { jobId } = req.params;

    logger.info('SSE client connecting for playlist progress', {
      jobId,
      correlationId: req.correlationId
    });

    progressStream.addClient(jobId, res);
  });

  // Batch transcribe with streaming - returns jobId immediately, streams progress via SSE
  router.post('/transcribe/batch/stream', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('transcribe-batch-stream');

    // Validate required fields
    const { urls, format } = req.body;

    if (!urls || !Array.isArray(urls)) {
      throw new MissingFieldError('urls (array)');
    }

    if (urls.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          message: 'URLs array cannot be empty',
          code: 'EMPTY_URLS_ARRAY',
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
      return;
    }

    const MAX_BATCH_SIZE = parseInt(process.env.BATCH_MAX_SIZE || '50', 10);
    if (format && !Object.values(TranscriptFormat).includes(format)) {
      throw new InvalidFormatError(format, Object.values(TranscriptFormat));
    }

    const request: BatchRequest = {
      urls: urls.slice(0, MAX_BATCH_SIZE),
      format: format as TranscriptFormat
    };

    // Generate job ID and return it immediately
    const jobId = randomUUID();

    logger.info('Starting streaming batch transcription', {
      jobId,
      urlCount: request.urls.length,
      correlationId: req.correlationId
    });

    // Return job ID immediately so client can connect to SSE
    res.json({
      success: true,
      data: {
        jobId,
        sseEndpoint: `/api/transcribe/batch/progress/${jobId}`,
        totalUrls: request.urls.length,
        message: 'Connect to SSE endpoint for progress updates'
      }
    });

    // Create progress emitter for this job
    const progressEmitter = new ProgressEmitter(
      progressStream,
      jobId,
      'batch',
      request.urls.length
    );

    // Process in background (don't await)
    const abortController = new AbortController();
    batchTranscribeUseCase.execute(request, abortController.signal, progressEmitter)
      .catch(error => {
        logger.error('Streaming batch transcription failed', error, { jobId });
        progressEmitter.failed(error.message);
      });
  }));

  // Playlist transcribe with streaming
  router.post('/transcribe/playlist/stream', asyncHandler(async (req: Request, res: Response) => {
    const logger = req.logger || new Logger('transcribe-playlist-stream');

    const { url, format, maxVideos } = req.body;

    if (!url) {
      throw new MissingFieldError('url');
    }

    if (format && !Object.values(TranscriptFormat).includes(format)) {
      throw new InvalidFormatError(format, Object.values(TranscriptFormat));
    }

    const MAX_VIDEOS_LIMIT = parseInt(process.env.PLAYLIST_MAX_VIDEOS_LIMIT || '100', 10);
    const request: PlaylistRequest = {
      url,
      format: format as TranscriptFormat,
      maxVideos: Math.min(maxVideos || 100, MAX_VIDEOS_LIMIT)
    };

    // Generate job ID and return it immediately
    const jobId = randomUUID();

    logger.info('Starting streaming playlist transcription', {
      jobId,
      playlistUrl: url,
      maxVideos: request.maxVideos,
      correlationId: req.correlationId
    });

    // Return job ID immediately so client can connect to SSE
    res.json({
      success: true,
      data: {
        jobId,
        sseEndpoint: `/api/transcribe/playlist/progress/${jobId}`,
        message: 'Connect to SSE endpoint for progress updates'
      }
    });

    // Create progress emitter for this job
    const progressEmitter = new ProgressEmitter(
      progressStream,
      jobId,
      'playlist',
      request.maxVideos || 100
    );

    // Process in background (don't await)
    const abortController = new AbortController();
    transcribePlaylistUseCase.execute(request, abortController.signal, progressEmitter)
      .catch(error => {
        logger.error('Streaming playlist transcription failed', error, { jobId });
        progressEmitter.failed(error.message);
      });
  }));

  // Cleanup on shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received - graceful shutdown initiated');
    if (cacheEvictionService) {
      logger.info('Stopping cache eviction service');
      cacheEvictionService.stop();
    }
    await shutdownSharedPool();
    if (repositoryFactory) {
      logger.info('Closing database connections');
      repositoryFactory.close();
    }
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received - graceful shutdown initiated');
    if (cacheEvictionService) {
      logger.info('Stopping cache eviction service');
      cacheEvictionService.stop();
    }
    await shutdownSharedPool();
    if (repositoryFactory) {
      logger.info('Closing database connections');
      repositoryFactory.close();
    }
  });

  return { router, requestQueue, browserPool, progressStream, repositoryFactory, cacheEvictionService };
}