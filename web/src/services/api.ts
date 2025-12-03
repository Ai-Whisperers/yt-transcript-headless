import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface TranscriptSegment {
  time: string;
  text: string;
}

export enum TranscriptFormat {
  JSON = 'json',
  SRT = 'srt',
  TEXT = 'text'
}

export interface TranscriptRequest {
  url: string;
  format?: TranscriptFormat;
}

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

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    timestamp: string;
    correlationId?: string;
    context?: any;
  };
}

export interface PlaylistRequest {
  url: string;
  format?: TranscriptFormat;
  maxVideos?: number;
}

export interface VideoTranscriptResult {
  videoId: string;
  videoUrl: string;
  videoTitle?: string;
  success: boolean;
  transcript?: TranscriptSegment[];
  error?: {
    message: string;
    code: string;
  };
  extractedAt?: string; // Added to match backend canonical type
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
    timestamp: string;
    correlationId?: string;
  };
}

// Batch types for processing arrays of URLs
export interface BatchRequest {
  urls: string[];
  format?: TranscriptFormat;
}

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

export interface HealthResponse {
  status: string;
  timestamp: string;
  service: string; // Backend canonical field
  uptime: number;
  memory: {
    raw: NodeJS.MemoryUsage; // Backend canonical field
    heapUsedMB: number; // Backend canonical field
    heapTotalMB: number; // Backend canonical field
    externalMB: number; // Backend canonical field
    rssMB: number; // Backend canonical field
    usagePercent: number; // Backend canonical field (not 'percentage')
  };
  queue: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
    totalProcessed: number; // Backend canonical field
    queueSize: number;
  };
  correlationId: string;
}

export interface BrowserHealthResponse {
  browserHealthy: boolean;
  chromiumVersion: string | null;
  canLaunch: boolean;
  lastChecked: string;
  error?: string;
}

export interface MetricsResponse {
  success: boolean;
  data?: {
    requests: Record<string, number>;
    errors: Record<string, number>;
    latencies: Record<string, {
      count: number;
      min: number;
      max: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    }>;
    queue: {
      pending: number;
      active: number;
      completed: number;
      failed: number;
    };
    timestamp: string;
    correlationId: string;
  };
}

class TranscriptAPI {
  private client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 120000, // 120 seconds timeout (2 minutes for longer videos)
    headers: {
      'Content-Type': 'application/json',
    },
  });

  async extractTranscript(request: TranscriptRequest): Promise<TranscriptResponse | ErrorResponse> {
    const correlationId = crypto.randomUUID();

    try {
      const response = await this.client.post<TranscriptResponse | ErrorResponse>(
        '/transcribe',
        request,
        {
          headers: {
            'X-Correlation-ID': correlationId
          }
        }
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        return error.response.data;
      }
      return {
        success: false,
        error: {
          message: error.message || 'Network error occurred',
          code: 'NETWORK_ERROR',
          timestamp: new Date().toISOString(),
          correlationId
        },
      };
    }
  }

  async getFormats(): Promise<{ formats: TranscriptFormat[]; default: TranscriptFormat }> {
    try {
      const response = await this.client.get('/formats');
      return response.data.data;
    } catch (error) {
      return {
        formats: Object.values(TranscriptFormat),
        default: TranscriptFormat.JSON,
      };
    }
  }

  async checkHealth(): Promise<HealthResponse | null> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch {
      return null;
    }
  }

  async extractPlaylist(request: PlaylistRequest): Promise<PlaylistResponse> {
    const correlationId = crypto.randomUUID();

    try {
      const response = await this.client.post<PlaylistResponse>(
        '/transcribe/playlist',
        request,
        {
          headers: { 'X-Correlation-ID': correlationId },
          timeout: 300000 // 5 minutes for playlists
        }
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.data) return error.response.data;

      return {
        success: false,
        error: {
          message: error.message || 'Network error',
          code: 'NETWORK_ERROR',
          timestamp: new Date().toISOString(),
          correlationId
        }
      };
    }
  }

  async extractBatch(request: BatchRequest): Promise<BatchResponse> {
    const correlationId = crypto.randomUUID();

    try {
      const response = await this.client.post<BatchResponse>(
        '/transcribe/batch',
        request,
        {
          headers: { 'X-Correlation-ID': correlationId },
          timeout: 600000 // 10 minutes for batch operations
        }
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.data) return error.response.data;

      return {
        success: false,
        error: {
          message: error.message || 'Network error',
          code: 'NETWORK_ERROR',
          timestamp: new Date().toISOString(),
          correlationId
        }
      };
    }
  }

  async checkBrowserHealth(): Promise<BrowserHealthResponse> {
    try {
      const response = await this.client.get('/health/browser');
      return response.data;
    } catch (error: any) {
      return {
        browserHealthy: false,
        chromiumVersion: null,
        canLaunch: false,
        lastChecked: new Date().toISOString(),
        error: error.message || 'Failed to check browser health'
      };
    }
  }

  async getMetrics(): Promise<MetricsResponse> {
    try {
      const response = await this.client.get('/metrics');
      return { success: true, data: response.data.data };
    } catch (error: any) {
      return {
        success: false,
        data: undefined
      };
    }
  }
}

export const api = new TranscriptAPI();