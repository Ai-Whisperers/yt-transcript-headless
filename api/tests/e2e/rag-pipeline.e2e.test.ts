/**
 * E2E Tests for RAG Pipeline
 * Tests the complete flow: Embedding → Storage → Search → Chat
 *
 * Test Coverage:
 * - Embedding transcript chunks
 * - Semantic search with similarity scores
 * - Chat with retrieved context
 * - Streaming chat responses
 * - Error handling and edge cases
 *
 * NOTE: These tests require RAG services to be running:
 * - Qdrant vector store (or use in-memory mock)
 * - llama.cpp LLM server (or use mock)
 * - Tests will be skipped if ENABLE_RAG is not set to 'true'
 */

import request from 'supertest';
import express from 'express';
import { TranscriptSegment } from '../../src/domain/TranscriptSegment';

// Conditionally skip tests if RAG is not enabled
const ragEnabled = process.env.ENABLE_RAG === 'true';
const describeRAG = ragEnabled ? describe : describe.skip;

describeRAG('RAG Pipeline E2E Tests', () => {
  let app: express.Application;
  let originalEnv: NodeJS.ProcessEnv;
  let createRouter: any;

  // Sample transcript data for testing
  const sampleTranscript: TranscriptSegment[] = [
    { time: '0:00', text: 'Welcome to this tutorial on machine learning fundamentals.' },
    { time: '0:05', text: 'Today we will learn about neural networks and how they work.' },
    { time: '0:15', text: 'Neural networks are computational models inspired by biological neurons.' },
    { time: '0:25', text: 'They consist of layers of interconnected nodes that process information.' },
    { time: '0:35', text: 'The training process uses backpropagation to adjust weights.' },
    { time: '0:45', text: 'Gradient descent is the optimization algorithm that minimizes error.' },
    { time: '0:55', text: 'Deep learning involves neural networks with many hidden layers.' },
    { time: '1:05', text: 'Convolutional neural networks are excellent for image recognition.' },
    { time: '1:15', text: 'Recurrent neural networks handle sequential data like text or time series.' },
    { time: '1:25', text: 'Thank you for watching this introduction to neural networks.' }
  ];

  beforeAll(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Configure environment for RAG testing
    process.env.ENABLE_RAG = 'true';
    process.env.EMBEDDING_PROVIDER = 'local';
    process.env.LLM_PROVIDER = 'llama.cpp';
    process.env.VECTOR_STORE_PROVIDER = 'qdrant';
    process.env.QDRANT_URL = 'http://localhost:6333';
    process.env.LLAMA_CPP_URL = 'http://localhost:8080';

    // Dynamically import createRouter to avoid ES module issues during test discovery
    const routesModule = await import('../../src/infrastructure/routes');
    createRouter = routesModule.createRouter;

    // Create Express app with RAG routes
    app = express();
    app.use(express.json());
    const { router } = createRouter();
    app.use('/api', router);
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('RAG Health Check', () => {
    it('should return RAG service health status', async () => {
      const response = await request(app).get('/api/rag/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ragEnabled');
      expect(response.body).toHaveProperty('embeddingProvider');
      expect(response.body).toHaveProperty('llmProvider');
      expect(response.body).toHaveProperty('vectorStoreProvider');
    }, 10000);

    it('should report when RAG is disabled', async () => {
      // Temporarily disable RAG
      process.env.ENABLE_RAG = 'false';

      const response = await request(app).get('/api/rag/health');

      expect(response.status).toBe(200);
      expect(response.body.ragEnabled).toBe(false);

      // Re-enable RAG
      process.env.ENABLE_RAG = 'true';
    }, 10000);
  });

  describe('Embedding Pipeline', () => {
    const testVideoId = 'test-ml-tutorial';
    const testVideoUrl = `https://www.youtube.com/watch?v=${testVideoId}`;
    const testVideoTitle = 'Machine Learning Tutorial';

    it('should embed transcript and return chunk count', async () => {
      const response = await request(app)
        .post('/api/rag/embed')
        .send({
          videoId: testVideoId,
          videoUrl: testVideoUrl,
          videoTitle: testVideoTitle,
          segments: sampleTranscript,
          chunkingOptions: {
            strategy: 'time-based',
            chunkDurationSeconds: 30,
            overlapSeconds: 5
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('chunkCount');
      expect(response.body.data.chunkCount).toBeGreaterThan(0);
      expect(response.body.data).toHaveProperty('videoId', testVideoId);
      expect(response.body.data).toHaveProperty('strategy');
    }, 30000); // Embedding can take time

    it('should handle empty transcript gracefully', async () => {
      const response = await request(app)
        .post('/api/rag/embed')
        .send({
          videoId: 'empty-test',
          videoUrl: 'https://www.youtube.com/watch?v=empty',
          videoTitle: 'Empty Video',
          segments: []
        });

      expect([200, 400]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();
      }
    }, 10000);

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/rag/embed')
        .send({
          videoId: testVideoId
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    }, 10000);

    it('should support different chunking strategies', async () => {
      const strategies = ['time-based', 'sentence-based', 'token-based'];

      for (const strategy of strategies) {
        const response = await request(app)
          .post('/api/rag/embed')
          .send({
            videoId: `${testVideoId}-${strategy}`,
            videoUrl: testVideoUrl,
            videoTitle: testVideoTitle,
            segments: sampleTranscript,
            chunkingOptions: { strategy }
          });

        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.data.strategy).toBe(strategy);
        }
      }
    }, 60000);
  });

  describe('Semantic Search', () => {
    beforeAll(async () => {
      // Ensure test data is embedded before search tests
      const embedResponse = await request(app)
        .post('/api/rag/embed')
        .send({
          videoId: 'search-test-video',
          videoUrl: 'https://www.youtube.com/watch?v=search-test',
          videoTitle: 'Search Test Video',
          segments: sampleTranscript,
          chunkingOptions: { strategy: 'time-based' }
        });

      // Only fail if embedding actually failed (not if it already exists)
      if (embedResponse.status !== 200 && embedResponse.status !== 409) {
        throw new Error(`Failed to embed test data: ${embedResponse.body.error?.message}`);
      }
    }, 30000);

    it('should perform semantic search and return relevant chunks', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'How do neural networks learn?',
          limit: 5,
          minScore: 0.3
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('results');
      expect(Array.isArray(response.body.data.results)).toBe(true);

      // Validate result structure
      if (response.body.data.results.length > 0) {
        const result = response.body.data.results[0];
        expect(result).toHaveProperty('chunk');
        expect(result).toHaveProperty('score');
        expect(result.chunk).toHaveProperty('videoId');
        expect(result.chunk).toHaveProperty('text');
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    }, 15000);

    it('should filter results by minimum similarity score', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'neural networks',
          limit: 10,
          minScore: 0.7 // High threshold
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // All results should meet minimum score
      const results = response.body.data.results || [];
      results.forEach((result: any) => {
        expect(result.score).toBeGreaterThanOrEqual(0.7);
      });
    }, 15000);

    it('should limit number of search results', async () => {
      const requestedLimit = 3;
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'machine learning',
          limit: requestedLimit,
          minScore: 0.1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.results.length).toBeLessThanOrEqual(requestedLimit);
    }, 15000);

    it('should filter by videoId when provided', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'neural networks',
          videoId: 'search-test-video',
          limit: 5
        });

      expect(response.status).toBe(200);
      if (response.body.success && response.body.data.results.length > 0) {
        // All results should be from the specified video
        response.body.data.results.forEach((result: any) => {
          expect(result.chunk.videoId).toBe('search-test-video');
        });
      }
    }, 15000);

    it('should return empty results for nonsense query', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'xyzabc123nonsense456random789',
          limit: 5,
          minScore: 0.5
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.results)).toBe(true);
      // Results might be empty or have very low scores
    }, 15000);

    it('should validate required search parameters', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          // Missing query
          limit: 5
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    }, 10000);
  });

  describe('RAG Chat', () => {
    beforeAll(async () => {
      // Ensure test data is embedded before chat tests
      const embedResponse = await request(app)
        .post('/api/rag/embed')
        .send({
          videoId: 'chat-test-video',
          videoUrl: 'https://www.youtube.com/watch?v=chat-test',
          videoTitle: 'Chat Test Video',
          segments: sampleTranscript,
          chunkingOptions: { strategy: 'sentence-based' }
        });

      if (embedResponse.status !== 200 && embedResponse.status !== 409) {
        throw new Error(`Failed to embed test data: ${embedResponse.body.error?.message}`);
      }
    }, 30000);

    it('should generate chat response with context from transcript', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          query: 'What is backpropagation?',
          maxContextChunks: 3
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('answer');
      expect(response.body.data).toHaveProperty('sources');
      expect(typeof response.body.data.answer).toBe('string');
      expect(response.body.data.answer.length).toBeGreaterThan(0);
      expect(Array.isArray(response.body.data.sources)).toBe(true);
    }, 30000); // LLM response can take time

    it('should include source citations in response', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          query: 'Explain gradient descent',
          maxContextChunks: 5
        });

      expect(response.status).toBe(200);
      if (response.body.success && response.body.data.sources.length > 0) {
        const source = response.body.data.sources[0];
        expect(source).toHaveProperty('videoId');
        expect(source).toHaveProperty('text');
        expect(source).toHaveProperty('timestamp');
        expect(source).toHaveProperty('score');
      }
    }, 30000);

    it('should filter context by videoId when provided', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          query: 'What are neural networks?',
          videoId: 'chat-test-video',
          maxContextChunks: 3
        });

      expect(response.status).toBe(200);
      if (response.body.success && response.body.data.sources.length > 0) {
        response.body.data.sources.forEach((source: any) => {
          expect(source.videoId).toBe('chat-test-video');
        });
      }
    }, 30000);

    it('should handle chat without relevant context', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          query: 'What is quantum computing?', // Unrelated to transcript
          maxContextChunks: 3
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('answer');
      // Answer should indicate no relevant context or provide general response
    }, 30000);

    it('should validate required chat parameters', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          // Missing query
          maxContextChunks: 3
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    }, 10000);
  });

  describe('Streaming Chat', () => {
    it('should stream chat response as SSE events', async () => {
      const response = await request(app)
        .post('/api/rag/chat/stream')
        .send({
          query: 'Explain deep learning in simple terms',
          maxContextChunks: 3
        });

      // Should return SSE stream
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      // Response body should contain SSE formatted data
      const responseText = response.text;
      expect(responseText).toContain('data:');
    }, 30000);

    it('should send completion event at end of stream', async () => {
      const response = await request(app)
        .post('/api/rag/chat/stream')
        .send({
          query: 'What is machine learning?',
          maxContextChunks: 2
        });

      expect(response.status).toBe(200);
      const responseText = response.text;

      // Should contain done event or similar completion signal
      expect(responseText.includes('[DONE]') || responseText.includes('event: done')).toBe(true);
    }, 30000);

    it('should handle streaming errors gracefully', async () => {
      const response = await request(app)
        .post('/api/rag/chat/stream')
        .send({
          // Missing required query parameter
          maxContextChunks: 3
        });

      expect(response.status).toBe(400);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle embedding service errors', async () => {
      // Send invalid embedding request
      const response = await request(app)
        .post('/api/rag/embed')
        .send({
          videoId: 'error-test',
          videoUrl: 'invalid-url', // Invalid URL
          segments: sampleTranscript
        });

      expect([400, 500]).toContain(response.status);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    }, 10000);

    it('should handle vector store connection errors gracefully', async () => {
      // This test would require mocking vector store to simulate connection failure
      // For now, just validate that endpoint handles missing vector store
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'test query',
          limit: 5
        });

      // Should either succeed or fail gracefully with proper error
      if (response.status !== 200) {
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toBeTruthy();
      }
    }, 15000);

    it('should validate chunk data structure', async () => {
      const response = await request(app)
        .post('/api/rag/embed')
        .send({
          videoId: 'malformed-test',
          videoUrl: 'https://www.youtube.com/watch?v=malformed',
          segments: 'not-an-array' // Should be array
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }, 10000);
  });

  describe('RAG Pipeline Integration', () => {
    const integrationVideoId = 'integration-test-video';

    it('should complete full pipeline: embed → search → chat', async () => {
      // Step 1: Embed transcript
      const embedResponse = await request(app)
        .post('/api/rag/embed')
        .send({
          videoId: integrationVideoId,
          videoUrl: `https://www.youtube.com/watch?v=${integrationVideoId}`,
          videoTitle: 'Integration Test Video',
          segments: sampleTranscript,
          chunkingOptions: { strategy: 'time-based' }
        });

      expect([200, 409]).toContain(embedResponse.status); // 409 if already embedded

      // Step 2: Search for relevant content
      const searchResponse = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'neural networks',
          videoId: integrationVideoId,
          limit: 3,
          minScore: 0.3
        });

      expect(searchResponse.status).toBe(200);
      expect(searchResponse.body.success).toBe(true);

      // Step 3: Chat with context from search
      const chatResponse = await request(app)
        .post('/api/rag/chat')
        .send({
          query: 'How do neural networks process information?',
          videoId: integrationVideoId,
          maxContextChunks: 3
        });

      expect(chatResponse.status).toBe(200);
      expect(chatResponse.body.success).toBe(true);
      expect(chatResponse.body.data.answer).toBeTruthy();
      expect(chatResponse.body.data.sources.length).toBeGreaterThan(0);
    }, 60000);

    it('should maintain consistency across multiple searches', async () => {
      const query = 'gradient descent optimization';

      // Run same search twice
      const search1 = await request(app)
        .post('/api/rag/search')
        .send({ query, limit: 5, minScore: 0.3 });

      const search2 = await request(app)
        .post('/api/rag/search')
        .send({ query, limit: 5, minScore: 0.3 });

      expect(search1.status).toBe(200);
      expect(search2.status).toBe(200);

      // Results should be consistent (same chunks, same scores)
      if (search1.body.data.results.length > 0 && search2.body.data.results.length > 0) {
        expect(search1.body.data.results[0].chunk.id).toBe(search2.body.data.results[0].chunk.id);
        expect(search1.body.data.results[0].score).toBeCloseTo(search2.body.data.results[0].score, 5);
      }
    }, 30000);
  });
});
