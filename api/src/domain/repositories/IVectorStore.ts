/**
 * IVectorStore - Vendor-agnostic interface for vector database operations.
 *
 * Supports multiple providers through adapter pattern:
 * - QdrantVectorStore (primary choice)
 * - ChromaVectorStore (optional)
 * - WeaviateVectorStore (optional)
 *
 * Provider selection controlled via environment variables.
 */

import { TranscriptSegment } from '../TranscriptSegment';

export interface IVectorStore {
  /**
   * Initialize vector store connection and create collections
   * @throws Error if initialization fails
   */
  initialize(): Promise<void>;

  /**
   * Add transcript chunks with embeddings to vector store
   * @param chunks - Array of transcript chunks with embeddings
   */
  addChunks(chunks: TranscriptChunk[]): Promise<void>;

  /**
   * Add chunks in batch for better performance
   * @param chunks - Array of transcript chunks
   * @param batchSize - Number of chunks per batch
   */
  addChunksBatch(chunks: TranscriptChunk[], batchSize?: number): Promise<void>;

  /**
   * Search for similar transcript chunks
   * @param request - Search parameters
   * @returns Array of search results with similarity scores
   */
  search(request: VectorSearchRequest): Promise<VectorSearchResult[]>;

  /**
   * Delete all chunks for a specific video
   * @param videoId - YouTube video ID
   */
  deleteByVideoId(videoId: string): Promise<void>;

  /**
   * Delete all chunks in a collection
   * @param collectionName - Optional collection name (defaults to main collection)
   */
  clearCollection(collectionName?: string): Promise<void>;

  /**
   * Get vector store statistics
   * @returns Statistics about stored vectors
   */
  getStats(): Promise<VectorStoreStats>;

  /**
   * Optional: Check if service is ready/initialized
   * @returns True if service is ready to accept requests
   */
  isReady?(): Promise<boolean>;
}

/**
 * Transcript chunk with metadata for vector storage
 */
export interface TranscriptChunk {
  id: string;                  // Unique chunk ID (e.g., videoId_chunkIndex)
  videoId: string;             // YouTube video ID
  videoUrl: string;            // Full YouTube URL
  videoTitle?: string;         // Video title
  chunkIndex: number;          // Index of chunk in video (0-based)
  text: string;                // Chunk text content
  embedding: number[];         // Embedding vector
  segments: TranscriptSegment[]; // Original transcript segments in chunk
  startTime: number;           // Start time in seconds
  endTime: number;             // End time in seconds
  metadata?: Record<string, any>; // Additional metadata
}

/**
 * Vector search request parameters
 */
export interface VectorSearchRequest {
  queryEmbedding: number[];    // Query vector
  limit?: number;              // Max results to return (default 10)
  minScore?: number;           // Minimum similarity score (0-1)
  filters?: VectorSearchFilters; // Metadata filters
  collectionName?: string;     // Optional collection name
}

/**
 * Metadata filters for vector search
 */
export interface VectorSearchFilters {
  videoId?: string;            // Filter by specific video
  videoIds?: string[];         // Filter by multiple videos
  startTimeRange?: {           // Filter by time range
    min: number;
    max: number;
  };
  customFilters?: Record<string, any>; // Provider-specific filters
}

/**
 * Vector search result with similarity score
 */
export interface VectorSearchResult {
  chunk: TranscriptChunk;
  score: number;               // Similarity score (0-1, higher = more similar)
  highlights?: string[];       // Optional text highlights
}

/**
 * Vector store statistics
 */
export interface VectorStoreStats {
  totalVectors: number;        // Total number of vectors stored
  totalVideos: number;         // Number of unique videos
  dimensions: number;          // Vector dimensionality
  collectionName: string;      // Collection name
  providerInfo: {
    name: string;              // Provider name (qdrant, chroma, etc.)
    version?: string;
    url?: string;
  };
}

/**
 * Configuration for vector store initialization
 */
export interface VectorStoreConfig {
  provider: 'qdrant' | 'chroma' | 'weaviate';
  url: string;                 // Vector store URL
  apiKey?: string;             // Optional API key
  collectionName?: string;     // Collection name (default: 'transcripts')
  dimensions: number;          // Embedding dimensions
  createCollectionIfMissing?: boolean; // Auto-create collection
  timeout?: number;
}
