# RAG Architecture for YouTube Transcript Search & Chat

**Doc-Type:** Architecture Plan · Version 1.0.0 · Created 2025-12-03 · AI Whisperers

---

## Executive Summary

This document outlines the architecture for integrating Retrieval-Augmented Generation (RAG) capabilities into the YouTube Transcript Extractor. The RAG layer enables semantic search across transcripts, NotebookLLM-style conversational interfaces, and custom vector databases for AI-powered knowledge retrieval.

**Goals:**
- Enable semantic search across transcript collections
- Support conversational AI interfaces (NotebookLLM-style)
- Provide multiple embedding model options (OpenAI, local models)
- Support multiple vector stores (Chroma, Qdrant, Weaviate, custom)
- Integrate with LlamaIndex, LangChain, or custom RAG pipelines
- Maintain performance with large transcript corpora (10k+ videos)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client Applications                          │
│  (Web UI, CLI, API consumers, Chat interfaces)                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                   API Layer (Express)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Transcribe  │  │    Cache     │  │     RAG      │          │
│  │  Endpoints   │  │  Management  │  │  Endpoints   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                   Application Layer                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │   BatchTranscribeUseCase   │   TranscribePlaylistUseCase │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │   EmbeddingUseCase   │   SemanticSearchUseCase          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │   RAGChatUseCase     │   CorpusManagementUseCase        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                   Infrastructure Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   SQLite     │  │   DuckDB     │  │  Vector DB   │          │
│  │  (Caching)   │  │ (Analytics)  │  │  (Chroma/    │          │
│  │              │  │              │  │   Qdrant)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Embedding   │  │     LLM      │  │   Chunking   │          │
│  │   Service    │  │   Service    │  │   Strategy   │          │
│  │ (OpenAI/     │  │  (OpenAI/    │  │              │          │
│  │  Local)      │  │   Local)     │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Vector Embedding Pipeline

### 1.1 Chunking Strategy

Transcripts must be split into semantically meaningful chunks for effective retrieval.

**Domain Model:**
```typescript
// api/src/domain/TranscriptChunk.ts
export interface TranscriptChunk {
  id: string;                      // UUID
  videoId: string;                 // YouTube video ID
  videoUrl: string;                // Full YouTube URL
  videoTitle?: string;             // Video title
  chunkIndex: number;              // Sequential chunk number (0-based)
  startTime: string;               // Start timestamp (e.g., "02:30")
  endTime: string;                 // End timestamp (e.g., "03:15")
  text: string;                    // Chunk text content
  tokens: number;                  // Estimated token count
  embedding?: number[];            // Vector embedding (1536 dims for OpenAI)
  metadata: ChunkMetadata;
  createdAt: string;              // ISO timestamp
}

export interface ChunkMetadata {
  playlistId?: string;
  playlistTitle?: string;
  channelName?: string;
  uploadDate?: string;
  duration?: number;               // Video duration in seconds
  language?: string;
  tags?: string[];
  customFields?: Record<string, any>;
}
```

**Chunking Strategies:**

1. **Time-based Chunking** (Recommended for transcripts)
   - Split by time intervals (e.g., 2-minute chunks)
   - Preserves temporal context
   - Easy to reference back to video timestamps

2. **Sentence-based Chunking**
   - Split at sentence boundaries
   - Better semantic coherence
   - Variable chunk sizes

3. **Recursive Character Splitting** (LangChain default)
   - Split by character count with overlap
   - Maintains context across chunks
   - Configurable overlap (e.g., 200 characters)

4. **Semantic Chunking** (Advanced)
   - Use sentence embeddings to detect topic shifts
   - Split when semantic similarity drops
   - Most contextually aware but computationally expensive

**Recommended Implementation:**
```typescript
// Hybrid approach: Time-based with sentence boundary snapping
const DEFAULT_CHUNK_DURATION = 120; // 2 minutes
const MAX_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;
```

### 1.2 Embedding Service

