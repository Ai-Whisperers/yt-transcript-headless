import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { createRouter } from './infrastructure/routes';
import { Logger } from './infrastructure/Logger';

// Load environment variables
dotenv.config();

// Initialize logger
const logger = new Logger('server');

// Create Express app
const app = express();

// Security middleware
// Configure helmet based on environment
const isDevelopment = process.env.NODE_ENV === 'development';
app.use(helmet({
  hsts: isDevelopment ? false : undefined, // Disable HTTPS redirect in development
  contentSecurityPolicy: false // Disable CSP for Swagger UI to work
}));

// CORS configuration - fail fast in production if not set
const corsOrigin = process.env.CORS_ORIGIN || (isDevelopment ? 'http://localhost:5173' : undefined);
if (!corsOrigin && !isDevelopment) {
  logger.error('CORS_ORIGIN environment variable must be set in production');
  process.exit(1);
}

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-Correlation-ID'],
  exposedHeaders: ['X-Correlation-ID']
}));

// Rate limiting for single video transcription
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 minute default
  max: parseInt(process.env.RATE_LIMIT_MAX || '10'), // 10 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for playlist endpoint (more resource intensive)
const playlistLimiter = rateLimit({
  windowMs: parseInt(process.env.PLAYLIST_RATE_LIMIT_WINDOW || '300000'), // 5 minutes default
  max: parseInt(process.env.PLAYLIST_RATE_LIMIT_MAX || '3'), // 3 requests per window
  message: 'Too many playlist requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/transcribe/playlist', playlistLimiter);
app.use('/api/transcribe', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Observability middleware
import {
  correlationIdMiddleware,
  requestContextMiddleware,
  requestLoggingMiddleware,
  metricsMiddleware,
  errorHandler,
  notFoundHandler
} from './infrastructure/middleware';

app.use(correlationIdMiddleware);
app.use(requestContextMiddleware(logger));
app.use(requestLoggingMiddleware);
app.use(metricsMiddleware);

// Load Swagger documentation
const swaggerDocument = YAML.load(path.join(__dirname, 'infrastructure', 'swagger.yaml'));

// Swagger UI setup with custom options
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'YouTube Transcript API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
  }
}));

// API routes
const { router, requestQueue } = createRouter();
app.use('/api', router);

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, '..', 'public');

  // Serve static files
  app.use(express.static(publicPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Don't serve index.html for API routes or API docs
    if (req.path.startsWith('/api') || req.path.startsWith('/api-docs')) {
      return next();
    }

    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  // Root endpoint for development
  app.get('/', (req, res) => {
    res.json({
      name: 'YouTube Transcript Extraction API',
      version: '1.0.0',
      documentation: 'GET /api-docs',
      endpoints: {
        health: 'GET /api/health',
        transcribe: 'POST /api/transcribe',
        formats: 'GET /api/formats'
      }
    });
  });
}

// 404 handler for API routes only (frontend routes handled by SPA fallback)
app.use('/api', notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler(logger));

// Start server
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Starting graceful shutdown...');

  // Drain the request queue first (wait for in-flight browser operations)
  try {
    logger.info('Draining request queue...');
    await requestQueue.drain();
    logger.info('Request queue drained successfully');
  } catch (error) {
    logger.error('Error draining request queue', error instanceof Error ? error : new Error(String(error)));
  }

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;