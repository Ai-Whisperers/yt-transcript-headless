import { TranscriptSegment, TranscriptFormat } from './TranscriptSegment';

export interface PlaylistRequest {
  url: string;
  format?: TranscriptFormat;
  maxVideos?: number; // Optional limit on number of videos to process
}

export interface VideoTranscriptResult {
  videoId: string;
  videoUrl: string;
  videoTitle?: string;         // Optional video title for display
  success: boolean;
  transcript?: TranscriptSegment[];
  error?: {
    message: string;
    code: string;
  };
  extractedAt?: string;
}

/**
 * Response model for playlist extraction
 * NOTE: This is the CANONICAL type - infrastructure MUST return this exact shape
 */
export interface PlaylistResponse {
  success: boolean;
  data?: {
    playlistId: string;
    playlistUrl: string;
    playlistTitle?: string;
    totalVideos: number;
    processedVideos: number;
    successfulExtractions: number;
    failedExtractions: number;
    results: VideoTranscriptResult[];
    format: TranscriptFormat;
    extractedAt: string;
  };
  error?: {
    message: string;
    code: string;
    timestamp: string;           // ISO 8601 timestamp of when error occurred
    correlationId?: string;      // Request correlation ID for tracing
    context?: any;               // Optional additional error context
  };
}
