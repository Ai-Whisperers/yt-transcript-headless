/**
 * Error Display Component
 * Presentational component for displaying error messages
 * Follows Single Responsibility Principle: Only renders error UI
 */

import { ErrorResponse } from '../services/api';
import { getErrorMessage } from '../utils/errorMessages';

interface ErrorDisplayProps {
  error: ErrorResponse['error'];
}

export function ErrorDisplay({ error }: ErrorDisplayProps) {
  const errorInfo = getErrorMessage(error.code);

  return (
    <div className="error">
      <div>
        <h3 className="error-title">{errorInfo.title}</h3>
        <p className="error-message">{errorInfo.message}</p>
        {errorInfo.suggestion && (
          <p className="error-suggestion">💡 {errorInfo.suggestion}</p>
        )}
        {error.timestamp && (
          <p className="error-meta">
            Error occurred at: {new Date(error.timestamp).toLocaleString()}
          </p>
        )}
        {error.correlationId && (
          <p className="error-meta">
            Correlation ID: {error.correlationId}
          </p>
        )}
      </div>
    </div>
  );
}
