/**
 * OpenAIEmbeddingService - OpenAI embedding service adapter.
 *
 * Uses OpenAI's embedding models via their official SDK.
 * Default model: text-embedding-3-small (1536 dimensions, fast, cost-effective)
 *
 * Advantages:
 * - High-quality embeddings
 * - Fast inference (~50-200ms per text)
 * - Proven at scale
 * - Multiple model options
 *
 * Limitations:
 * - Requires API key
 * - API costs (~$0.0001 per 1000 tokens)
 * - Internet connection required
 * - Data sent to OpenAI servers
 */

import OpenAI from 'openai';
import { IEmbeddingService, EmbeddingServiceConfig } from '../../domain/repositories/IEmbeddingService';
import { Logger } from '../Logger';

export class OpenAIEmbeddingService implements IEmbeddingService {
  private client: OpenAI;
  private modelName: string;
  private dimensions: number;
  private maxTokens: number;
  private logger: Logger;

  constructor(
    config: Partial<EmbeddingServiceConfig> = {},
    logger?: Logger
  ) {
    this.logger = logger || new Logger('openai-embedding');
    this.modelName = config.modelName || 'text-embedding-3-small';
    this.dimensions = this.getDimensionsForModel(this.modelName);
    this.maxTokens = config.maxTokens || 8191;

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key required. Set OPENAI_API_KEY environment variable.');
    }

    this.client = new OpenAI({
      apiKey,
      timeout: config.timeout || 60000
    });

    this.logger.info('OpenAI embedding service initialized', {
      model: this.modelName,
      dimensions: this.dimensions
    });
  }

  /**
   * Get embedding dimensions based on model name
   */
  private getDimensionsForModel(modelName: string): number {
    const dimensionMap: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };

    return dimensionMap[modelName] || 1536; // Default to 1536
  }

  /**
   * Generate embedding vector for a single text
   */
  async embed(text: string): Promise<number[]> {
    try {
      // Truncate text if exceeds max tokens
      const truncatedText = this.truncateText(text);

      const response = await this.client.embeddings.create({
        model: this.modelName,
        input: truncatedText,
        encoding_format: 'float'
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding returned from OpenAI');
      }

      const embedding = response.data[0].embedding;

      this.logger.debug('OpenAI embedding generated', {
        model: this.modelName,
        inputLength: truncatedText.length,
        dimensions: embedding.length
      });

      return embedding;
    } catch (error: any) {
      this.logger.error('Failed to generate OpenAI embedding', error, {
        textLength: text.length,
        model: this.modelName
      });

      if (error.code === 'insufficient_quota') {
        throw new Error('OpenAI API quota exceeded. Check your billing settings.');
      }

      throw new Error(`OpenAI embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const startTime = Date.now();

      // Truncate all texts
      const truncatedTexts = texts.map(text => this.truncateText(text));

      // OpenAI supports batch embedding requests
      const response = await this.client.embeddings.create({
        model: this.modelName,
        input: truncatedTexts,
        encoding_format: 'float'
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embeddings returned from OpenAI');
      }

      // Sort by index to ensure correct order
      const sortedEmbeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);

      const duration = Date.now() - startTime;
      this.logger.info('OpenAI batch embedding completed', {
        count: texts.length,
        durationMs: duration,
        avgTimeMs: Math.round(duration / texts.length),
        model: this.modelName
      });

      return sortedEmbeddings;
    } catch (error: any) {
      this.logger.error('Failed to generate OpenAI batch embeddings', error, {
        count: texts.length,
        model: this.modelName
      });

      if (error.code === 'insufficient_quota') {
        throw new Error('OpenAI API quota exceeded. Check your billing settings.');
      }

      throw new Error(`OpenAI batch embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Truncate text to max token length
   * Simple approximation: ~4 characters per token
   */
  private truncateText(text: string): string {
    const approximateTokens = Math.ceil(text.length / 4);
    if (approximateTokens <= this.maxTokens) {
      return text;
    }

    const maxChars = this.maxTokens * 4;
    const truncated = text.substring(0, maxChars);

    this.logger.debug('Text truncated for OpenAI', {
      originalLength: text.length,
      truncatedLength: truncated.length,
      maxTokens: this.maxTokens
    });

    return truncated;
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Get model name
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Get maximum token length
   */
  getMaxTokens(): number {
    return this.maxTokens;
  }

  /**
   * Check if service is ready
   */
  async isReady(): Promise<boolean> {
    try {
      // Test with a simple embedding request
      await this.embed('test');
      return true;
    } catch (error) {
      this.logger.warn('OpenAI embedding service not ready', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}