**Architecture:**
```typescript
// api/src/domain/repositories/IEmbeddingService.ts
export interface IEmbeddingService {
  /**
   * Generate embedding for a single text
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batch)
   * More efficient than calling embed() multiple times
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get embedding dimensions (e.g., 1536 for OpenAI ada-002)
   */
  getDimensions(): number;

  /**
   * Get model identifier
   */
  getModelName(): string;
}
```

**Implementation Options:**

**Option 1: OpenAI Embeddings** (Recommended for production)
```typescript
// api/src/infrastructure/embedding/OpenAIEmbeddingService.ts
import { Configuration, OpenAIApi } from 'openai';

export class OpenAIEmbeddingService implements IEmbeddingService {
  private openai: OpenAIApi;
  private model = 'text-embedding-3-small'; // Latest, cheaper, 1536 dims

  async embed(text: string): Promise<number[]> {
    const response = await this.openai.createEmbedding({
      model: this.model,
      input: text
    });
    return response.data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.openai.createEmbedding({
      model: this.model,
      input: texts  // Batch up to 2048 texts
    });
    return response.data.data.map(d => d.embedding);
  }

  getDimensions(): number {
    return 1536;
  }
}
```

**Cost:** ~$0.02 per 1M tokens (text-embedding-3-small)
- 10k video transcripts (~500 tokens each) = 5M tokens
- Total cost: ~$0.10

**Option 2: Local Embeddings** (Recommended for privacy/cost)
```typescript
// api/src/infrastructure/embedding/LocalEmbeddingService.ts
import { pipeline } from '@xenova/transformers';

export class LocalEmbeddingService implements IEmbeddingService {
  private model: any;
  private modelName = 'Xenova/all-MiniLM-L6-v2'; // 384 dims, fast

  async initialize(): Promise<void> {
    this.model = await pipeline('feature-extraction', this.modelName);
  }

  async embed(text: string): Promise<number[]> {
    const output = await this.model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  getDimensions(): number {
    return 384;
  }
}
```

**Performance:** ~50-100 embeddings/second on CPU
**Cost:** Free (runs locally)
**Models:** Xenova/all-MiniLM-L6-v2, Xenova/gte-small, Xenova/bge-small-en-v1.5

**Option 3: llama.cpp Embeddings**
```bash
# Use llama.cpp server for embeddings
./llama-server \
  --model models/nomic-embed-text-v1.5.Q8_0.gguf \
  --embedding \
  --port 8080
```

### 1.3 Vector Database Selection

**Comparison:**

| Feature          | Chroma          | Qdrant          | Weaviate        | Custom (DuckDB) |
|:-----------------|:----------------|:----------------|:----------------|:----------------|
| **License**      | Apache 2.0      | Apache 2.0      | BSD-3-Clause    | MIT             |
| **Deployment**   | Embedded/Server | Docker/Cloud    | Docker/Cloud    | Embedded        |
| **Performance**  | Fast (local)    | Very fast       | Very fast       | Fast (HNSW)     |
| **Scalability**  | 100K vectors    | 10M+ vectors    | 10M+ vectors    | 1M vectors      |
| **Metadata**     | JSON            | JSON + filters  | Rich schema     | SQL             |
| **Python API**   | Excellent       | Excellent       | Good            | Custom          |
| **TypeScript**   | Limited         | Good            | Good            | Excellent       |

**Recommended: Chroma (Embedded Mode)**
- Easy integration (no separate server)
- Fast for small-medium corpora (<100K vectors)
- Excellent Python/TypeScript support
- Built-in persistence
- Works well with LangChain/LlamaIndex

**Installation:**
```bash
npm install chromadb
```

**Schema Design:**
```typescript
// Chroma collection schema
{
  name: "youtube-transcripts",
  metadata: {
    description: "YouTube video transcript embeddings",
    embedding_model: "text-embedding-3-small",
    dimensions: 1536
  }
}

// Document structure
{
  id: "chunk-{videoId}-{chunkIndex}",
  embedding: [0.123, -0.456, ...],  // 1536 dims
  metadata: {
    videoId: "dQw4w9WgXcQ",
    videoUrl: "https://youtube.com/watch?v=...",
    videoTitle: "Video Title",
    chunkIndex: 0,
    startTime: "00:00",
    endTime: "02:00",
    playlistId: "PLxxx...",
    channelName: "Channel Name",
    uploadDate: "2023-01-15",
    language: "en"
  },
  document: "Chunk text content here..."
}
```

