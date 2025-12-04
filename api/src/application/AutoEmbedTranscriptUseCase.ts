/**
 * AutoEmbedTranscriptUseCase - Automatically chunk and embed transcripts into vector store.
 *
 * This use case runs after transcript extraction to:
 * 1. Chunk transcript segments using optimal strategy
 * 2. Generate embeddings for each chunk
 * 3. Store chunks in vector store for semantic search
 *
 * Can be called manually or integrated into extraction pipeline.
 */

import { TranscriptSegment } from '../domain/TranscriptSegment';
import { IEmbeddingService } from '../domain/repositories/IEmbeddingService';
import { IVectorStore, TranscriptChunk } from '../domain/repositories/IVectorStore';
import { TranscriptChunker, ChunkingOptions } from '../infrastructure/utils/TranscriptChunker';
import { Logger } from '../infrastructure/Logger';

export interface AutoEmbedRequest {
  videoId: string;
  videoUrl: string;
  videoTitle?: string;
  segments: TranscriptSegment[];
  chunkingOptions?: ChunkingOptions;
}

export interface AutoEmbedResponse {
  success: boolean;
  data?: {
    chunksCreated: number;
    embeddingsGenerated: number;
    processingTimeMs: number;
  };
  error?: {
    message: string;
    code: string;
  };
}

export class AutoEmbedTranscriptUseCase {
  constructor(
    private embeddingService: IEmbeddingService,
    private vectorStore: IVectorStore,
    private logger: Logger
  ) {}

  /**
   * Automatically chunk and embed transcript
   */
  async execute(request: AutoEmbedRequest): Promise<AutoEmbedResponse> {
    const startTime = Date.now();

    try {
      this.logger.info('Starting automatic embedding', {
        videoId: request.videoId,
        segmentCount: request.segments.length
      });

      // Determine chunking strategy
      const chunkingOptions = request.chunkingOptions ||
        TranscriptChunker.getRecommendedOptions(request.segments);

      // Chunk transcript
      let chunks = TranscriptChunker.chunk(
        request.videoId,
        request.videoUrl,
        request.videoTitle,
        request.segments,
        chunkingOptions
      );

      if (chunks.length === 0) {
        return {
          success: false,
          error: {
            message: 'No chunks generated from transcript',
            code: 'NO_CHUNKS'
          }
        };
      }

      this.logger.debug('Transcript chunked', {
        videoId: request.videoId,
        chunkCount: chunks.length,
        strategy: chunkingOptions.strategy
      });

      // Generate embeddings for all chunks
      const texts = chunks.map(c => c.text);
      const embeddings = await this.embeddingService.embedBatch(texts);

      // Add embeddings to chunks
      chunks = chunks.map((chunk, idx) => ({
        ...chunk,
        embedding: embeddings[idx]
      }));

      this.logger.debug('Embeddings generated', {
        videoId: request.videoId,
        embeddingCount: embeddings.length
      });

      // Store chunks in vector store
      await this.vectorStore.addChunksBatch(chunks, 50); // Batch size: 50

      const duration = Date.now() - startTime;

      this.logger.info('Automatic embedding completed', {
        videoId: request.videoId,
        chunksCreated: chunks.length,
        processingTimeMs: duration
      });

      return {
        success: true,
        data: {
          chunksCreated: chunks.length,
          embeddingsGenerated: embeddings.length,
          processingTimeMs: duration
        }
      };
    } catch (error: any) {
      this.logger.error('Automatic embedding failed', error, {
        videoId: request.videoId
      });

      return {
        success: false,
        error: {
          message: error.message || 'Embedding failed',
          code: 'EMBEDDING_FAILED'
        }
      };
    }
  }

  /**
   * Embed multiple transcripts in parallel
   */
  async executeBatch(requests: AutoEmbedRequest[]): Promise<AutoEmbedResponse[]> {
    this.logger.info('Starting batch automatic embedding', {
      count: requests.length
    });

    const results = await Promise.allSettled(
      requests.map(req => this.execute(req))
    );

    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: {
            message: result.reason?.message || 'Unknown error',
            code: 'BATCH_EMBEDDING_FAILED'
          }
        };
      }
    });
  }
}
