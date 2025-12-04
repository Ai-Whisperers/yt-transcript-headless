# RAG Implementation Guide

**Doc-Type:** Implementation Guide · Version 1.0.0 · Created 2025-12-03 · AI Whisperers

---

## Overview

This document describes the **vendor-agnostic RAG (Retrieval-Augmented Generation)** implementation for the YouTube Transcript Extractor. The architecture allows easy swapping of embedding services, LLM providers, and vector stores through environment configuration.

**Architecture Principle:** Provider-agnostic abstractions with adapter pattern for maximum flexibility.

---

## Quick Start

### 1. Enable RAG Features

Create or update `api/.env`:

```bash
# Enable RAG
ENABLE_RAG=true

# Embedding Configuration
EMBEDDING_PROVIDER=local                      # 'local' or 'openai'
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2      # Default: 384 dimensions

# LLM Configuration
LLM_PROVIDER=llama.cpp                        # 'llama.cpp' or 'openai'
LLM_MODEL=llama-2-7b-chat                     # Model name
LLAMA_CPP_URL=http://127.0.0.1:8080          # llama.cpp server URL

# Vector Store Configuration
VECTOR_STORE_PROVIDER=qdrant                  # 'qdrant' or 'chroma'
QDRANT_URL=http://localhost:6333             # Qdrant server URL
QDRANT_API_KEY=                               # Optional API key
VECTOR_COLLECTION_NAME=transcripts            # Collection name
```

### 2. Start Required Services

#### Option A: Docker Compose (Recommended)

```bash
cd simple-yt-transcript-extractor
docker-compose -f rag-services.yml up -d
```

#### Option B: Manual Setup

**Start Qdrant:**
```bash
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

**Start llama.cpp server:**
```bash
# Download llama.cpp
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
make

# Download a model (e.g., Llama-2-7B-Chat)
# See: https://huggingface.co/TheBloke

# Start server
./llama-server -m models/llama-2-7b-chat.Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  --ctx-size 4096
```

### 3. Verify Services

```bash
# Check Qdrant
curl http://localhost:6333/collections

# Check llama.cpp
curl http://localhost:8080/health

# Check RAG health endpoint (after starting API)
curl http://localhost:3000/api/rag/health
```

---

## Architecture

### Vendor-Agnostic Design

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│  (SemanticSearchUseCase, RAGChatUseCase)                │
└────────────┬────────────────────────────────────────────┘
             │
             │ Uses interfaces
             ▼
┌─────────────────────────────────────────────────────────┐
│                    Domain Layer                          │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │IEmbeddingService │  │ ILLMService  │  │IVectorStore│ │
│  └──────────────────┘  └──────────────┘  └───────────┘ │
└────────────┬────────────────┬────────────────┬──────────┘
             │                │                │
             │ Implemented by │                │
             ▼                ▼                ▼
┌─────────────────────────────────────────────────────────┐
│              Infrastructure Layer (Adapters)             │
│  ┌──────────────────────────────────────────────────┐  │
│  │  LocalEmbeddingService  (Xenova/transformers)    │  │
│  │  OpenAIEmbeddingService (future)                 │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  LlamaCppLLMService     (llama.cpp HTTP)         │  │
│  │  OpenAILLMService       (future)                 │  │
│  │  OllamaLLMService       (future)                 │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  QdrantVectorStore      (Qdrant client)          │  │
│  │  ChromaVectorStore      (future)                 │  │
│  │  WeaviateVectorStore    (future)                 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Interfaces in Domain Layer**: Pure business abstractions, no vendor dependencies
2. **Adapters in Infrastructure**: Vendor-specific implementations
3. **Factory Pattern**: Centralized initialization via `RAGServiceFactory`
4. **Environment-Based Selection**: Provider choice via environment variables
5. **Lazy Initialization**: Services initialized on first use
6. **Health Checks**: Built-in readiness checks for all providers

---

## Provider Configurations

### Embedding Services

#### Local Embeddings (Default)

```bash
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2  # 384 dimensions
```

**Supported Models:**
- `Xenova/all-MiniLM-L6-v2` - 384 dims, fast, good quality (recommended)
- `Xenova/all-mpnet-base-v2` - 768 dims, slower, best quality
- `Xenova/paraphrase-MiniLM-L6-v2` - 384 dims, optimized for paraphrase
- `Xenova/multi-qa-MiniLM-L6-cos-v1` - 384 dims, optimized for Q&A

**Advantages:**
- No API costs
- Fast inference (~10-50ms per text)
- Privacy-preserving (offline)
- First-time model download (~90MB)

**Limitations:**
- Limited to transformer.js supported models
- Single-threaded inference

#### OpenAI Embeddings (Future)

```bash
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small  # 1536 dimensions
OPENAI_API_KEY=sk-...
```

**Not yet implemented** - placeholder for future extension.

---

### LLM Services

#### llama.cpp (Default)

```bash
LLM_PROVIDER=llama.cpp
LLM_MODEL=llama-2-7b-chat
LLAMA_CPP_URL=http://127.0.0.1:8080
```

**Recommended Models:**
- **Llama-2-7B-Chat** - Good balance, 4GB RAM
- **Mistral-7B-Instruct** - Better quality, 4GB RAM
- **Llama-2-13B-Chat** - High quality, 8GB RAM
- **CodeLlama-7B** - Code-focused tasks

**Download Models:**
```bash
# Visit: https://huggingface.co/TheBloke
# Search for: "GGUF" format models

