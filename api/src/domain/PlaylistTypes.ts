import { TranscriptSegment, TranscriptFormat } from './TranscriptSegment';

export interface PlaylistRequest {
  url: string;
  format?: TranscriptFormat;
  maxVideos?: number; // Optional limit on number of videos to process
}

export interface VideoTranscriptResult {
  videoId: string;
  videoUrl: string;
  success: boolean;
  transcript?: TranscriptSegment[];
  error?: {
    message: string;
    code: string;
  };
  extractedAt?: string;
}

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
    details?: any;
  };
}
