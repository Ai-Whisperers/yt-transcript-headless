import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { api, TranscriptFormat } from '../../src/services/api';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('TranscriptAPI', () => {
  beforeEach(() => {
    // Reset mocks and modules before each test
    vi.clearAllMocks();
    vi.resetModules();

    // Mock crypto.randomUUID using vi.stubGlobal
    vi.stubGlobal('crypto', {
      randomUUID: () => 'test-correlation-id-123'
    });

    // Setup axios.create mock
    mockedAxios.create = vi.fn().mockReturnValue({
      post: vi.fn(),
      get: vi.fn()
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('extractTranscript', () => {
    it('sends POST /transcribe with correlation ID header', async () => {
      const mockAxiosInstance = {
        post: vi.fn().mockResolvedValue({
          data: {
            success: true,
            data: {
              transcript: [],
              format: 'json',
              videoUrl: 'https://youtube.com/watch?v=test',
              extractedAt: new Date().toISOString()
            }
          }
        }),
        get: vi.fn()
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      // Need to re-import api after mocking
      const { api: freshApi } = await import('../../src/services/api');

      await freshApi.extractTranscript({
        url: 'https://youtube.com/watch?v=test',
        format: TranscriptFormat.JSON
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/transcribe',
        { url: 'https://youtube.com/watch?v=test', format: 'json' },
        expect.objectContaining({
          headers: {
            'X-Correlation-ID': expect.any(String)
          }
        })
      );
    });

    it('returns success response correctly', async () => {
      const mockResponse = {
        success: true,
        data: {
          transcript: [{ time: '0:00', text: 'Test' }],
          format: 'json' as TranscriptFormat,
          videoUrl: 'https://youtube.com/watch?v=test',
          extractedAt: new Date().toISOString()
        }
      };

      const mockAxiosInstance = {
        post: vi.fn().mockResolvedValue({ data: mockResponse }),
        get: vi.fn()
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.extractTranscript({
        url: 'https://youtube.com/watch?v=test'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transcript).toHaveLength(1);
      }
    });

    it('returns error response correctly', async () => {
      const mockErrorResponse = {
        success: false,
        error: {
          message: 'Invalid URL',
          code: 'INVALID_URL',
          timestamp: new Date().toISOString()
        }
      };

      const mockAxiosInstance = {
        post: vi.fn().mockRejectedValue({
          response: { data: mockErrorResponse }
        }),
        get: vi.fn()
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.extractTranscript({
        url: 'invalid-url'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_URL');
      }
    });

    it('catches network errors and returns NETWORK_ERROR', async () => {
      const mockAxiosInstance = {
        post: vi.fn().mockRejectedValue(new Error('Network error')),
        get: vi.fn()
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.extractTranscript({
        url: 'https://youtube.com/watch?v=test'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NETWORK_ERROR');
        expect(result.error.correlationId).toBeDefined();
      }
    });
  });

  describe('extractPlaylist', () => {
    it('sends POST /transcribe/playlist with correlation ID and 5min timeout', async () => {
      const mockAxiosInstance = {
        post: vi.fn().mockResolvedValue({
          data: {
            success: true,
            data: {
              playlistId: 'PLtest',
              playlistUrl: 'https://youtube.com/playlist?list=PLtest',
              totalVideos: 3,
              processedVideos: 3,
              successfulExtractions: 3,
              failedExtractions: 0,
              results: [],
              format: 'json',
              extractedAt: new Date().toISOString()
            }
          }
        }),
        get: vi.fn()
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      await freshApi.extractPlaylist({
        url: 'https://youtube.com/playlist?list=PLtest',
        maxVideos: 10
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/transcribe/playlist',
        expect.any(Object),
        expect.objectContaining({
          timeout: 300000,
          headers: { 'X-Correlation-ID': expect.any(String) }
        })
      );
    });
  });

  describe('checkHealth', () => {
    it('returns full HealthResponse object on success', async () => {
      const mockHealthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'yt-transcript-api',
        uptime: 12345,
        memory: {
          raw: { rss: 100000000, heapTotal: 50000000, heapUsed: 40000000, external: 1000000, arrayBuffers: 500000 },
          heapUsedMB: 38.15,
          heapTotalMB: 47.68,
          externalMB: 0.95,
          rssMB: 95.37,
          usagePercent: 10.5
        },
        queue: { pending: 0, active: 0, completed: 10, failed: 0, totalProcessed: 10, queueSize: 0 },
        correlationId: 'test-id'
      };

      const mockAxiosInstance = {
        post: vi.fn(),
        get: vi.fn().mockResolvedValue({ data: mockHealthData })
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.checkHealth();

      expect(result).toEqual(mockHealthData);
      expect(result?.queue).toBeDefined();
    });

    it('returns null on failure', async () => {
      const mockAxiosInstance = {
        post: vi.fn(),
        get: vi.fn().mockRejectedValue(new Error('Network error'))
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.checkHealth();

      expect(result).toBeNull();
    });
  });

  describe('checkBrowserHealth', () => {
    it('returns BrowserHealthResponse on success', async () => {
      const mockBrowserHealth = {
        browserHealthy: true,
        chromiumVersion: '120.0.0',
        canLaunch: true,
        lastChecked: new Date().toISOString()
      };

      const mockAxiosInstance = {
        post: vi.fn(),
        get: vi.fn().mockResolvedValue({ data: mockBrowserHealth })
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.checkBrowserHealth();

      expect(result.browserHealthy).toBe(true);
      expect(result.chromiumVersion).toBe('120.0.0');
    });

    it('returns error object on failure', async () => {
      const mockAxiosInstance = {
        post: vi.fn(),
        get: vi.fn().mockRejectedValue(new Error('Connection failed'))
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.checkBrowserHealth();

      expect(result.browserHealthy).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('returns MetricsResponse on success', async () => {
      const mockMetrics = {
        data: {
          requests: { 'POST /api/transcribe': 100 },
          errors: { 'INVALID_URL': 5 },
          latencies: {},
          queue: { pending: 0, active: 0, completed: 95, failed: 5 },
          timestamp: new Date().toISOString(),
          correlationId: 'test-id'
        }
      };

      const mockAxiosInstance = {
        post: vi.fn(),
        get: vi.fn().mockResolvedValue({ data: mockMetrics })
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.getMetrics();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('returns success:false on failure', async () => {
      const mockAxiosInstance = {
        post: vi.fn(),
        get: vi.fn().mockRejectedValue(new Error('Metrics unavailable'))
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.getMetrics();

      expect(result.success).toBe(false);
    });
  });

  describe('getFormats', () => {
    it('returns formats array on success', async () => {
      const mockFormatsResponse = {
        success: true,
        data: {
          formats: ['json', 'srt', 'text'],
          default: 'json'
        }
      };

      const mockAxiosInstance = {
        post: vi.fn(),
        get: vi.fn().mockResolvedValue({ data: mockFormatsResponse })
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.getFormats();

      expect(result.formats).toHaveLength(3);
      expect(result.default).toBe('json');
    });

    it('returns hardcoded fallback on failure', async () => {
      const mockAxiosInstance = {
        post: vi.fn(),
        get: vi.fn().mockRejectedValue(new Error('Formats unavailable'))
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const { api: freshApi } = await import('../../src/services/api');

      const result = await freshApi.getFormats();

      expect(result.formats).toContain('json');
      expect(result.formats).toContain('srt');
      expect(result.formats).toContain('text');
      expect(result.default).toBe('json');
    });
  });
});
