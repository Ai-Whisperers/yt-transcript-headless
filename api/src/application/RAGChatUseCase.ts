/**
 * RAGChatUseCase - Conversational AI with transcript context (Retrieval-Augmented Generation).
 *
 * Combines semantic search with LLM chat to answer questions about video transcripts.
 * Retrieves relevant transcript chunks and uses them as context for LLM responses.
 *
 * Flow:
 * 1. User asks a question
 * 2. Search vector store for relevant transcript chunks
 * 3. Build context from top matching chunks
 * 4. Send context + question to LLM
 * 5. Return LLM response with citations
 *
 * Example:
 * User: "What did the speaker say about Kubernetes deployment?"
 * System: Searches transcripts → Finds relevant chunks → Sends to LLM with context
 * LLM: "According to the video, the speaker explained that..."
 */

import { IEmbeddingService } from '../domain/repositories/IEmbeddingService';
import { ILLMService, ChatMessage, ChatRequest } from '../domain/repositories/ILLMService';
import { IVectorStore, VectorSearchFilters } from '../domain/repositories/IVectorStore';
import { Logger } from '../infrastructure/Logger';

export interface RAGChatRequest {
  query: string;
  videoId?: string;             // Filter context to specific video
  videoIds?: string[];          // Filter context to multiple videos
  maxContextChunks?: number;    // Max chunks to include as context (default: 5)
  temperature?: number;         // LLM temperature (default: 0.7)
  maxTokens?: number;           // Max tokens to generate (default: 500)
  conversationHistory?: ChatMessage[]; // Previous messages for multi-turn chat
}

export interface RAGChatResponse {
  success: boolean;
  data?: {
    answer: string;
    sources: SourceCitation[];
    contextUsed: string;
    tokensUsed?: {
      prompt: number;
      completion: number;
      total: number;
    };
    responseTimeMs: number;
  };
  error?: {
    message: string;
    code: string;
  };
}

export interface SourceCitation {
  videoId: string;
  videoUrl: string;
  videoTitle?: string;
  text: string;
  score: number;
  timestamp: string;
  videoUrlWithTimestamp: string;
}

export class RAGChatUseCase {
  private readonly SYSTEM_PROMPT = `You are a helpful AI assistant that answers questions about video transcripts.

Your role:
- Answer questions based ONLY on the provided transcript context
- Cite specific parts of the transcript when answering
- If the context doesn't contain relevant information, say so clearly
- Be concise and accurate
- Include video timestamps when referencing specific content

Guidelines:
- Always ground your answers in the provided context
- Don't make up information not present in the transcripts
- If asked about content not in the context, politely explain that limitation
- Format responses clearly with proper structure`;

  constructor(
    private embeddingService: IEmbeddingService,
    private llmService: ILLMService,
    private vectorStore: IVectorStore,
    private logger: Logger
  ) {}