---

## Phase 2: Semantic Search Implementation

### 2.1 Search Use Case

```typescript
// api/src/application/SemanticSearchUseCase.ts
export interface SemanticSearchRequest {
  query: string;
  topK?: number;                   // Number of results (default: 10)
  filters?: SearchFilters;
  minScore?: number;               // Minimum similarity score (0-1)
}

export interface SearchFilters {
  videoIds?: string[];
  playlistIds?: string[];
  channels?: string[];
  dateRange?: { start: string; end: string; };
  languages?: string[];
  customMetadata?: Record<string, any>;
}

export interface SearchResult {
  chunkId: string;
  videoId: string;
  videoUrl: string;
  videoTitle: string;
  chunkText: string;
  startTime: string;
  endTime: string;
  score: number;                   // Similarity score (0-1)
  metadata: ChunkMetadata;
}

export class SemanticSearchUseCase {
  constructor(
    private embeddingService: IEmbeddingService,
    private vectorStore: IVectorStore,
    private logger: ILogger
  ) {}

  async execute(request: SemanticSearchRequest): Promise<SearchResult[]> {
    // 1. Generate query embedding
    const queryEmbedding = await this.embeddingService.embed(request.query);

    // 2. Search vector store
    const results = await this.vectorStore.search({
      embedding: queryEmbedding,
      topK: request.topK || 10,
      filters: request.filters,
      minScore: request.minScore || 0.7
    });

    // 3. Map to search results
    return results.map(r => this.mapToSearchResult(r));
  }
}
```

### 2.2 Vector Store Repository

```typescript
// api/src/domain/repositories/IVectorStore.ts
export interface IVectorStore {
  /**
   * Initialize vector store connection
   */
  initialize(): Promise<void>;

  /**
   * Add document chunks to vector store
   */
  addChunks(chunks: TranscriptChunk[]): Promise<void>;

  /**
   * Search for similar chunks
   */
  search(request: VectorSearchRequest): Promise<VectorSearchResult[]>;

  /**
   * Delete chunks by video ID
   */
  deleteByVideoId(videoId: string): Promise<void>;

  /**
   * Get collection statistics
   */
  getStats(): Promise<VectorStoreStats>;
}

// api/src/infrastructure/vectorstore/ChromaVectorStore.ts
import { ChromaClient } from 'chromadb';

export class ChromaVectorStore implements IVectorStore {
  private client: ChromaClient;
  private collection: any;

  async initialize(): Promise<void> {
    this.client = new ChromaClient({
      path: process.env.CHROMA_PATH || './data/chroma'
    });

    this.collection = await this.client.getOrCreateCollection({
      name: 'youtube-transcripts',
      metadata: {
        'hnsw:space': 'cosine'  // Cosine similarity
      }
    });
  }

  async addChunks(chunks: TranscriptChunk[]): Promise<void> {
    await this.collection.add({
      ids: chunks.map(c => c.id),
      embeddings: chunks.map(c => c.embedding!),
      metadatas: chunks.map(c => this.serializeMetadata(c)),
      documents: chunks.map(c => c.text)
    });
  }

  async search(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    const results = await this.collection.query({
      queryEmbeddings: [request.embedding],
      nResults: request.topK,
      where: this.buildFilters(request.filters)
    });

    return this.mapResults(results);
  }
}
```

---

## Phase 3: RAG Chat Implementation

### 3.1 Chat Use Case (NotebookLLM-style)

