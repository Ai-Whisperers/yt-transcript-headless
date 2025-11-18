/**
 * UI Text Constants
 * Centralized text content following Clean Architecture principles
 * Separates content from presentation logic
 */

export const APP_TEXT = {
  // Header
  TITLE: 'YouTube Transcript Extractor',

  // Mode Selection
  MODE_SINGLE: 'Single Video',
  MODE_PLAYLIST: 'Playlist',

  // Form Labels
  LABEL_URL: 'YouTube URL',
  LABEL_FORMAT: 'Output Format:',
  LABEL_MAX_VIDEOS: 'Max Videos (1-100):',

  // Placeholders
  PLACEHOLDER_SINGLE_VIDEO: 'https://www.youtube.com/watch?v=...',
  PLACEHOLDER_PLAYLIST: 'https://www.youtube.com/playlist?list=...',

  // Buttons
  BUTTON_EXTRACT: 'Extract Transcript',
  BUTTON_EXTRACTING: 'Extracting...',
  BUTTON_COPY: 'Copy to Clipboard',
  BUTTON_DOWNLOAD: 'Download',
  BUTTON_VIEW_TRANSCRIPT: 'View Transcript',
  BUTTON_HIDE_TRANSCRIPT: 'Hide Transcript',

  // Status Messages
  STATUS_HEALTHY: '✓ API Healthy',
  STATUS_UNHEALTHY: '✗ API Unhealthy',
  STATUS_UPTIME: 'Uptime',
  STATUS_MEMORY: 'Memory',
  STATUS_LOADING: 'Processing...',

  // Results
  RESULT_TITLE_SINGLE: 'Transcript Extracted',
  RESULT_TITLE_PLAYLIST: 'Playlist:',
  RESULT_VIDEO: 'Video:',
  RESULT_PLAYLIST_URL: 'Playlist URL:',
  RESULT_EXTRACTED_AT: 'Extracted at:',
  RESULT_TOTAL_SEGMENTS: 'Total segments:',
  RESULT_TOTAL_VIDEOS: 'Total videos:',
  RESULT_PROCESSED_VIDEOS: 'Processed videos:',
  RESULT_SUCCESSFUL: 'Successful:',
  RESULT_FAILED: 'Failed:',
  RESULT_UNTITLED_PLAYLIST: 'Untitled Playlist',
  RESULT_NO_TITLE: 'No title',

  // Footer
  FOOTER_TEXT: '© 2025 YouTube Transcript Extractor API',

  // Errors (fallback - detailed errors come from error utility)
  ERROR_GENERIC: 'An error occurred. Please try again.',
  ERROR_LOADING: 'Failed to load application. Using fallback configuration.',
} as const;

export type AppText = typeof APP_TEXT;
