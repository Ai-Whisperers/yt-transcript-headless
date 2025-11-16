export interface ErrorInfo {
  title: string;
  message: string;
  suggestion?: string;
}

export function getErrorMessage(errorCode: string): ErrorInfo {
  switch (errorCode) {
    case 'INVALID_URL':
      return {
        title: 'Invalid URL',
        message: 'The YouTube URL format is incorrect.',
        suggestion: 'Use: https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID'
      };

    case 'NO_TRANSCRIPT':
      return {
        title: 'No Transcript Available',
        message: 'This video does not have transcripts/captions enabled.',
        suggestion: 'Try a different video with captions.'
      };

    case 'EXTRACTION_FAILED':
      return {
        title: 'Extraction Failed',
        message: 'Failed to extract transcript from this video.',
        suggestion: 'Please try again or use a different video.'
      };

    case 'RATE_LIMIT_EXCEEDED':
      return {
        title: 'Rate Limit Exceeded',
        message: 'Too many requests. Please slow down.',
        suggestion: 'Wait a few minutes before trying again.'
      };

    case 'QUEUE_FULL':
      return {
        title: 'Service at Capacity',
        message: 'The service is currently processing the maximum number of requests.',
        suggestion: 'Please try again in a few minutes.'
      };

    case 'QUEUE_TIMEOUT':
      return {
        title: 'Request Timeout',
        message: 'Your request timed out while waiting in queue.',
        suggestion: 'The service is busy. Please retry shortly.'
      };

    case 'NETWORK_ERROR':
      return {
        title: 'Network Error',
        message: 'Unable to connect to the API service.',
        suggestion: 'Please check your internet connection and ensure the backend is running.'
      };

    default:
      return {
        title: 'Error',
        message: 'An unexpected error occurred.'
      };
  }
}