```typescript
// api/src/application/RAGChatUseCase.ts
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface RAGChatRequest {
  sessionId: string;
  message: string;
  context?: {
    videoIds?: string[];
    playlistIds?: string[];
    conversationHistory?: ChatMessage[];
  };
  llmConfig?: {
    model?: string;              // e.g., "gpt-4-turbo"
    temperature?: number;
    maxTokens?: number;
  };
}

export interface RAGChatResponse {
  sessionId: string;
  message: string;
  sources: SearchResult[];        // Retrieved chunks used for answer
  confidence: number;             // Confidence score (0-1)
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export class RAGChatUseCase {
  constructor(
    private searchUseCase: SemanticSearchUseCase,
    private llmService: ILLMService,
    private chatRepository: IChatRepository,
    private logger: ILogger
  ) {}

  async execute(request: RAGChatRequest): Promise<RAGChatResponse> {
    // 1. Retrieve relevant transcript chunks
    const searchResults = await this.searchUseCase.execute({
      query: request.message,
      topK: 5,
      filters: {
        videoIds: request.context?.videoIds,
        playlistIds: request.context?.playlistIds
      }
    });

    // 2. Build RAG prompt
    const context = this.buildContext(searchResults);
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(request.message, context);

    // 3. Call LLM
    const llmResponse = await this.llmService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        ...request.context?.conversationHistory || [],
        { role: 'user', content: userPrompt }
      ],
      model: request.llmConfig?.model || 'gpt-4-turbo',
      temperature: request.llmConfig?.temperature || 0.7,
      maxTokens: request.llmConfig?.maxTokens || 1000
    });

    // 4. Save conversation
    await this.chatRepository.saveMessage(request.sessionId, {
      role: 'user',
      content: request.message,
      timestamp: new Date().toISOString()
    });

    await this.chatRepository.saveMessage(request.sessionId, {
      role: 'assistant',
      content: llmResponse.message,
      timestamp: new Date().toISOString()
    });

    return {
      sessionId: request.sessionId,
      message: llmResponse.message,
      sources: searchResults,
      confidence: this.calculateConfidence(searchResults),
      tokenUsage: llmResponse.usage
    };
  }

  private buildSystemPrompt(): string {
    return `You are a helpful AI assistant that answers questions based on YouTube video transcripts.

Rules:
1. Only answer based on the provided transcript context
2. If the answer isn't in the context, say "I don't have enough information"
3. Always cite the video title and timestamp when referencing information
4. Be concise but comprehensive
5. Use timestamps in format [MM:SS] when referencing specific parts`;
  }

  private buildContext(results: SearchResult[]): string {
    return results.map(r => {
      return `[${r.videoTitle} - ${r.startTime}]
${r.chunkText}`;
    }).join('\n\n---\n\n');
  }

  private buildUserPrompt(message: string, context: string): string {
    return `Context from video transcripts:
${context}

User question: ${message}`;
  }
}
```

### 3.2 LLM Service

```typescript
// api/src/domain/repositories/ILLMService.ts
export interface ILLMService {
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<ChatStreamChunk>;
}

// OpenAI implementation
export class OpenAILLMService implements ILLMService {
  private openai: OpenAIApi;

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.openai.createChatCompletion({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens
    });

    return {
      message: response.data.choices[0].message.content,
      usage: {
        prompt: response.data.usage.prompt_tokens,
        completion: response.data.usage.completion_tokens,
        total: response.data.usage.total_tokens
      }
    };
  }
}

// Local LLM (llama.cpp) implementation
export class LlamaCppLLMService implements ILLMService {
  private serverUrl: string;

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.serverUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens
      })
    });

    const data = await response.json();
    return {
      message: data.choices[0].message.content,
      usage: data.usage
    };
  }
}
```

---

## Phase 4: Integration with Current System

### 4.1 Auto-Embedding Pipeline

**Trigger: After successful transcript extraction**