# Example: Llama-2-7B-Chat-GGUF
wget https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf
```

**Advantages:**
- No API costs
- Full privacy (offline)
- Support for large context (32k+ tokens)
- Fast with GPU acceleration

**Limitations:**
- Requires llama.cpp server running
- Model quality varies by size
- GPU recommended for good performance

#### OpenAI (Future)

```bash
LLM_PROVIDER=openai
LLM_MODEL=gpt-4-turbo
OPENAI_API_KEY=sk-...
```

**Not yet implemented** - placeholder for future extension.

---

### Vector Stores

#### Qdrant (Default)

```bash
VECTOR_STORE_PROVIDER=qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                      # Optional
VECTOR_COLLECTION_NAME=transcripts
```

**Advantages:**
- High performance (Rust-based)
- Rich filtering (metadata queries)
- Horizontal scaling support
- Production-ready with persistence
- Active development

**Limitations:**
- Requires Qdrant server running
- More complex than ChromaDB

**Installation:**
```bash
# Docker (recommended)
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant

# Or download binary: https://qdrant.tech/documentation/quick-start/
```

#### ChromaDB (Future)

```bash
VECTOR_STORE_PROVIDER=chroma
CHROMA_URL=http://localhost:8000
VECTOR_COLLECTION_NAME=transcripts
```

**Not yet implemented** - placeholder for future extension.

---

## Usage Examples

### Programmatic Usage

```typescript
import { RAGServiceFactory } from './infrastructure/RAGServiceFactory';

// Initialize factory
const ragFactory = RAGServiceFactory.getInstance();

// Get services
const embeddingService = ragFactory.getEmbeddingService();
const llmService = ragFactory.getLLMService();
const vectorStore = ragFactory.getVectorStore();

// Initialize all services (optional, eager loading)
await ragFactory.initializeAll();

// Generate embeddings
const text = "What is the main topic of this video?";
const embedding = await embeddingService.embed(text);
console.log(`Embedding dimensions: ${embedding.length}`);

// Search vector store
const searchResults = await vectorStore.search({
  queryEmbedding: embedding,
  limit: 5,
  minScore: 0.7
});

// Generate chat response
const chatResponse = await llmService.chat({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain this transcript segment.' }
  ],
  temperature: 0.7,
  maxTokens: 500
});

console.log(chatResponse.content);
```

### Swapping Providers

**Switch to OpenAI embeddings** (when implemented):
```bash
# .env
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=sk-...
```

**No code changes required** - factory automatically creates correct adapter.

---

## Testing RAG Services

### Unit Testing with Mocks

```typescript
import { IEmbeddingService } from '../domain/repositories/IEmbeddingService';

describe('SemanticSearchUseCase', () => {
  let mockEmbeddingService: jest.Mocked<IEmbeddingService>;
  let mockVectorStore: jest.Mocked<IVectorStore>;

  beforeEach(() => {
    mockEmbeddingService = {
      embed: jest.fn().mockResolvedValue(new Array(384).fill(0.1)),
      embedBatch: jest.fn(),
      getDimensions: jest.fn().mockReturnValue(384),
      getModelName: jest.fn().mockReturnValue('mock-model')
    };

    // ... test implementation
  });
});
```

### Integration Testing

```bash
# Set test environment
export ENABLE_RAG=true
export EMBEDDING_PROVIDER=local
export LLM_PROVIDER=llama.cpp
export VECTOR_STORE_PROVIDER=qdrant

# Ensure services running
docker-compose -f rag-services.yml up -d

# Run tests
npm test -- --testPathPattern=rag
```

---

## Performance Considerations

### Embedding Generation

**Local (Xenova/transformers):**
- Single embedding: 10-50ms (CPU)
- Batch of 100: 1-5 seconds (CPU)
- First run: +2-5 seconds (model download)

**OpenAI (when implemented):**
- Single embedding: 50-200ms (API latency)
- Batch of 100: 500ms-2s (batched API call)
- Cost: ~$0.0001 per 1000 tokens

### LLM Inference

**llama.cpp (7B model, Q4 quantization):**
- Response time: 1-10 seconds (depends on length)
- GPU: 20-50 tokens/sec
- CPU: 2-10 tokens/sec
- Context window: 4k-32k tokens

**OpenAI (when implemented):**
- Response time: 500ms-5s
- Cost: ~$0.002 per 1000 tokens (GPT-3.5)
- Context window: 16k-128k tokens

### Vector Search

**Qdrant:**
- Search latency: <10ms (10k vectors)
- Search latency: <50ms (1M vectors)
- Filtered search: +5-20ms
- Batch insert: 1000 vectors/sec

---

## Troubleshooting

### Issue: Embedding service not initializing

**Symptoms:**
- "Failed to load embedding model" error

**Solution:**
```bash
# Check model download
ls ~/.cache/huggingface/transformers/

