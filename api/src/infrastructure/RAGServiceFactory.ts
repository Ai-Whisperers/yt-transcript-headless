/**
 * RAGServiceFactory - Centralized factory for RAG service initialization.
 *
 * Provides vendor-agnostic service instances based on environment configuration.
 * Implements singleton pattern to ensure single instances across application.
 *
 * Environment Variables:
 * - EMBEDDING_PROVIDER: 'local' | 'openai' (default: 'local')
 * - EMBEDDING_MODEL: Model name (default: 'Xenova/all-MiniLM-L6-v2')
 * - LLM_PROVIDER: 'llama.cpp' | 'openai' (default: 'llama.cpp')
 * - LLM_MODEL: Model name (default: 'llama.cpp')
 * - LLAMA_CPP_URL: llama.cpp server URL (default: 'http://127.0.0.1:8080')
 * - VECTOR_STORE_PROVIDER: 'qdrant' | 'chroma' (default: 'qdrant')
 * - QDRANT_URL: Qdrant server URL (default: 'http://localhost:6333')
 * - QDRANT_API_KEY: Optional Qdrant API key
 * - VECTOR_COLLECTION_NAME: Collection name (default: 'transcripts')
 * - ENABLE_RAG: Enable RAG features (default: 'false')
 */

import { IEmbeddingService } from '../domain/repositories/IEmbeddingService';
import { ILLMService } from '../domain/repositories/ILLMService';
import { IVectorStore, VectorStoreConfig } from '../domain/repositories/IVectorStore';
import { LocalEmbeddingService } from './embedding/LocalEmbeddingService';
import { LlamaCppLLMService } from './llm/LlamaCppLLMService';
import { QdrantVectorStore } from './vectorstore/QdrantVectorStore';
import { Logger } from './Logger';

export class RAGServiceFactory {
  private static instance: RAGServiceFactory | null = null;
  private logger: Logger;
  private embeddingService: IEmbeddingService | null = null;
  private llmService: ILLMService | null = null;
  private vectorStore: IVectorStore | null = null;
  private ragEnabled: boolean;

