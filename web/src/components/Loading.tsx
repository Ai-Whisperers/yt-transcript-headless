/**
 * Loading Component
 * Presentational component for loading state
 * Follows Single Responsibility Principle: Only renders loading UI
 */

import { APP_TEXT } from '../constants/text';

export function Loading() {
  return (
    <div className="loading">
      <span className="spinner"></span>
      <span>{APP_TEXT.STATUS_LOADING}</span>
    </div>
  );
}