```typescript
// Update BatchTranscribeUseCase.ts
async execute(request: BatchRequest): Promise<BatchResponse> {
  // ... existing code ...

  // After saving to cache
  await this.saveToCache(freshResults.filter(r => r.success));

  // NEW: Trigger embedding pipeline if enabled
  if (this.embeddingService && process.env.ENABLE_AUTO_EMBEDDING === 'true') {
    await this.triggerEmbeddingPipeline(freshResults.filter(r => r.success));
  }

  // ... rest of code ...
}

private async triggerEmbeddingPipeline(results: BatchVideoResult[]): Promise<void> {
  for (const result of results) {
    // Chunk transcript
    const chunks = await this.chunkingStrategy.chunk(result.transcript, {
      videoId: result.videoId,
      videoUrl: result.videoUrl
    });

    // Generate embeddings
    const texts = chunks.map(c => c.text);
    const embeddings = await this.embeddingService.embedBatch(texts);

    // Add to vector store
    chunks.forEach((chunk, i) => {
      chunk.embedding = embeddings[i];
    });

    await this.vectorStore.addChunks(chunks);

    this.logger.info('Transcript embedded and indexed', {
      videoId: result.videoId,
      chunkCount: chunks.length
    });
  }
}
```

### 4.2 Database Schema Extensions

**Add embeddings table to track embedding status:**

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  video_id TEXT PRIMARY KEY,
  chunk_count INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,      -- e.g., "text-embedding-3-small"
  embedding_dimensions INTEGER NOT NULL,
  vector_store TEXT NOT NULL,         -- e.g., "chroma", "qdrant"
  embedded_at TEXT NOT NULL,           -- ISO timestamp
  indexed_at TEXT NOT NULL,            -- ISO timestamp
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  FOREIGN KEY (video_id) REFERENCES transcripts(video_id) ON DELETE CASCADE
);

CREATE INDEX idx_embeddings_status ON embeddings(status);
CREATE INDEX idx_embeddings_embedded_at ON embeddings(embedded_at DESC);
```

### 4.3 New API Endpoints

```typescript
// POST /api/rag/embed - Manually trigger embedding for specific videos
router.post('/rag/embed', asyncHandler(async (req, res) => {
  const { videoIds } = req.body;
  // Trigger embedding pipeline for specific videos
}));

// POST /api/rag/search - Semantic search across transcripts
router.post('/rag/search', asyncHandler(async (req, res) => {
  const { query, topK, filters } = req.body;
  const results = await semanticSearchUseCase.execute({ query, topK, filters });
  res.json({ success: true, data: { results } });
}));

// POST /api/rag/chat - RAG chat interface
router.post('/rag/chat', asyncHandler(async (req, res) => {
  const { sessionId, message, context } = req.body;
  const response = await ragChatUseCase.execute({ sessionId, message, context });
  res.json({ success: true, data: response });
}));

// GET /api/rag/sessions/:sessionId - Get chat history
router.get('/rag/sessions/:sessionId', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const history = await chatRepository.getSession(sessionId);
  res.json({ success: true, data: { history } });
}));

// DELETE /api/rag/sessions/:sessionId - Clear chat history
router.delete('/rag/sessions/:sessionId', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  await chatRepository.deleteSession(sessionId);
  res.json({ success: true, data: { message: 'Session deleted' } });
}));

// GET /api/rag/stats - Get embedding statistics
router.get('/rag/stats', asyncHandler(async (req, res) => {
  const stats = await vectorStore.getStats();
  res.json({ success: true, data: stats });
}));
```

---

## Phase 5: LlamaIndex Integration (Optional)

For advanced RAG features, integrate with LlamaIndex:

**Installation:**
```bash
npm install llamaindex
```

**Usage:**
```typescript
import { VectorStoreIndex, SimpleDirectoryReader } from "llamaindex";

// Create index from transcripts
const documents = await SimpleDirectoryReader({
  directoryPath: "./transcripts"
}).loadData();

const index = await VectorStoreIndex.fromDocuments(documents);

// Query
const queryEngine = index.asQueryEngine();
const response = await queryEngine.query("What did the speaker say about AI?");
console.log(response.toString());
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [x] Design RAG architecture
- [ ] Implement chunking strategy
- [ ] Create IEmbeddingService interface
- [ ] Implement OpenAIEmbeddingService
- [ ] Implement LocalEmbeddingService (optional)
- [ ] Add embeddings table to database schema

### Phase 2: Vector Store (Week 3-4)
- [ ] Create IVectorStore interface
- [ ] Implement ChromaVectorStore
- [ ] Test embedding generation pipeline
- [ ] Add auto-embedding trigger to BatchTranscribeUseCase
- [ ] Create embedding status tracking

