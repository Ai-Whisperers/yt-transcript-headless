/**
 * QdrantVectorStore - Vector store adapter for Qdrant database.
 *
 * Qdrant is a high-performance vector similarity search engine.
 * This adapter provides vendor-agnostic vector storage with Qdrant backend.
 *
 * Setup:
 * 1. Run Qdrant with Docker:
 *    docker run -p 6333:6333 qdrant/qdrant
 * 2. Or install locally: https://qdrant.tech/documentation/quick-start/
 * 3. Set QDRANT_URL=http://localhost:6333
 *
 * Advantages:
 * - High performance (Rust-based)
 * - Rich filtering capabilities
 * - Horizontal scaling support
 * - Production-ready with persistence
 * - Supports payloads (metadata)
 *
 * Limitations:
 * - Requires Qdrant server running
 * - More complex than ChromaDB for local development
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import {
  IVectorStore,
  TranscriptChunk,
  VectorSearchRequest,
  VectorSearchResult,
  VectorStoreStats,
  VectorStoreConfig
} from '../../domain/repositories/IVectorStore';
import { Logger } from '../Logger';

export class QdrantVectorStore implements IVectorStore {
  private client: QdrantClient;
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
    this.logger = logger || new Logger('qdrant-vector-store');
    this.collectionName = config.collectionName || 'transcripts';
    this.dimensions = config.dimensions;
    this.createCollectionIfMissing = config.createCollectionIfMissing ?? true;
    this.url = config.url;

    // Parse URL to extract host and port
    const url = new URL(config.url);
    const host = url.hostname;
    const port = url.port ? parseInt(url.port) : 6333;

    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
    });

    this.logger.info('Qdrant vector store initialized', {
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
      this.logger.info('Initializing Qdrant collection', {
        collectionName: this.collectionName
      });

      // Check if collection exists
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        c => c.name === this.collectionName
      );

      if (!collectionExists) {
        if (this.createCollectionIfMissing) {
          this.logger.info('Creating new Qdrant collection', {
            collectionName: this.collectionName,
            dimensions: this.dimensions
          });

          await this.client.createCollection(this.collectionName, {
            vectors: {
              size: this.dimensions,
              distance: 'Cosine' // Cosine similarity for semantic search
            }
          });

          // Create payload index for efficient filtering
          await this.client.createPayloadIndex(this.collectionName, {
            field_name: 'videoId',
            field_schema: 'keyword'
          });

          this.logger.info('Collection created successfully');
        } else {
          throw new Error(`Collection ${this.collectionName} does not exist`);
        }
      } else {
        this.logger.debug('Collection already exists', {
          collectionName: this.collectionName
        });
      }

      this.initialized = true;
    } catch (error: any) {
      this.logger.error('Failed to initialize Qdrant', error);
      throw new Error(`Qdrant initialization failed: ${error.message}`);
    }
  }

  /**
   * Add transcript chunks with embeddings to vector store
   */
  async addChunks(chunks: TranscriptChunk[]): Promise<void> {
    await this.ensureInitialized();

    try {
      const points = chunks.map(chunk => ({
        id: chunk.id,
        vector: chunk.embedding,
        payload: {
          videoId: chunk.videoId,
          videoUrl: chunk.videoUrl,
          videoTitle: chunk.videoTitle,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          segments: chunk.segments,
          metadata: chunk.metadata
        }
      }));

      await this.client.upsert(this.collectionName, {
        wait: true,
        points
      });

      this.logger.info('Chunks added to Qdrant', {
        count: chunks.length,
        collectionName: this.collectionName
      });
    } catch (error: any) {
      this.logger.error('Failed to add chunks to Qdrant', error);
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

    try {
      const limit = request.limit ?? 10;
      const minScore = request.minScore ?? 0.0;

      // Build filter from request
      const filter = this.buildFilter(request.filters);

      const searchResult = await this.client.search(this.collectionName, {
        vector: request.queryEmbedding,
        limit,
        score_threshold: minScore,
        filter,
        with_payload: true
      });

      const results: VectorSearchResult[] = searchResult.map(hit => ({
        chunk: {
          id: hit.id as string,
          videoId: hit.payload?.videoId as string,
          videoUrl: hit.payload?.videoUrl as string,
          videoTitle: hit.payload?.videoTitle as string | undefined,
          chunkIndex: hit.payload?.chunkIndex as number,
          text: hit.payload?.text as string,
          embedding: request.queryEmbedding, // Not returned by Qdrant
          segments: hit.payload?.segments as any[],
          startTime: hit.payload?.startTime as number,
          endTime: hit.payload?.endTime as number,
          metadata: hit.payload?.metadata as Record<string, any> | undefined
        },
        score: hit.score
      }));

      this.logger.debug('Search completed', {
        resultsCount: results.length,
        limit,
        minScore
      });

      return results;
    } catch (error: any) {
      this.logger.error('Search failed', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Build Qdrant filter from search filters
   */
  private buildFilter(filters?: any): any {
    if (!filters) {
      return undefined;
    }

    const conditions: any[] = [];

    if (filters.videoId) {
      conditions.push({
        key: 'videoId',
        match: { value: filters.videoId }
      });
    }

    if (filters.videoIds && filters.videoIds.length > 0) {
      conditions.push({
        key: 'videoId',
        match: { any: filters.videoIds }
      });
    }

    if (filters.startTimeRange) {
      conditions.push({
        key: 'startTime',
        range: {
          gte: filters.startTimeRange.min,
          lte: filters.startTimeRange.max
        }
      });
    }

    if (conditions.length === 0) {
      return undefined;
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return {
      must: conditions
    };
  }

  /**
   * Delete all chunks for a specific video
   */
  async deleteByVideoId(videoId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [{
            key: 'videoId',
            match: { value: videoId }
          }]
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
      await this.client.deleteCollection(targetCollection);
      await this.client.createCollection(targetCollection, {
        vectors: {
          size: this.dimensions,
          distance: 'Cosine'
        }
      });

      // Recreate payload index
      await this.client.createPayloadIndex(targetCollection, {
        field_name: 'videoId',
        field_schema: 'keyword'
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

    try {
      const info = await this.client.getCollection(this.collectionName);

      // Count unique videos using scroll API
      const uniqueVideos = new Set<string>();
      let offset: string | number | Record<string, unknown> | undefined = undefined;
      const limit = 100;

      while (true) {
        const scrollResult = await this.client.scroll(this.collectionName, {
          limit,
          offset,
          with_payload: ['videoId'],
          with_vector: false
        });

        for (const point of scrollResult.points) {
          if (point.payload?.videoId) {
            uniqueVideos.add(point.payload.videoId as string);
          }
        }

        if (!scrollResult.next_page_offset) {
          break;
        }

        offset = scrollResult.next_page_offset;
      }

      return {
        totalVectors: info.points_count || 0,
        totalVideos: uniqueVideos.size,
        dimensions: this.dimensions,
        collectionName: this.collectionName,
        providerInfo: {
          name: 'qdrant',
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
   * Check if Qdrant is ready
   */
  async isReady(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch (error) {
      this.logger.warn('Qdrant not ready');
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
