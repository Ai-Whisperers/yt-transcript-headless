import { AppError } from './errors';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  videoUrl?: string;
  operation?: string;
  duration?: number;
  [key: string]: any;
}

/**
 * Logger interface for domain and application layers
 * Defines logging contract without coupling to infrastructure
 */
export interface ILogger {
  /**
   * Create child logger with additional context
   */
  child(context: LogContext): ILogger;

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log error message with structured error information
   */
  error(message: string, error?: Error | AppError, context?: LogContext): void;

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log performance metric
   */
  metric(operation: string, duration: number, context?: LogContext): void;

  /**
   * Log HTTP request
   */
  httpRequest(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void;
}