### Phase 3: Semantic Search (Week 5)
- [ ] Implement SemanticSearchUseCase
- [ ] Add search filters and metadata
- [ ] Create POST /api/rag/search endpoint
- [ ] Test search accuracy and performance
- [ ] Optimize chunking strategy based on results

### Phase 4: RAG Chat (Week 6-7)
- [ ] Create ILLMService interface
- [ ] Implement OpenAILLMService
- [ ] Implement LlamaCppLLMService (optional)
- [ ] Create RAGChatUseCase
- [ ] Implement chat session management
- [ ] Add POST /api/rag/chat endpoint
- [ ] Create streaming chat endpoint

### Phase 5: Frontend & Testing (Week 8)
- [ ] Build chat UI component
- [ ] Add semantic search interface
- [ ] Implement session history viewer
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation

---

## Configuration

**Environment Variables:**
```env
# RAG Configuration
ENABLE_AUTO_EMBEDDING=true
ENABLE_RAG_CHAT=true

# Embedding Service
EMBEDDING_SERVICE=openai  # or "local" or "llamacpp"
EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=sk-...

# Local Embedding (if using local service)
LOCAL_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# llama.cpp (if using llama.cpp for embeddings)
LLAMACPP_SERVER_URL=http://localhost:8080

# Vector Store
VECTOR_STORE=chroma  # or "qdrant" or "weaviate"
CHROMA_PATH=./data/chroma
# QDRANT_URL=http://localhost:6333
# WEAVIATE_URL=http://localhost:8080

# LLM Service
LLM_SERVICE=openai  # or "llamacpp" or "ollama"
LLM_MODEL=gpt-4-turbo
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=1000

# Chunking Strategy
CHUNK_STRATEGY=time-based  # or "sentence" or "recursive"
CHUNK_SIZE=120  # seconds for time-based, tokens for others
CHUNK_OVERLAP=20  # seconds/tokens
```

---

## Cost Estimation

### OpenAI Pricing (as of 2025)

**Embeddings (text-embedding-3-small):**
- $0.02 per 1M tokens
- Average transcript: 500 tokens
- 10,000 transcripts: 5M tokens = **$0.10**

**LLM (GPT-4-Turbo):**
- $10 per 1M input tokens
- $30 per 1M output tokens
- Average chat: 2,000 input + 500 output tokens
- 1,000 chats: 2M input + 0.5M output = **$35**

**Total for 10K transcripts + 1K chats: ~$35**

### Local Alternative (Free)

**Hardware Requirements:**
- CPU: 16GB RAM minimum
- GPU: Optional but recommended (RTX 3060 or better)
- Storage: 20GB for models

**Models:**
- Embeddings: all-MiniLM-L6-v2 (90MB)
- LLM: Llama-2-7B-Chat-GGUF (4GB)

**Performance:**
- Embeddings: 50-100/sec (CPU)
- Chat: 5-10 tokens/sec (CPU), 30-50 tokens/sec (GPU)

---

## Next Steps

1. **Immediate:**
   - Review and approve this architecture plan
   - Decide on embedding service (OpenAI vs local)
   - Decide on vector store (Chroma recommended)
   - Decide on LLM service (OpenAI vs llama.cpp)

2. **Week 1:**
   - Implement chunking strategy
   - Set up embedding service
   - Create vector store integration

3. **Week 2:**
   - Test embedding pipeline
   - Integrate with existing transcribe endpoints
   - Add monitoring and logging

4. **Week 3:**
   - Implement semantic search
   - Build search API
   - Test search accuracy

5. **Week 4:**
   - Implement RAG chat
   - Build chat API
   - Create frontend components

---

**Status:** Architecture complete, ready for implementation
**Dependencies:** chromadb, @xenova/transformers (if local), openai (if OpenAI)
**Integration Points:** BatchTranscribeUseCase, TranscribePlaylistUseCase
**Database:** SQLite + Chroma (embedded vector DB)
