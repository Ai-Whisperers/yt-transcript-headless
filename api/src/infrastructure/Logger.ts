import winston from 'winston';
import { AppError } from '../domain/errors';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  videoUrl?: string;
  operation?: string;
  duration?: number;
  [key: string]: any;
}

export class Logger {
  private logger: winston.Logger;
  private service: string;
  private defaultContext: LogContext;

  constructor(service: string = 'yt-transcript-api', defaultContext: LogContext = {}) {
    this.service = service;
    this.defaultContext = defaultContext;

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.metadata({ fillExcept: ['timestamp', 'level', 'message', 'service'] }),
        winston.format.json()
      ),
      defaultMeta: { service },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, service, metadata }) => {
              const meta = metadata && Object.keys(metadata).length > 0
                ? `\n${JSON.stringify(metadata, null, 2)}`
                : '';
              return `${timestamp} [${service}] ${level}: ${message}${meta}`;
            })
          )
        })
      ]
    });

    // Add file transport in production
    if (process.env.NODE_ENV === 'production') {
      this.logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }));
      this.logger.add(new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }));
    }
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogContext): Logger {
    return new Logger(this.service, { ...this.defaultContext, ...context });
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    this.logger.info(message, this.mergeContext(context));
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, this.mergeContext(context));
  }

  /**
   * Log error message with structured error information
   */
  error(message: string, error?: Error | AppError, context?: LogContext): void {
    const errorContext = this.extractErrorContext(error);
    this.logger.error(message, this.mergeContext({ ...context, ...errorContext }));
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, this.mergeContext(context));
  }

  /**
   * Log performance metric
   */
  metric(operation: string, duration: number, context?: LogContext): void {
    this.logger.info(`Performance: ${operation}`, this.mergeContext({
      ...context,
      operation,
      duration,
      metric: true
    }));
  }

  /**
   * Log HTTP request
   */
  httpRequest(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void {
    this.logger.info(`HTTP ${method} ${path} ${statusCode}`, this.mergeContext({
      ...context,
      method,
      path,
      statusCode,
      duration,
      httpRequest: true
    }));
  }

  /**
   * Merge context with default context
   */
  private mergeContext(context?: LogContext): LogContext {
    return { ...this.defaultContext, ...context };
  }

  /**
   * Extract structured error information
   */
  private extractErrorContext(error?: Error | AppError): Record<string, any> {
    if (!error) return {};

    const context: Record<string, any> = {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    };

    if (error instanceof AppError) {
      context.errorCode = error.code;
      context.errorStatusCode = error.statusCode;
      context.errorIsOperational = error.isOperational;
      context.errorTimestamp = error.timestamp;
      if (error.context) {
        context.errorContext = error.context;
      }
    }

    return context;
  }
}