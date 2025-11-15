import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TranscribeVideoUseCase } from '../application/TranscribeVideoUseCase.js';
import { BrowserManager } from '../infrastructure/BrowserManager.js';
import { TranscriptExtractor } from '../infrastructure/TranscriptExtractor.js';
import { Logger } from '../infrastructure/Logger.js';
import { TranscriptFormat } from '../domain/TranscriptSegment.js';


const MCPRequestSchema = z.object({
  method: z.string(),
  params: z.object({
    name: z.string().optional(),
    arguments: z.record(z.any()).optional(),
  }),
});

export class ExpressMCPHandler {
  private transcribeUseCase: TranscribeVideoUseCase;
  private browserManager: BrowserManager;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('mcp-handler');
    const browserLogger = new Logger('mcp-browser');
    this.browserManager = new BrowserManager(browserLogger);
    const transcriptExtractor = new TranscriptExtractor(this.browserManager, this.logger);
    this.transcribeUseCase = new TranscribeVideoUseCase(transcriptExtractor, this.logger);
  }

  async handleMCPRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = MCPRequestSchema.parse(req.body);

      if (parsed.method === 'tools/list') {
        res.json({
          tools: this.getTools(),
        });
        return;
      }

      if (parsed.method === 'tools/call') {
        const toolName = parsed.params.name;
        const args = parsed.params.arguments || {};

        const result = await this.executeToolExpress(toolName!, args);
        res.json(result);
        return;
      }

      res.status(400).json({
        error: 'invalid_request',
        message: `Unsupported MCP method: ${parsed.method}`,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      this.logger.error('MCP request handling failed', err);
      res.status(500).json({
        error: 'internal_error',
        message: err.message,
      });
    }
  }

  private getTools() {
    return [
      {
        name: 'extract_transcript',
        description:
          'Extract transcript from a YouTube video URL. Supports multiple output formats (JSON, SRT, TEXT).',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'YouTube video URL' },
            format: {
              type: 'string',
              enum: ['json', 'srt', 'text'],
              description: 'Output format',
              default: 'json',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'validate_url',
        description: 'Validate if a URL is a valid YouTube video URL.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to validate' },
          },
          required: ['url'],
        },
      },
      {
        name: 'batch_extract',
        description: 'Extract transcripts from multiple YouTube videos.',
        inputSchema: {
          type: 'object',
          properties: {
            urls: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of YouTube URLs',
            },
            format: {
              type: 'string',
              enum: ['json', 'srt', 'text'],
              default: 'json',
            },
          },
          required: ['urls'],
        },
      },
      {
        name: 'get_formats',
        description: 'Get list of supported transcript output formats.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'browser_status',
        description: 'Check the status of the headless browser.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  private async executeToolExpress(toolName: string, args: Record<string, any>) {
    try {
      switch (toolName) {
        case 'extract_transcript':
          return await this.handleExtractTranscript(args);
        case 'validate_url':
          return this.handleValidateUrl(args);
        case 'batch_extract':
          return await this.handleBatchExtract(args);
        case 'get_formats':
          return this.handleGetFormats();
        case 'browser_status':
          return this.handleBrowserStatus();
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      this.logger.error(`Tool execution failed: ${toolName}`, err);
      throw error;
    }
  }

  private async handleExtractTranscript(args: Record<string, any>) {
    const { url, format = 'json' } = args;

    const result = await this.transcribeUseCase.execute({
      url,
      format: format as TranscriptFormat,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  private handleValidateUrl(args: Record<string, any>) {
    const { url } = args;

    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    const isValid = youtubeRegex.test(url);

    const result = {
      success: true,
      valid: isValid,
      url,
      message: isValid ? 'Valid YouTube URL' : 'Invalid YouTube URL',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  private async handleBatchExtract(args: Record<string, any>) {
    const { urls, format = 'json' } = args;

    const results = await Promise.allSettled(
      urls.map((url: string) =>
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
      content: [{ type: 'text', text: JSON.stringify(batchResult, null, 2) }],
    };
  }

  private handleGetFormats() {
    const formats = [
      {
        format: 'json',
        description: 'Structured JSON with timestamp and text',
        useCase: 'Programmatic processing, ML training',
      },
      {
        format: 'srt',
        description: 'SubRip subtitle format',
        useCase: 'Video editing, subtitle files',
      },
      {
        format: 'text',
        description: 'Plain text with timestamps',
        useCase: 'Human reading, documentation',
      },
    ];

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, formats }, null, 2) }],
    };
  }

  private handleBrowserStatus() {
    const status = {
      success: true,
      browser: {
        type: 'Chromium (Playwright)',
        status: 'ready',
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }
}