  /**
   * Execute RAG chat request
   */
  async execute(request: RAGChatRequest): Promise<RAGChatResponse> {
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

      this.logger.info('Starting RAG chat', {
        query: request.query,
        maxContextChunks: request.maxContextChunks,
        hasHistory: !!request.conversationHistory
      });

      // Retrieve relevant context from vector store
      const queryEmbedding = await this.embeddingService.embed(request.query);

      const filters: VectorSearchFilters = {};
      if (request.videoId) {
        filters.videoId = request.videoId;
      }
      if (request.videoIds && request.videoIds.length > 0) {
        filters.videoIds = request.videoIds;
      }

      const searchResults = await this.vectorStore.search({
        queryEmbedding,
        limit: request.maxContextChunks || 5,
        minScore: 0.65, // Lower threshold than pure search
        filters
      });

      if (searchResults.length === 0) {
        return {
          success: true,
          data: {
            answer: "I couldn't find any relevant content in the transcripts to answer your question. Please try rephrasing or ask about a different topic.",
            sources: [],
            contextUsed: '',
            responseTimeMs: Date.now() - startTime
          }
        };
      }

      // Build context from search results
      const context = this.buildContext(searchResults.map(r => r.chunk));
      const sources = this.buildSourceCitations(searchResults);

      // Build chat messages
      const messages = this.buildChatMessages(
        request.query,
        context,
        request.conversationHistory
      );

      // Generate LLM response
      const chatRequest: ChatRequest = {
        messages,
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens ?? 500
      };

      const llmResponse = await this.llmService.chat(chatRequest);

      const duration = Date.now() - startTime;

      this.logger.info('RAG chat completed', {
        query: request.query,
        sourcesCount: sources.length,
        tokensUsed: llmResponse.tokensUsed?.total,
        responseTimeMs: duration
      });

      return {
        success: true,
        data: {
          answer: llmResponse.content,
          sources,
          contextUsed: context,
          tokensUsed: llmResponse.tokensUsed,
          responseTimeMs: duration
        }
      };
    } catch (error: any) {
      this.logger.error('RAG chat failed', error, {
        query: request.query
      });

      return {
        success: false,
        error: {
          message: error.message || 'Chat failed',
          code: 'CHAT_FAILED'
        }
      };
    }
  }

  /**
   * Stream RAG chat response for real-time UI
   */
  async* stream(request: RAGChatRequest): AsyncIterable<RAGChatStreamChunk> {
    try {
      // Validate input
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        yield {
          type: 'error',
          error: validation.error!
        };
        return;
      }

      // Retrieve context (same as non-streaming)
      yield { type: 'status', message: 'Searching transcripts...' };

      const queryEmbedding = await this.embeddingService.embed(request.query);

      const filters: VectorSearchFilters = {};
      if (request.videoId) filters.videoId = request.videoId;
      if (request.videoIds) filters.videoIds = request.videoIds;

      const searchResults = await this.vectorStore.search({
        queryEmbedding,
        limit: request.maxContextChunks || 5,
        minScore: 0.65,
        filters
      });

      if (searchResults.length === 0) {
        yield {
          type: 'answer',
          content: "I couldn't find any relevant content in the transcripts to answer your question.",
          done: true
        };
        return;
      }

      // Build context and sources
      const context = this.buildContext(searchResults.map(r => r.chunk));
      const sources = this.buildSourceCitations(searchResults);

      yield {
        type: 'sources',
        sources
      };

      yield { type: 'status', message: 'Generating response...' };

      // Build chat messages
      const messages = this.buildChatMessages(
        request.query,
        context,
        request.conversationHistory
      );

      // Stream LLM response
      const chatRequest: ChatRequest = {
        messages,
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens ?? 500,
        stream: true
      };

      for await (const chunk of this.llmService.stream(chatRequest)) {
        yield {
          type: 'answer',
          content: chunk.delta,
          done: !!chunk.finishReason
        };

        if (chunk.finishReason) {
          break;
        }
      }

      yield { type: 'complete' };
    } catch (error: any) {
      this.logger.error('RAG chat stream failed', error);
      yield {
        type: 'error',
        error: error.message || 'Stream failed'
      };
    }
  }

  /**
   * Validate chat request
   */
  private validateRequest(request: RAGChatRequest): { valid: boolean; error?: string } {
    if (!request.query || request.query.trim().length === 0) {
      return { valid: false, error: 'Query cannot be empty' };
    }

    if (request.query.length > 2000) {
      return { valid: false, error: 'Query too long (max 2000 characters)' };
    }

    if (request.maxContextChunks && (request.maxContextChunks < 1 || request.maxContextChunks > 20)) {
      return { valid: false, error: 'Max context chunks must be between 1 and 20' };
    }

    if (request.temperature && (request.temperature < 0 || request.temperature > 2)) {
      return { valid: false, error: 'Temperature must be between 0 and 2' };
    }

    return { valid: true };
  }

  /**
   * Build context string from transcript chunks
   */
  private buildContext(chunks: any[]): string {
    return chunks
      .map((chunk, index) => {
        const timestamp = this.formatTimestamp(chunk.startTime);
        const title = chunk.videoTitle || chunk.videoId;
        return `[Source ${index + 1}] ${title} at ${timestamp}:\n${chunk.text}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Build source citations from search results
   */
  private buildSourceCitations(searchResults: any[]): SourceCitation[] {
    return searchResults.map(result => {
      const chunk = result.chunk;
      return {
        videoId: chunk.videoId,
        videoUrl: chunk.videoUrl,
        videoTitle: chunk.videoTitle,
        text: chunk.text,
        score: result.score,
        timestamp: this.formatTimestamp(chunk.startTime),
        videoUrlWithTimestamp: this.buildTimestampedUrl(chunk.videoUrl, chunk.startTime)
      };
    });
  }

  /**
   * Build chat messages array for LLM
   */
  private buildChatMessages(
    query: string,
    context: string,
    conversationHistory?: ChatMessage[]
  ): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.SYSTEM_PROMPT }
    ];

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }

    // Add current query with context
    const userMessage = `Context from video transcripts:\n\n${context}\n\n---\n\nQuestion: ${query}`;
    messages.push({ role: 'user', content: userMessage });

    return messages;
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
}

/**
 * Stream chunk types for RAG chat streaming
 */
export type RAGChatStreamChunk =
  | { type: 'status'; message: string }
  | { type: 'sources'; sources: SourceCitation[] }
  | { type: 'answer'; content: string; done: boolean }
  | { type: 'complete' }
  | { type: 'error'; error: string };
