/**
 * IEmbeddingService - Vendor-agnostic interface for text embedding services.
 *
 * Supports multiple providers through adapter pattern:
 * - LocalEmbeddingService (Xenova/transformers)
 * - OpenAIEmbeddingService (optional)
 * - HuggingFaceEmbeddingService (optional)
 *
 * Provider selection controlled via environment variables.
 */

export interface IEmbeddingService {
  /**
   * Generate embedding vector for a single text string
   * @param text - Text to embed
   * @returns Embedding vector (array of floats)
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embedding vectors for multiple texts in batch
   * @param texts - Array of texts to embed
   * @returns Array of embedding vectors
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get the dimensionality of embedding vectors
   * @returns Number of dimensions (e.g., 384 for all-MiniLM-L6-v2, 1536 for OpenAI)
   */
  getDimensions(): number;

  /**
   * Get the name/identifier of the embedding model
   * @returns Model name (e.g., "Xenova/all-MiniLM-L6-v2", "text-embedding-3-small")
   */
  getModelName(): string;

  /**
   * Optional: Get maximum input token length
   * @returns Max tokens accepted by model (e.g., 512, 8191)
   */
  getMaxTokens?(): number;

  /**
   * Optional: Check if service is ready/initialized
   * @returns True if service is ready to accept requests
   */
  isReady?(): Promise<boolean>;
}

/**
 * Configuration for embedding service initialization
 */
export interface EmbeddingServiceConfig {
  provider: 'local' | 'openai' | 'huggingface';
  modelName?: string;
  apiKey?: string;
  maxTokens?: number;
  timeout?: number;
}
