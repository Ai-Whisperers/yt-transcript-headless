/**
 * LocalEmbeddingService - Local text embedding using Xenova/transformers.
 *
 * Uses transformer.js to run embedding models locally without API calls.
 * Default model: all-MiniLM-L6-v2 (384 dimensions, optimized for semantic search)
 *
 * Advantages:
 * - No API costs
 * - Fast inference (~10-50ms per text)
 * - Privacy-preserving (no data sent externally)
 * - Works offline
 *
 * Limitations:
 * - Model download on first run (~90MB)
 * - Single-threaded inference
 * - Limited to models supported by transformers.js
 */

import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import { IEmbeddingService, EmbeddingServiceConfig } from '../../domain/repositories/IEmbeddingService';
import { Logger } from '../Logger';

export class LocalEmbeddingService implements IEmbeddingService {
  private pipeline: FeatureExtractionPipeline | null = null;
  private modelName: string;
  private dimensions: number;
  private maxTokens: number;
  private logger: Logger;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    config: Partial<EmbeddingServiceConfig> = {},
    logger?: Logger
  ) {
    this.logger = logger || new Logger('local-embedding');
    this.modelName = config.modelName || 'Xenova/all-MiniLM-L6-v2';
    this.dimensions = this.getDimensionsForModel(this.modelName);
    this.maxTokens = config.maxTokens || 512;
  }

  /**
   * Get embedding dimensions based on model name
   */
  private getDimensionsForModel(modelName: string): number {
    const dimensionMap: Record<string, number> = {
      'Xenova/all-MiniLM-L6-v2': 384,
      'Xenova/all-mpnet-base-v2': 768,
      'Xenova/paraphrase-MiniLM-L6-v2': 384,
      'Xenova/multi-qa-MiniLM-L6-cos-v1': 384,
    };

    return dimensionMap[modelName] || 384; // Default to 384
  }

  /**
   * Initialize the embedding pipeline (lazy loading)
   */
  private async initialize(): Promise<void> {
    if (this.pipeline) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      this.logger.info('Initializing local embedding service', {
        model: this.modelName,
        dimensions: this.dimensions
      });

      try {
        this.pipeline = await pipeline('feature-extraction', this.modelName, {
          quantized: true, // Use quantized model for faster inference
        });

        this.logger.info('Local embedding service initialized successfully', {
          model: this.modelName
        });
      } catch (error: any) {
        this.logger.error('Failed to initialize embedding pipeline', error);
        throw new Error(`Failed to load embedding model: ${error.message}`);
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Generate embedding vector for a single text
   */
  async embed(text: string): Promise<number[]> {
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized');
    }

    try {
      // Truncate text if exceeds max tokens
      const truncatedText = this.truncateText(text);

      // Generate embedding
      const output = await this.pipeline(truncatedText, {
        pooling: 'mean',           // Mean pooling over token embeddings
        normalize: true            // L2 normalize for cosine similarity
      });

      // Extract embedding array
      const embedding = Array.from(output.data as Float32Array);

      return embedding;
    } catch (error: any) {
      this.logger.error('Failed to generate embedding', error, {
        textLength: text.length
      });
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized');
    }

    try {
      const startTime = Date.now();

      // Truncate all texts
      const truncatedTexts = texts.map(text => this.truncateText(text));

      // Process all texts in batch
      const embeddings: number[][] = [];
      for (const text of truncatedTexts) {
        const embedding = await this.embed(text);
        embeddings.push(embedding);
      }

      const duration = Date.now() - startTime;
      this.logger.debug('Batch embedding completed', {
        count: texts.length,
        durationMs: duration,
        avgTimeMs: Math.round(duration / texts.length)
      });

      return embeddings;
    } catch (error: any) {
      this.logger.error('Failed to generate batch embeddings', error, {
        count: texts.length
      });
      throw new Error(`Batch embedding generation failed: ${error.message}`);
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

    this.logger.debug('Text truncated', {
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
      await this.initialize();
      return this.pipeline !== null;
    } catch (error) {
      return false;
    }
  }
}
