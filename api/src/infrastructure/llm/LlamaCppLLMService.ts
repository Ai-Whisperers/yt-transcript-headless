/**
 * LlamaCppLLMService - LLM service adapter for llama.cpp server.
 *
 * Connects to a local llama.cpp server via HTTP API (OpenAI-compatible).
 * Supports both chat completion and streaming responses.
 *
 * Setup:
 * 1. Download llama.cpp: https://github.com/ggerganov/llama.cpp
 * 2. Download a model (e.g., Llama-2-7B-Chat, Mistral-7B)
 * 3. Start server: ./llama-server -m model.gguf --host 127.0.0.1 --port 8080
 * 4. Set LLAMA_CPP_URL=http://127.0.0.1:8080
 *
 * Advantages:
 * - No API costs
 * - Full privacy (no data leaves local machine)
 * - Fast inference with quantized models
 * - Support for large context windows (32k+ tokens)
 *
 * Limitations:
 * - Requires llama.cpp server running
 * - Model quality depends on selected model
 * - Slower than cloud APIs on CPU-only systems
 */

import axios, { AxiosInstance } from 'axios';
import {
  ILLMService,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  LLMModelInfo,
  LLMServiceConfig
} from '../../domain/repositories/ILLMService';
import { Logger } from '../Logger';

export class LlamaCppLLMService implements ILLMService {
  private client: AxiosInstance;
  private baseUrl: string;
  private modelName: string;
  private logger: Logger;
  private maxRetries: number;
  private timeout: number;

  constructor(
    config: Partial<LLMServiceConfig> = {},
    logger?: Logger
  ) {
    this.logger = logger || new Logger('llama-cpp-llm');
    this.baseUrl = config.baseUrl || process.env.LLAMA_CPP_URL || 'http://127.0.0.1:8080';
    this.modelName = config.modelName || 'llama.cpp';
    this.maxRetries = config.maxRetries || 3;
    this.timeout = config.timeout || 60000; // 60 second default

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.logger.info('LlamaCpp LLM service initialized', {
      baseUrl: this.baseUrl,
      modelName: this.modelName
    });
  }

  /**
   * Send chat request and get complete response
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const response = await this.client.post('/v1/chat/completions', {
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1000,
        top_p: request.topP ?? 1.0,
        stop: request.stopSequences,
        stream: false
      });

      const data = response.data;
      const choice = data.choices?.[0];

      if (!choice) {
        throw new Error('No response from llama.cpp server');
      }

      const duration = Date.now() - startTime;
      this.logger.info('Chat completion received', {
        durationMs: duration,
        tokensUsed: data.usage?.total_tokens,
        finishReason: choice.finish_reason
      });

      return {
        content: choice.message?.content || '',
        finishReason: this.mapFinishReason(choice.finish_reason),
        tokensUsed: data.usage ? {
          prompt: data.usage.prompt_tokens,
          completion: data.usage.completion_tokens,
          total: data.usage.total_tokens
        } : undefined,
        model: data.model || this.modelName
      };
    } catch (error: any) {
      this.logger.error('Chat completion failed', error, {
        baseUrl: this.baseUrl,
        durationMs: Date.now() - startTime
      });

      if (error.code === 'ECONNREFUSED') {
        throw new Error(`llama.cpp server not reachable at ${this.baseUrl}. Is the server running?`);
      }

      throw new Error(`Chat completion failed: ${error.message}`);
    }
  }

  /**
   * Stream chat response for real-time UI updates
   */
  async* stream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    try {
      const response = await this.client.post('/v1/chat/completions', {
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1000,
        top_p: request.topP ?? 1.0,
        stop: request.stopSequences,
        stream: true
      }, {
        responseType: 'stream'
      });

      const stream = response.data;

      for await (const chunk of this.parseSSEStream(stream)) {
        if (chunk.choices?.[0]) {
          const choice = chunk.choices[0];
          const delta = choice.delta?.content || '';
          const finishReason = choice.finish_reason;

          yield {
            delta,
            finishReason: finishReason ? this.mapFinishReason(finishReason) : undefined,
            tokensUsed: chunk.usage?.total_tokens
          };

          if (finishReason) {
            break; // Stream complete
          }
        }
      }

      this.logger.debug('Stream completed');
    } catch (error: any) {
      this.logger.error('Stream failed', error);

      if (error.code === 'ECONNREFUSED') {
        throw new Error(`llama.cpp server not reachable at ${this.baseUrl}. Is the server running?`);
      }

      throw new Error(`Stream failed: ${error.message}`);
    }
  }

  /**
   * Parse Server-Sent Events (SSE) stream
   */
  private async* parseSSEStream(stream: any): AsyncIterable<any> {
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim();

          if (data === '[DONE]') {
            return;
          }

          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch (error) {
            this.logger.warn('Failed to parse SSE chunk', { data });
          }
        }
      }
    }
  }

  /**
   * Map llama.cpp finish reason to our standard format
   */
  private mapFinishReason(reason: string): 'stop' | 'length' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
      case 'max_tokens':
        return 'length';
      default:
        return 'error';
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): LLMModelInfo {
    return {
      name: this.modelName,
      provider: 'llama.cpp',
      contextWindow: 4096, // Default, can be overridden per model
      supportsStreaming: true,
      supportsSystemMessages: true
    };
  }

  /**
   * Check if llama.cpp server is reachable
   */
  async isReady(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      // Try alternative health check endpoint
      try {
        const response = await this.client.get('/v1/models', {
          timeout: 5000
        });
        return response.status === 200;
      } catch (innerError) {
        this.logger.warn('llama.cpp server not reachable', {
          baseUrl: this.baseUrl
        });
        return false;
      }
    }
  }
}
