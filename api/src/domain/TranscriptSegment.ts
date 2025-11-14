/**
 * Domain model for a transcript segment
 */
export interface TranscriptSegment {
  time: string;
  text: string;
}

/**
 * Supported output formats for transcripts
 */
export enum TranscriptFormat {
  JSON = 'json',
  SRT = 'srt',
  TEXT = 'text'
}

/**
 * Request model for transcript extraction
 */
export interface TranscriptRequest {
  url: string;
  format?: TranscriptFormat;
}

/**
 * Response model for successful transcript extraction
 */
export interface TranscriptResponse {
  success: true;
  data: {
    transcript: TranscriptSegment[];
    format: TranscriptFormat;
    videoUrl: string;
    extractedAt: string;
    srt?: string;
    text?: string;
  };
}

/**
 * Response model for extraction errors
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: any;
  };
}

/**
 * Extraction result type
 */
export type ExtractionResult = TranscriptResponse | ErrorResponse;