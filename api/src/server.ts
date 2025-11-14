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
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 minute default
  max: parseInt(process.env.RATE_LIMIT_MAX || '10'), // 10 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/transcribe', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

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
app.use('/api', createRouter());

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
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'API endpoint not found',
      code: 'NOT_FOUND'
    }
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }
  });
});

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