  private constructor(logger?: Logger) {
    this.logger = logger || new Logger('rag-factory');
    this.ragEnabled = process.env.ENABLE_RAG === 'true';

    if (this.ragEnabled) {
      this.logger.info('RAG services enabled', {
        embeddingProvider: this.getEmbeddingProvider(),
        llmProvider: this.getLLMProvider(),
        vectorStoreProvider: this.getVectorStoreProvider()
      });
    } else {
      this.logger.info('RAG services disabled (set ENABLE_RAG=true to enable)');
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(logger?: Logger): RAGServiceFactory {
    if (!RAGServiceFactory.instance) {
      RAGServiceFactory.instance = new RAGServiceFactory(logger);
    }
    return RAGServiceFactory.instance;
  }

  /**
   * Check if RAG features are enabled
   */
  isRAGEnabled(): boolean {
    return this.ragEnabled;
  }

  /**
   * Get embedding service instance
   */
  getEmbeddingService(): IEmbeddingService {
    if (!this.ragEnabled) {
      throw new Error('RAG services not enabled. Set ENABLE_RAG=true');
    }

    if (!this.embeddingService) {
      const provider = this.getEmbeddingProvider();

      this.logger.info('Initializing embedding service', { provider });

      switch (provider) {
        case 'local':
          this.embeddingService = new LocalEmbeddingService({
            provider: 'local',
            modelName: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2'
          }, this.logger);
          break;

        case 'openai':
          // Future: Implement OpenAIEmbeddingService
          throw new Error('OpenAI embedding provider not yet implemented. Use EMBEDDING_PROVIDER=local');

        default:
          throw new Error(`Unknown embedding provider: ${provider}`);
      }

      this.logger.info('Embedding service initialized', {
        provider,
        modelName: this.embeddingService.getModelName(),
        dimensions: this.embeddingService.getDimensions()
      });
    }

    return this.embeddingService;
  }

  /**
   * Get LLM service instance
   */
  getLLMService(): ILLMService {
    if (!this.ragEnabled) {
      throw new Error('RAG services not enabled. Set ENABLE_RAG=true');
    }

    if (!this.llmService) {
      const provider = this.getLLMProvider();

      this.logger.info('Initializing LLM service', { provider });

      switch (provider) {
        case 'llama.cpp':
          this.llmService = new LlamaCppLLMService({
            provider: 'llama.cpp',
            modelName: process.env.LLM_MODEL || 'llama.cpp',
            baseUrl: process.env.LLAMA_CPP_URL || 'http://127.0.0.1:8080'
          }, this.logger);
          break;

        case 'openai':
          // Future: Implement OpenAILLMService
          throw new Error('OpenAI LLM provider not yet implemented. Use LLM_PROVIDER=llama.cpp');

        default:
          throw new Error(`Unknown LLM provider: ${provider}`);
      }

      this.logger.info('LLM service initialized', {
        provider,
        modelInfo: this.llmService.getModelInfo()
      });
    }

    return this.llmService;
  }

  /**
   * Get vector store instance
   */
  getVectorStore(): IVectorStore {
    if (!this.ragEnabled) {
      throw new Error('RAG services not enabled. Set ENABLE_RAG=true');
    }

    if (!this.vectorStore) {
      const provider = this.getVectorStoreProvider();

      this.logger.info('Initializing vector store', { provider });

      // Get embedding dimensions from embedding service
      const embeddingService = this.getEmbeddingService();
      const dimensions = embeddingService.getDimensions();

      switch (provider) {
        case 'qdrant':
          const qdrantConfig: VectorStoreConfig = {
            provider: 'qdrant',
            url: process.env.QDRANT_URL || 'http://localhost:6333',
            apiKey: process.env.QDRANT_API_KEY,
            collectionName: process.env.VECTOR_COLLECTION_NAME || 'transcripts',
            dimensions,
            createCollectionIfMissing: true
          };

          this.vectorStore = new QdrantVectorStore(qdrantConfig, this.logger);
          break;

        case 'chroma':
          // Future: Implement ChromaVectorStore
          throw new Error('Chroma vector store provider not yet implemented. Use VECTOR_STORE_PROVIDER=qdrant');

        default:
          throw new Error(`Unknown vector store provider: ${provider}`);
      }

      this.logger.info('Vector store initialized', {
        provider,
        collectionName: process.env.VECTOR_COLLECTION_NAME || 'transcripts',
        dimensions
      });
    }

    return this.vectorStore;
  }

  /**
   * Initialize all RAG services (for eager initialization)
   */
  async initializeAll(): Promise<void> {
    if (!this.ragEnabled) {
      this.logger.info('RAG services disabled, skipping initialization');
      return;
    }

    this.logger.info('Initializing all RAG services');

    // Initialize services in order
    const embeddingService = this.getEmbeddingService();
    const llmService = this.getLLMService();
    const vectorStore = this.getVectorStore();

    // Initialize vector store collection
    await vectorStore.initialize();

    // Check readiness
    const embeddingReady = embeddingService.isReady ? await embeddingService.isReady() : true;
    const llmReady = llmService.isReady ? await llmService.isReady() : true;
    const vectorStoreReady = vectorStore.isReady ? await vectorStore.isReady() : true;

    this.logger.info('RAG services initialization complete', {
      embeddingReady,
      llmReady,
      vectorStoreReady
    });

    if (!embeddingReady || !llmReady || !vectorStoreReady) {
      this.logger.warn('Some RAG services are not ready', {
        embeddingReady,
        llmReady,
        vectorStoreReady
      });
    }
  }

  /**
   * Get health status of all RAG services
   */
  async getHealthStatus(): Promise<RAGHealthStatus> {
    if (!this.ragEnabled) {
      return {
        enabled: false,
        services: {}
      };
    }

    const embeddingService = this.embeddingService;
    const llmService = this.llmService;
    const vectorStore = this.vectorStore;

    return {
      enabled: true,
      services: {
        embedding: {
          initialized: embeddingService !== null,
          ready: embeddingService?.isReady ? await embeddingService.isReady() : false,
          provider: this.getEmbeddingProvider(),
          modelName: embeddingService?.getModelName()
        },
        llm: {
          initialized: llmService !== null,
          ready: llmService?.isReady ? await llmService.isReady() : false,
          provider: this.getLLMProvider(),
          modelInfo: llmService?.getModelInfo()
        },
        vectorStore: {
          initialized: vectorStore !== null,
          ready: vectorStore?.isReady ? await vectorStore.isReady() : false,
          provider: this.getVectorStoreProvider()
        }
      }
    };
  }

  /**
   * Close all RAG services
   */
  async close(): Promise<void> {
    this.logger.info('Closing RAG services');

    // Reset instances
    this.embeddingService = null;
    this.llmService = null;
    this.vectorStore = null;

    this.logger.info('RAG services closed');
  }

  /**
   * Get configured embedding provider
   */
  private getEmbeddingProvider(): 'local' | 'openai' {
    const provider = process.env.EMBEDDING_PROVIDER || 'local';
    if (provider !== 'local' && provider !== 'openai') {
      throw new Error(`Invalid EMBEDDING_PROVIDER: ${provider}. Must be 'local' or 'openai'`);
    }
    return provider as 'local' | 'openai';
  }

  /**
   * Get configured LLM provider
   */
  private getLLMProvider(): 'llama.cpp' | 'openai' {
    const provider = process.env.LLM_PROVIDER || 'llama.cpp';
    if (provider !== 'llama.cpp' && provider !== 'openai') {
      throw new Error(`Invalid LLM_PROVIDER: ${provider}. Must be 'llama.cpp' or 'openai'`);
    }
    return provider as 'llama.cpp' | 'openai';
  }

  /**
   * Get configured vector store provider
   */
  private getVectorStoreProvider(): 'qdrant' | 'chroma' {
    const provider = process.env.VECTOR_STORE_PROVIDER || 'qdrant';
    if (provider !== 'qdrant' && provider !== 'chroma') {
      throw new Error(`Invalid VECTOR_STORE_PROVIDER: ${provider}. Must be 'qdrant' or 'chroma'`);
    }
    return provider as 'qdrant' | 'chroma';
  }
}

/**
 * RAG health status
 */
export interface RAGHealthStatus {
  enabled: boolean;
  services: {
    embedding?: {
      initialized: boolean;
      ready: boolean;
      provider: string;
      modelName?: string;
    };
    llm?: {
      initialized: boolean;
      ready: boolean;
      provider: string;
      modelInfo?: any;
    };
    vectorStore?: {
      initialized: boolean;
      ready: boolean;
      provider: string;
    };
  };
}
