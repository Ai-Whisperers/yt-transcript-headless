/**
 * Base application error class for structured error handling
 */
export abstract class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this);
  }

  toJSON(correlationId?: string) {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
        timestamp: this.timestamp,
        ...(correlationId && { correlationId }),
        ...(this.context && { context: this.context })
      }
    };
  }
}
