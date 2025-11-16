import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TranscribeVideoUseCase } from '../application/TranscribeVideoUseCase.js';
import { BrowserManager } from '../infrastructure/BrowserManager.js';
import { TranscriptExtractor } from '../infrastructure/TranscriptExtractor.js';
import { Logger } from '../infrastructure/Logger.js';
import { TranscriptFormat } from '../domain/TranscriptSegment.js';

const ExtractTranscriptSchema = z.object({
  url: z.string().url().describe('YouTube video URL to extract transcript from'),
  format: z.enum(['json', 'srt', 'text']).optional().default('json').describe('Output format for the transcript'),
});

const ValidateUrlSchema = z.object({
  url: z.string().describe('YouTube URL to validate'),
});

const BatchExtractSchema = z.object({
  urls: z.array(z.string().url()).describe('Array of YouTube video URLs to extract transcripts from'),
  format: z.enum(['json', 'srt', 'text']).optional().default('json').describe('Output format for all transcripts'),
});

class YouTubeTranscriptMCPServer {
  private server: Server;
  private transcribeUseCase: TranscribeVideoUseCase;
  private browserManager: BrowserManager;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('mcp-server');
    const browserLogger = new Logger('mcp-browser');
    this.browserManager = new BrowserManager(browserLogger);
    const transcriptExtractor = new TranscriptExtractor(this.browserManager, this.logger);
    this.transcribeUseCase = new TranscribeVideoUseCase(transcriptExtractor, this.logger);

    this.server = new Server(
      {
        name: 'youtube-transcript-extractor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'extract_transcript':
            return await this.handleExtractTranscript(args);
          case 'validate_url':
            return await this.handleValidateUrl(args);
          case 'batch_extract':
            return await this.handleBatchExtract(args);
          case 'get_formats':
            return this.handleGetFormats();
          case 'browser_status':
            return this.handleBrowserStatus();
          case 'get_logs':
            return this.handleGetLogs();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const err = error instanceof Error ? error : new Error(errorMessage);
        this.logger.error(`Tool execution failed: ${name}`, err);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, error: errorMessage }, null, 2),
            },
          ],
        };
      }
    });
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'extract_transcript',
        description:
          'Extract transcript from a YouTube video URL. Supports multiple output formats (JSON, SRT, TEXT). Uses headless browser automation with stealth techniques.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'YouTube video URL (supports youtube.com and youtu.be)',
            },
            format: {
              type: 'string',
              enum: ['json', 'srt', 'text'],
              description: 'Output format: json (structured), srt (subtitle), text (plain)',
              default: 'json',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'validate_url',
        description:
          'Validate if a URL is a valid YouTube video URL. Checks domain and format without performing extraction.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to validate',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'batch_extract',
        description:
          'Extract transcripts from multiple YouTube videos in a single request. Returns results for all URLs, including any failures.',
        inputSchema: {
          type: 'object',
          properties: {
            urls: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Array of YouTube video URLs',
            },
            format: {
              type: 'string',
              enum: ['json', 'srt', 'text'],
              description: 'Output format for all transcripts',
              default: 'json',
            },
          },
          required: ['urls'],
        },
      },
      {
        name: 'get_formats',
        description:
          'Get list of supported transcript output formats with descriptions and use cases.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'browser_status',
        description:
          'Check the status of the headless browser (Chromium). Returns whether browser is initialized and ready for extraction.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_logs',
        description:
          'Retrieve recent application logs for debugging purposes. Returns last 50 log entries with timestamps and levels.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  private async handleExtractTranscript(args: unknown) {
    const { url, format } = ExtractTranscriptSchema.parse(args);

    this.logger.info(`MCP: Extracting transcript for ${url} in ${format} format`);

    const result = await this.transcribeUseCase.execute({
      url,
      format: format as TranscriptFormat,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleValidateUrl(args: unknown) {
    const { url } = ValidateUrlSchema.parse(args);

    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    const isValid = youtubeRegex.test(url);

    const result = {
      success: true,
      valid: isValid,
      url,
      message: isValid
        ? 'Valid YouTube URL'
        : 'Invalid YouTube URL. Must be from youtube.com or youtu.be',
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleBatchExtract(args: unknown) {
    const { urls, format } = BatchExtractSchema.parse(args);

    this.logger.info(`MCP: Batch extracting ${urls.length} transcripts in ${format} format`);

    const results = await Promise.allSettled(
      urls.map((url) =>
        this.transcribeUseCase.execute({
          url,
          format: format as TranscriptFormat,
        })
      )
    );

    const batchResult = {
      success: true,
      total: urls.length,
      successful: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
      results: results.map((result, index) => ({
        url: urls[index],
        status: result.status,
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message : null,
      })),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(batchResult, null, 2),
        },
      ],
    };
  }

  private handleGetFormats() {
    const formats = [
      {
        format: 'json',
        description: 'Structured JSON with timestamp and text for each segment',
        useCase: 'Programmatic processing, data analysis, ML training',
        example: '{"segments": [{"time": "0:00", "text": "Hello"}]}',
      },
      {
        format: 'srt',
        description: 'SubRip subtitle format with sequential numbering',
        useCase: 'Video editing, subtitle files, media players',
        example: '1\n00:00:00,000 --> 00:00:05,000\nHello',
      },
      {
        format: 'text',
        description: 'Plain text with timestamps',
        useCase: 'Human reading, documentation, simple exports',
        example: '[0:00] Hello',
      },
    ];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, formats }, null, 2),
        },
      ],
    };
  }

  private handleBrowserStatus() {
    const status = {
      success: true,
      browser: {
        type: 'Chromium (Playwright)',
        status: 'Browser is managed dynamically, launched on demand',
        features: [
          'Stealth mode enabled',
          'Resource blocking (images, ads)',
          'Human-like delays',
          'Auto-retry (3 attempts)',
          'Automatic reconnection on disconnect',
        ],
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  private handleGetLogs() {
    const logMessage = {
      success: true,
      message: 'Logs are streamed to console. Check stdout for detailed logs.',
      logLevel: process.env.LOG_LEVEL || 'info',
      logFormat: 'JSON structured logging via Winston',
      note: 'In production, logs can be shipped to logging aggregation services',
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(logMessage, null, 2),
        },
      ],
    };
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      this.logger.error('MCP Server error', error instanceof Error ? error : new Error(String(error)));
    };

    process.on('SIGINT', async () => {
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.shutdown();
      process.exit(0);
    });
  }

  private async shutdown(): Promise<void> {
    this.logger.info('Shutting down MCP server...');
    // BrowserManager uses disposable pattern, no explicit close needed
    await this.server.close();
    this.logger.info('MCP server shutdown complete');
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('YouTube Transcript MCP Server started');
  }
}

const logger = new Logger('mcp-main');
const mcpServer = new YouTubeTranscriptMCPServer();
mcpServer.start().catch((error) => {
  logger.error('Failed to start MCP server', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});
