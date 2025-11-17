import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '../../src/utils/errorMessages';

describe('errorMessages', () => {
  describe('getErrorMessage', () => {
    it('returns correct error info for INVALID_URL', () => {
      const result = getErrorMessage('INVALID_URL');
      expect(result.title).toBe('Invalid URL');
      expect(result.message).toBe('The YouTube URL format is incorrect.');
      expect(result.suggestion).toContain('https://www.youtube.com/watch?v=');
    });

    it('returns correct error info for NO_TRANSCRIPT', () => {
      const result = getErrorMessage('NO_TRANSCRIPT');
      expect(result.title).toBe('No Transcript Available');
      expect(result.message).toContain('does not have transcripts/captions');
      expect(result.suggestion).toContain('different video');
    });

    it('returns correct error info for EXTRACTION_FAILED', () => {
      const result = getErrorMessage('EXTRACTION_FAILED');
      expect(result.title).toBe('Extraction Failed');
      expect(result.message).toContain('Failed to extract transcript');
      expect(result.suggestion).toBeDefined();
    });

    it('returns correct error info for RATE_LIMIT_EXCEEDED', () => {
      const result = getErrorMessage('RATE_LIMIT_EXCEEDED');
      expect(result.title).toBe('Rate Limit Exceeded');
      expect(result.message).toContain('Too many requests');
      expect(result.suggestion).toContain('Wait');
    });

    it('returns correct error info for QUEUE_FULL', () => {
      const result = getErrorMessage('QUEUE_FULL');
      expect(result.title).toBe('Service at Capacity');
      expect(result.message).toContain('maximum number of requests');
      expect(result.suggestion).toContain('try again');
    });

    it('returns correct error info for QUEUE_TIMEOUT', () => {
      const result = getErrorMessage('QUEUE_TIMEOUT');
      expect(result.title).toBe('Request Timeout');
      expect(result.message).toContain('timed out');
      expect(result.suggestion).toBeDefined();
    });

    it('returns correct error info for NETWORK_ERROR', () => {
      const result = getErrorMessage('NETWORK_ERROR');
      expect(result.title).toBe('Network Error');
      expect(result.message).toContain('connect to the API');
      expect(result.suggestion).toContain('backend is running');
    });

    it('returns default error for unknown code', () => {
      const result = getErrorMessage('UNKNOWN_ERROR_CODE');
      expect(result.title).toBe('Error');
      expect(result.message).toBe('An unexpected error occurred.');
      expect(result.suggestion).toBeUndefined();
    });
  });
});
