import { AppError } from './AppError';

/**
 * Base operational error for expected failures
 */
export class OperationalError extends AppError {
  constructor(message: string, code: string, statusCode: number = 500, context?: Record<string, any>) {
    super(message, code, statusCode, true, context);
    this.name = 'OperationalError';
  }
}

/**
 * Transcript not found error
 */
export class TranscriptNotFoundError extends OperationalError {
  constructor(videoUrl: string) {
    super('No transcript available for this video', 'NO_TRANSCRIPT', 404, {
      videoUrl,
      possibleReasons: [
        'Video has no captions',
        'Video is private or unavailable',
        'Transcript feature disabled by uploader'
      ]
    });
    this.name = 'TranscriptNotFoundError';
  }
}

/**
 * Extraction failed error
 */
export class ExtractionFailedError extends OperationalError {
  constructor(message: string, videoUrl: string, attempt?: number, context?: Record<string, any>) {
    super(message, 'EXTRACTION_FAILED', 500, {
      videoUrl,
      ...(attempt && { attempt }),
      ...context
    });
    this.name = 'ExtractionFailedError';
  }
}

/**
 * Browser error
 */
export class BrowserError extends OperationalError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'BROWSER_ERROR', 500, context);
    this.name = 'BrowserError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends OperationalError {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation timed out: ${operation}`, 'TIMEOUT', 408, {
      operation,
      timeoutMs
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends OperationalError {
  constructor(retryAfter?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429, {
      ...(retryAfter && { retryAfter })
    });
    this.name = 'RateLimitError';
  }
}
