/**
 * OpenAILLMService - OpenAI LLM service adapter.
 *
 * Uses OpenAI's chat completion models via their official SDK.
 * Default model: gpt-4o-mini (fast, cost-effective, good quality)
 *
 * Advantages:
 * - High-quality responses
 * - Fast inference (500ms-5s)
 * - Large context windows (128k tokens)
 * - Proven reliability at scale
 *
 * Limitations:
 * - Requires API key
 * - API costs (~$0.002 per 1000 tokens for GPT-3.5)
 * - Internet connection required
 * - Data sent to OpenAI servers
 */

import OpenAI from 'openai';
import {
  ILLMService,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  LLMModelInfo,
  LLMServiceConfig
} from '../../domain/repositories/ILLMService';
import { Logger } from '../Logger';

export class OpenAILLMService implements ILLMService {
  private client: OpenAI;
  private modelName: string;
  private logger: Logger;
  private maxRetries: number;

  constructor(
    config: Partial<LLMServiceConfig> = {},
    logger?: Logger
  ) {
    this.logger = logger || new Logger('openai-llm');
    this.modelName = config.modelName || 'gpt-4o-mini';
    this.maxRetries = config.maxRetries || 3;

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key required. Set OPENAI_API_KEY environment variable.');
    }

    this.client = new OpenAI({
      apiKey,
      timeout: config.timeout || 60000,
      maxRetries: this.maxRetries
    });

    this.logger.info('OpenAI LLM service initialized', {
      model: this.modelName
    });
  }

  /**
   * Send chat request and get complete response
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1000,
        top_p: request.topP ?? 1.0,
        stop: request.stopSequences,
        stream: false
      });

      const choice = completion.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No response from OpenAI');
      }

      const duration = Date.now() - startTime;
      this.logger.info('OpenAI chat completion received', {
        durationMs: duration,
        tokensUsed: completion.usage?.total_tokens,
        finishReason: choice.finish_reason,
        model: completion.model
      });

      return {
        content: choice.message.content || '',
        finishReason: this.mapFinishReason(choice.finish_reason),
        tokensUsed: completion.usage ? {
          prompt: completion.usage.prompt_tokens,
          completion: completion.usage.completion_tokens,
          total: completion.usage.total_tokens
        } : undefined,
        model: completion.model
      };
    } catch (error: any) {
      this.logger.error('OpenAI chat completion failed', error, {
        durationMs: Date.now() - startTime,
        model: this.modelName
      });

      if (error.code === 'insufficient_quota') {
        throw new Error('OpenAI API quota exceeded. Check your billing settings.');
      }

      if (error.code === 'context_length_exceeded') {
        throw new Error('Context length exceeded. Reduce input size or use a model with larger context window.');
      }

      throw new Error(`OpenAI chat completion failed: ${error.message}`);
    }
  }

  /**
   * Stream chat response for real-time UI updates
   */
  async* stream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.modelName,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1000,
        top_p: request.topP ?? 1.0,
        stop: request.stopSequences,
        stream: true
      });

      let totalTokens = 0;

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta?.content || '';
        const finishReason = choice.finish_reason;

        yield {
          delta,
          finishReason: finishReason ? this.mapFinishReason(finishReason) : undefined,
          tokensUsed: totalTokens
        };

        if (finishReason) {
          this.logger.debug('OpenAI stream completed', {
            finishReason,
            model: chunk.model
          });
          break;
        }

        // Approximate token count (actual count not available in streaming)
        totalTokens += Math.ceil(delta.length / 4);
      }
    } catch (error: any) {
      this.logger.error('OpenAI stream failed', error, {
        model: this.modelName
      });

      if (error.code === 'insufficient_quota') {
        throw new Error('OpenAI API quota exceeded. Check your billing settings.');
      }

      throw new Error(`OpenAI stream failed: ${error.message}`);
    }
  }

  /**
   * Map OpenAI finish reason to our standard format
   */
  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'error' {
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
    // Context window sizes for common models
    const contextWindows: Record<string, number> = {
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16385,
      'gpt-3.5-turbo-16k': 16385
    };

    return {
      name: this.modelName,
      provider: 'openai',
      contextWindow: contextWindows[this.modelName] || 4096,
      supportsStreaming: true,
      supportsSystemMessages: true
    };
  }

  /**
   * Check if OpenAI service is reachable
   */
  async isReady(): Promise<boolean> {
    try {
      // Test with a simple chat request
      await this.chat({
        messages: [
          { role: 'user', content: 'test' }
        ],
        maxTokens: 5
      });
      return true;
    } catch (error) {
      this.logger.warn('OpenAI LLM service not ready', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}
