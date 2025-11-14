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
    details?: any;
  };
}

class TranscriptAPI {
  private client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 60000, // 60 seconds timeout
    headers: {
      'Content-Type': 'application/json',
    },
  });

  async extractTranscript(request: TranscriptRequest): Promise<TranscriptResponse | ErrorResponse> {
    try {
      const response = await this.client.post<TranscriptResponse | ErrorResponse>('/transcribe', request);
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
        },
      };
    }
  }

  async getFormats(): Promise<{ formats: TranscriptFormat[]; default: TranscriptFormat }> {
    try {
      const response = await this.client.get('/formats');
      return response.data;
    } catch (error) {
      return {
        formats: Object.values(TranscriptFormat),
        default: TranscriptFormat.JSON,
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'healthy';
    } catch {
      return false;
    }
  }
}

export const api = new TranscriptAPI();