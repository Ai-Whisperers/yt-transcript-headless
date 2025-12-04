/**
 * SemanticSearchUseCase - Search transcripts using semantic similarity.
 *
 * Finds relevant transcript chunks based on query meaning, not just keywords.
 * Uses embedding service to convert query to vector and vector store for similarity search.
 *
 * Example:
 * - Query: "how to deploy kubernetes"
 * - Matches: "we're going to set up our k8s cluster", "deployment configuration"
 *
 * Search results include:
 * - Relevant transcript chunks with context
 * - Similarity scores (0-1, higher = more relevant)
 * - Video metadata and timestamps
 * - Direct links to video at specific timestamps
 */

import { IEmbeddingService } from '../domain/repositories/IEmbeddingService';
import { IVectorStore, VectorSearchResult, VectorSearchFilters } from '../domain/repositories/IVectorStore';
import { Logger } from '../infrastructure/Logger';

export interface SemanticSearchRequest {
  query: string;
  limit?: number;               // Max results (default: 10)
  minScore?: number;            // Minimum similarity score (default: 0.7)
  videoId?: string;             // Filter by specific video
  videoIds?: string[];          // Filter by multiple videos
  timeRange?: {                 // Filter by time range
    min: number;
    max: number;
  };
}

export interface SemanticSearchResponse {
  success: boolean;
  data?: {
    query: string;
    results: SearchResultItem[];
    totalResults: number;
    searchTimeMs: number;
  };
  error?: {
    message: string;
    code: string;
  };
}

export interface SearchResultItem {
  videoId: string;
  videoUrl: string;
  videoTitle?: string;
  text: string;
  score: number;                // Similarity score (0-1)
  startTime: number;
  endTime: number;
  timestamp: string;            // Formatted timestamp (MM:SS)
  videoUrlWithTimestamp: string; // Direct link to video at this timestamp
  chunkIndex: number;
}

export class SemanticSearchUseCase {
  constructor(
    private embeddingService: IEmbeddingService,
    private vectorStore: IVectorStore,
    private logger: Logger
  ) {}

  /**
   * Execute semantic search
   */
  async execute(request: SemanticSearchRequest): Promise<SemanticSearchResponse> {
    const startTime = Date.now();

    try {
      // Validate input
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        return {
          success: false,
          error: {
            message: validation.error!,
            code: 'INVALID_INPUT'
          }
        };
      }

      this.logger.info('Starting semantic search', {
        query: request.query,
        limit: request.limit,
        filters: {
          videoId: request.videoId,
          videoIds: request.videoIds?.length,
          timeRange: request.timeRange
        }
      });

      // Generate query embedding
      const queryEmbedding = await this.embeddingService.embed(request.query);

      // Build filters
      const filters: VectorSearchFilters = {};
      if (request.videoId) {
        filters.videoId = request.videoId;
      }
      if (request.videoIds && request.videoIds.length > 0) {
        filters.videoIds = request.videoIds;
      }
      if (request.timeRange) {
        filters.startTimeRange = request.timeRange;
      }

      // Search vector store
      const searchResults = await this.vectorStore.search({
        queryEmbedding,
        limit: request.limit || 10,
        minScore: request.minScore || 0.7,
        filters
      });

      // Format results
      const formattedResults = this.formatResults(searchResults);

      const duration = Date.now() - startTime;

      this.logger.info('Semantic search completed', {
        query: request.query,
        resultsCount: formattedResults.length,
        searchTimeMs: duration
      });

      return {
        success: true,
        data: {
          query: request.query,
          results: formattedResults,
          totalResults: formattedResults.length,
          searchTimeMs: duration
        }
      };
    } catch (error: any) {
      this.logger.error('Semantic search failed', error, {
        query: request.query
      });

      return {
        success: false,
        error: {
          message: error.message || 'Search failed',
          code: 'SEARCH_FAILED'
        }
      };
    }
  }

  /**
   * Validate search request
   */
  private validateRequest(request: SemanticSearchRequest): { valid: boolean; error?: string } {
    if (!request.query || request.query.trim().length === 0) {
      return { valid: false, error: 'Query cannot be empty' };
    }

    if (request.query.length > 1000) {
      return { valid: false, error: 'Query too long (max 1000 characters)' };
    }

    if (request.limit && (request.limit < 1 || request.limit > 100)) {
      return { valid: false, error: 'Limit must be between 1 and 100' };
    }

    if (request.minScore && (request.minScore < 0 || request.minScore > 1)) {
      return { valid: false, error: 'Min score must be between 0 and 1' };
    }

    if (request.timeRange) {
      if (request.timeRange.min < 0 || request.timeRange.max < 0) {
        return { valid: false, error: 'Time range values must be positive' };
      }
      if (request.timeRange.min >= request.timeRange.max) {
        return { valid: false, error: 'Time range min must be less than max' };
      }
    }

    return { valid: true };
  }

  /**
   * Format search results for API response
   */
  private formatResults(searchResults: VectorSearchResult[]): SearchResultItem[] {
    return searchResults.map(result => {
      const chunk = result.chunk;
      const timestamp = this.formatTimestamp(chunk.startTime);
      const videoUrlWithTimestamp = this.buildTimestampedUrl(chunk.videoUrl, chunk.startTime);

      return {
        videoId: chunk.videoId,
        videoUrl: chunk.videoUrl,
        videoTitle: chunk.videoTitle,
        text: chunk.text,
        score: result.score,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        timestamp,
        videoUrlWithTimestamp,
        chunkIndex: chunk.chunkIndex
      };
    });
  }

  /**
   * Format seconds to MM:SS or HH:MM:SS timestamp
   */
  private formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Build YouTube URL with timestamp
   */
  private buildTimestampedUrl(videoUrl: string, startTime: number): string {
    const timeParam = Math.floor(startTime);
    const separator = videoUrl.includes('?') ? '&' : '?';
    return `${videoUrl}${separator}t=${timeParam}s`;
  }

  /**
   * Group search results by video
   */
  groupByVideo(results: SearchResultItem[]): Map<string, SearchResultItem[]> {
    const grouped = new Map<string, SearchResultItem[]>();

    for (const result of results) {
      const existing = grouped.get(result.videoId) || [];
      existing.push(result);
      grouped.set(result.videoId, existing);
    }

    return grouped;
  }

  /**
   * Get statistics about search results
   */
  getResultStats(results: SearchResultItem[]): {
    uniqueVideos: number;
    avgScore: number;
    scoreDistribution: { high: number; medium: number; low: number };
  } {
    const uniqueVideos = new Set(results.map(r => r.videoId)).size;
    const avgScore = results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;

    const scoreDistribution = {
      high: results.filter(r => r.score >= 0.85).length,
      medium: results.filter(r => r.score >= 0.7 && r.score < 0.85).length,
      low: results.filter(r => r.score < 0.7).length
    };

    return {
      uniqueVideos,
      avgScore,
      scoreDistribution
    };
  }
}
