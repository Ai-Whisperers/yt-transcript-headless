import { TranscriptSegment, TranscriptFormat } from './TranscriptSegment';

/**
 * Request model for batch URL transcript extraction
 * Accepts an array of arbitrary YouTube URLs for batch processing
 */
export interface BatchRequest {
  urls: string[];
  format?: TranscriptFormat;
  concurrency?: number;  // Optional limit for parallel processing (default: 3)
}

/**
 * Result for a single video in a batch operation
 */
export interface BatchVideoResult {
  videoId: string;
  videoUrl: string;
  videoTitle?: string;
  success: boolean;
  transcript?: TranscriptSegment[];
  srt?: string;
  text?: string;
  error?: {
    message: string;
    code: string;
  };
  extractedAt?: string;
  processingTimeMs?: number;
}

/**
 * Response model for batch extraction
 * NOTE: This is the CANONICAL type - infrastructure MUST return this exact shape
 */
export interface BatchResponse {
  success: boolean;
  data?: {
    batchId: string;
    totalUrls: number;
    processedUrls: number;
    successfulExtractions: number;
    failedExtractions: number;
    results: BatchVideoResult[];
    format: TranscriptFormat;
    startedAt: string;
    completedAt: string;
    totalProcessingTimeMs: number;
  };
  error?: {
    message: string;
    code: string;
    timestamp: string;
    correlationId?: string;
    context?: any;
  };
}

/**
 * Progress update for batch operations (for future SSE/WebSocket support)
 */
export interface BatchProgressUpdate {
  batchId: string;
  currentIndex: number;
  totalUrls: number;
  currentUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: BatchVideoResult;
}