# Ensure internet connection for first run
# Model downloads automatically (~90MB)

# Check logs
grep "embedding" api/logs/combined.log
```

### Issue: llama.cpp server not reachable

**Symptoms:**
- "llama.cpp server not reachable" error
- Connection refused

**Solution:**
```bash
# Verify server running
curl http://127.0.0.1:8080/health

# Check server logs
./llama-server --help

# Verify correct URL in .env
echo $LLAMA_CPP_URL
```

### Issue: Qdrant collection not found

**Symptoms:**
- "Collection transcripts does not exist"

**Solution:**
```bash
# Check Qdrant running
curl http://localhost:6333/collections

# Initialize collection manually
curl -X PUT http://localhost:6333/collections/transcripts \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    }
  }'
```

### Issue: Dimension mismatch

**Symptoms:**
- "Vector dimension mismatch" error

**Solution:**
```bash
# Ensure embedding model matches vector store dimensions
# Example: all-MiniLM-L6-v2 = 384 dimensions

# Check current collection dimensions
curl http://localhost:6333/collections/transcripts

# Delete and recreate if mismatch
curl -X DELETE http://localhost:6333/collections/transcripts
# Then restart API (auto-creates with correct dimensions)
```

---

## Adding New Providers

### Adding a New Embedding Provider

1. **Create adapter class:**
```typescript
// api/src/infrastructure/embedding/CustomEmbeddingService.ts
import { IEmbeddingService } from '../../domain/repositories/IEmbeddingService';

export class CustomEmbeddingService implements IEmbeddingService {
  async embed(text: string): Promise<number[]> {
    // Your implementation
  }
  // ... implement other interface methods
}
```

2. **Register in factory:**
```typescript
// api/src/infrastructure/RAGServiceFactory.ts
case 'custom':
  this.embeddingService = new CustomEmbeddingService(...);
  break;
```

3. **Update environment variables:**
```bash
EMBEDDING_PROVIDER=custom
```

### Adding a New Vector Store Provider

Same pattern as above:

1. Create `CustomVectorStore.ts` implementing `IVectorStore`
2. Register in `RAGServiceFactory`
3. Update environment configuration

---

## Production Deployment

### Environment Variables Checklist

```bash
# Required
ENABLE_RAG=true
EMBEDDING_PROVIDER=local
LLM_PROVIDER=llama.cpp
VECTOR_STORE_PROVIDER=qdrant

# LLM Server
LLAMA_CPP_URL=http://llama-cpp-service:8080

# Vector Store
QDRANT_URL=http://qdrant-service:6333
QDRANT_API_KEY=your-api-key-here  # If using Qdrant Cloud

# Optional
VECTOR_COLLECTION_NAME=transcripts
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - ./qdrant_storage:/qdrant/storage

  llama-cpp:
    build: ./llama-cpp
    ports:
      - "8080:8080"
    volumes:
      - ./models:/models
    command: >
      --server
      --model /models/llama-2-7b-chat.Q4_K_M.gguf
      --host 0.0.0.0
      --port 8080

  api:
    build: ./api
    environment:
      - ENABLE_RAG=true
      - QDRANT_URL=http://qdrant:6333
      - LLAMA_CPP_URL=http://llama-cpp:8080
    depends_on:
      - qdrant
      - llama-cpp
```

### Health Monitoring

```bash
# Check all RAG services
curl http://localhost:3000/api/rag/health

# Expected response
{
  "enabled": true,
  "services": {
    "embedding": { "initialized": true, "ready": true, "provider": "local" },
    "llm": { "initialized": true, "ready": true, "provider": "llama.cpp" },
    "vectorStore": { "initialized": true, "ready": true, "provider": "qdrant" }
  }
}
```

---

## Next Steps

1. ✅ Vendor-agnostic RAG foundation implemented
2. ⏭️ Implement chunking strategy for transcript segmentation
3. ⏭️ Create `SemanticSearchUseCase` for vector search
4. ⏭️ Create `RAGChatUseCase` for conversational AI
5. ⏭️ Add API endpoints for search and chat
6. ⏭️ Implement automatic embedding pipeline on transcript extraction
7. ⏭️ Add OpenAI provider adapters (optional)
8. ⏭️ Add ChromaDB vector store adapter (optional)

---

**Status:** Foundation complete, ready for use case implementation
**Architecture:** Vendor-agnostic with adapter pattern
**Primary Stack:** Local embeddings + llama.cpp + Qdrant
**Extensibility:** Easy provider swapping via environment variables
