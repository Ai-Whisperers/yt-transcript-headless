import { AppError } from './AppError';

/**
 * Validation error for invalid input
 */
export class ValidationError extends AppError {
  constructor(message: string, code: string = 'VALIDATION_ERROR', context?: Record<string, any>) {
    super(message, code, 400, true, context);
    this.name = 'ValidationError';
  }
}

/**
 * Invalid YouTube URL error
 */
export class InvalidUrlError extends AppError {
  constructor(url: string) {
    super('Invalid YouTube URL format', 'INVALID_URL', 400, true, {
      providedUrl: url,
      expectedFormats: ['youtube.com/watch?v=...', 'youtu.be/...']
    });
    this.name = 'InvalidUrlError';
  }
}

/**
 * Missing required field error
 */
export class MissingFieldError extends AppError {
  constructor(fieldName: string) {
    super(`Missing required field: ${fieldName}`, 'MISSING_FIELD', 400, true, {
      field: fieldName
    });
    this.name = 'MissingFieldError';
  }
}

/**
 * Invalid format error
 */
export class InvalidFormatError extends AppError {
  constructor(providedFormat: string, validFormats: string[]) {
    super(`Invalid format: ${providedFormat}`, 'INVALID_FORMAT', 400, true, {
      providedFormat,
      validFormats
    });
    this.name = 'InvalidFormatError';
  }
}
