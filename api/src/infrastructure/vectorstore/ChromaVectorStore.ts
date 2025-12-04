/**
 * ChromaVectorStore - Vector store adapter for ChromaDB.
 *
 * ChromaDB is an open-source embedding database optimized for developer experience.
 * This adapter provides vendor-agnostic vector storage with ChromaDB backend.
 *
 * Setup:
 * 1. Run Chroma with Docker:
 *    docker run -p 8000:8000 chromadb/chroma
 * 2. Or install locally: pip install chromadb
 * 3. Set CHROMA_URL=http://localhost:8000
 *
 * Advantages:
 * - Simple setup and operation
 * - Great for local development
 * - Open source and free
 * - Python and JavaScript clients
 *
 * Limitations:
 * - Less mature than Qdrant/Weaviate
 * - Simpler filtering capabilities
 * - Smaller community
 */

import { ChromaClient, Collection } from 'chromadb';
import {
  IVectorStore,
  TranscriptChunk,
  VectorSearchRequest,
  VectorSearchResult,
  VectorStoreStats,
  VectorStoreConfig
} from '../../domain/repositories/IVectorStore';
import { Logger } from '../Logger';

export class ChromaVectorStore implements IVectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private collectionName: string;
  private dimensions: number;
  private logger: Logger;
  private initialized: boolean = false;
  private createCollectionIfMissing: boolean;
  private url: string;

  constructor(
    config: VectorStoreConfig,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('chroma-vector-store');
    this.collectionName = config.collectionName || 'transcripts';
    this.dimensions = config.dimensions;
    this.createCollectionIfMissing = config.createCollectionIfMissing ?? true;
    this.url = config.url;

    // Parse URL to extract path
    const urlObj = new URL(config.url);
    const path = urlObj.pathname || '/';

    this.client = new ChromaClient({
      path: config.url
    });

    this.logger.info('Chroma vector store initialized', {
      url: config.url,
      collectionName: this.collectionName,
      dimensions: this.dimensions
    });
  }

  /**
   * Initialize vector store and create collection if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('Initializing Chroma collection', {
        collectionName: this.collectionName
      });

      // Try to get existing collection
      try {
        this.collection = await this.client.getCollection({
          name: this.collectionName
        });

        this.logger.debug('Collection already exists', {
          collectionName: this.collectionName
        });
      } catch (error) {
        // Collection doesn't exist
        if (this.createCollectionIfMissing) {
          this.logger.info('Creating new Chroma collection', {
            collectionName: this.collectionName
          });

          this.collection = await this.client.createCollection({
            name: this.collectionName,
            metadata: { 'hnsw:space': 'cosine' } // Cosine similarity
          });

          this.logger.info('Collection created successfully');
        } else {
          throw new Error(`Collection ${this.collectionName} does not exist`);
        }
      }

      this.initialized = true;
    } catch (error: any) {
      this.logger.error('Failed to initialize Chroma', error);
      throw new Error(`Chroma initialization failed: ${error.message}`);
    }
  }

  /**
   * Add transcript chunks with embeddings to vector store
   */
  async addChunks(chunks: TranscriptChunk[]): Promise<void> {
    await this.ensureInitialized();

    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    try {
      const ids = chunks.map(chunk => chunk.id);
      const embeddings = chunks.map(chunk => chunk.embedding);
      const documents = chunks.map(chunk => chunk.text);
      const metadatas = chunks.map(chunk => ({
        videoId: chunk.videoId,
        videoUrl: chunk.videoUrl,
        videoTitle: chunk.videoTitle || '',
        chunkIndex: chunk.chunkIndex,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        segmentCount: chunk.segments.length
      }));

      await this.collection.add({
        ids,
        embeddings,
        documents,
        metadatas
      });

      this.logger.info('Chunks added to Chroma', {
        count: chunks.length,
        collectionName: this.collectionName
      });
    } catch (error: any) {
      this.logger.error('Failed to add chunks to Chroma', error);
      throw new Error(`Failed to add chunks: ${error.message}`);
    }
  }

  /**
   * Add chunks in batches for better performance
   */
  async addChunksBatch(chunks: TranscriptChunk[], batchSize: number = 100): Promise<void> {
    await this.ensureInitialized();

    const totalBatches = Math.ceil(chunks.length / batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, chunks.length);
      const batch = chunks.slice(start, end);

      await this.addChunks(batch);

      this.logger.debug('Batch added', {
        batchNumber: i + 1,
        totalBatches,
        chunkCount: batch.length
      });
    }
  }

  /**
   * Search for similar transcript chunks
   */
  async search(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    await this.ensureInitialized();

    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    try {
      const limit = request.limit ?? 10;

      // Build where clause from filters
      const where = this.buildWhere(request.filters);

      const queryResults = await this.collection.query({
        queryEmbeddings: [request.queryEmbedding],
        nResults: limit,
        where,
        include: ['documents', 'metadatas', 'distances']
      });

      if (!queryResults.ids || queryResults.ids.length === 0) {
        return [];
      }

      // Convert Chroma results to our format
      const results: VectorSearchResult[] = [];
      const ids = queryResults.ids[0];
      const documents = queryResults.documents?.[0] || [];
      const metadatas = queryResults.metadatas?.[0] || [];
      const distances = queryResults.distances?.[0] || [];

      for (let i = 0; i < ids.length; i++) {
        const metadata = metadatas[i] as any || {};
        const distance = distances[i];

        if (distance === null || distance === undefined) {
          continue;
        }

        // Convert distance to similarity score (Chroma uses L2 distance by default)
        // For cosine similarity: score = 1 - distance
        const score = 1 - distance;

        // Apply minimum score filter
        if (request.minScore && score < request.minScore) {
          continue;
        }

        results.push({
          chunk: {
            id: ids[i],
            videoId: metadata.videoId || '',
            videoUrl: metadata.videoUrl || '',
            videoTitle: metadata.videoTitle,
            chunkIndex: metadata.chunkIndex || 0,
            text: documents[i] || '',
            embedding: request.queryEmbedding, // Not returned by Chroma
            segments: [], // Not stored in Chroma metadata
            startTime: metadata.startTime || 0,
            endTime: metadata.endTime || 0,
            metadata
          },
          score
        });
      }

      this.logger.debug('Search completed', {
        resultsCount: results.length,
        limit,
        minScore: request.minScore
      });

      return results;
    } catch (error: any) {
      this.logger.error('Search failed', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Build Chroma where clause from search filters
   */
  private buildWhere(filters?: any): any {
    if (!filters) {
      return undefined;
    }

    const where: any = {};

    if (filters.videoId) {
      where.videoId = { $eq: filters.videoId };
    }

    if (filters.videoIds && filters.videoIds.length > 0) {
      where.videoId = { $in: filters.videoIds };
    }

    if (filters.startTimeRange) {
      where.startTime = {
        $gte: filters.startTimeRange.min,
        $lte: filters.startTimeRange.max
      };
    }

    return Object.keys(where).length > 0 ? where : undefined;
  }

  /**
   * Delete all chunks for a specific video
   */
  async deleteByVideoId(videoId: string): Promise<void> {
    await this.ensureInitialized();

    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    try {
      await this.collection.delete({
        where: {
          videoId: { $eq: videoId }
        }
      });

      this.logger.info('Deleted chunks by videoId', {
        videoId,
        collectionName: this.collectionName
      });
    } catch (error: any) {
      this.logger.error('Failed to delete chunks', error);
      throw new Error(`Failed to delete chunks: ${error.message}`);
    }
  }

  /**
   * Clear all vectors from collection
   */
  async clearCollection(collectionName?: string): Promise<void> {
    await this.ensureInitialized();

    const targetCollection = collectionName || this.collectionName;

    try {
      // Delete and recreate collection for clean slate
      await this.client.deleteCollection({ name: targetCollection });
      this.collection = await this.client.createCollection({
        name: targetCollection,
        metadata: { 'hnsw:space': 'cosine' }
      });

      this.logger.info('Collection cleared', {
        collectionName: targetCollection
      });
    } catch (error: any) {
      this.logger.error('Failed to clear collection', error);
      throw new Error(`Failed to clear collection: ${error.message}`);
    }
  }

  /**
   * Get vector store statistics
   */
  async getStats(): Promise<VectorStoreStats> {
    await this.ensureInitialized();

    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    try {
      const count = await this.collection.count();

      // Get all unique video IDs (Chroma doesn't support aggregations directly)
      const allResults = await this.collection.get({
        include: ['metadatas']
      });

      const uniqueVideos = new Set<string>();
      if (allResults.metadatas) {
        for (const metadata of allResults.metadatas) {
          if (metadata && (metadata as any).videoId) {
            uniqueVideos.add((metadata as any).videoId);
          }
        }
      }

      return {
        totalVectors: count,
        totalVideos: uniqueVideos.size,
        dimensions: this.dimensions,
        collectionName: this.collectionName,
        providerInfo: {
          name: 'chroma',
          version: undefined,
          url: this.url
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get stats', error);
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  /**
   * Check if Chroma is ready
   */
  async isReady(): Promise<boolean> {
    try {
      await this.client.heartbeat();
      return true;
    } catch (error) {
      this.logger.warn('Chroma not ready');
      return false;
    }
  }

  /**
   * Ensure vector store is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}
