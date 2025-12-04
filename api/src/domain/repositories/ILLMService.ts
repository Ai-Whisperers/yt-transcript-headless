/**
 * ILLMService - Vendor-agnostic interface for Large Language Model services.
 *
 * Supports multiple providers through adapter pattern:
 * - LlamaCppLLMService (llama.cpp HTTP server)
 * - OpenAILLMService (optional)
 * - OllamaLLMService (optional)
 *
 * Provider selection controlled via environment variables.
 */

export interface ILLMService {
  /**
   * Send a chat request and get complete response
   * @param request - Chat request with messages and options
   * @returns Complete chat response
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Stream chat response for real-time UI updates
   * @param request - Chat request with messages and options
   * @returns Async iterable of response chunks
   */
  stream(request: ChatRequest): AsyncIterable<ChatStreamChunk>;

  /**
   * Get model information
   * @returns Model name and capabilities
   */
  getModelInfo(): LLMModelInfo;

  /**
   * Optional: Check if service is ready/initialized
   * @returns True if service is ready to accept requests
   */
  isReady?(): Promise<boolean>;
}

/**
 * Chat message structure (OpenAI-compatible format)
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

/**
 * Chat request with messages and generation options
 */
export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;        // 0.0 to 2.0, default 0.7
  maxTokens?: number;          // Max tokens to generate
  topP?: number;               // Nucleus sampling, default 1.0
  stopSequences?: string[];    // Stop generation on these sequences
  stream?: boolean;            // Enable streaming (for stream() method)
}

/**
 * Complete chat response
 */
export interface ChatResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'error';
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
}

/**
 * Streaming response chunk
 */
export interface ChatStreamChunk {
  delta: string;               // Text delta for this chunk
  finishReason?: 'stop' | 'length' | 'error';
  tokensUsed?: number;
}

/**
 * LLM model capabilities and metadata
 */
export interface LLMModelInfo {
  name: string;
  provider: 'llama.cpp' | 'openai' | 'ollama';
  contextWindow: number;       // Max context length in tokens
  supportsStreaming: boolean;
  supportsSystemMessages: boolean;
}

/**
 * Configuration for LLM service initialization
 */
export interface LLMServiceConfig {
  provider: 'llama.cpp' | 'openai' | 'ollama';
  modelName?: string;
  apiKey?: string;
  baseUrl?: string;            // For llama.cpp or Ollama
  timeout?: number;
  maxRetries?: number;
}
