import { Router, Request, Response, NextFunction } from 'express';
import { TranscribeVideoUseCase } from '../application/TranscribeVideoUseCase';
import { TranscriptExtractor } from './TranscriptExtractor';
import { BrowserManager } from './BrowserManager';
import { Logger } from './Logger';
import { TranscriptRequest, TranscriptFormat } from '../domain/TranscriptSegment';

export function createRouter(): Router {
  const router = Router();
  const logger = new Logger('api-routes');
  const browserLogger = new Logger('browser-manager');
  const browserManager = new BrowserManager(browserLogger);
  const extractor = new TranscriptExtractor(browserManager, logger);
  const transcribeUseCase = new TranscribeVideoUseCase(extractor, logger);

  // Health check endpoint
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'yt-transcript-api'
    });
  });

  // Main transcribe endpoint
  router.post('/transcribe', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, format } = req.body;

      // Validate required fields
      if (!url) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'URL is required',
            code: 'MISSING_URL'
          }
        });
      }

      // Validate format if provided
      if (format && !Object.values(TranscriptFormat).includes(format)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid format. Must be one of: ${Object.values(TranscriptFormat).join(', ')}`,
            code: 'INVALID_FORMAT'
          }
        });
      }

      const request: TranscriptRequest = {
        url,
        format: format as TranscriptFormat
      };

      logger.info(`Received transcribe request for: ${url}`);

      const result = await transcribeUseCase.execute(request);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      logger.error('Unexpected error in transcribe endpoint', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  });

  // Get supported formats
  router.get('/formats', (req: Request, res: Response) => {
    res.json({
      formats: Object.values(TranscriptFormat),
      default: TranscriptFormat.JSON
    });
  });

  // Cleanup on shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing browser...');
    await browserManager.close();
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, closing browser...');
    await browserManager.close();
  });

  return router;
}