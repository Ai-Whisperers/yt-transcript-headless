/**
 * E2E Tests for RAG Endpoints (RAG Disabled)
 * Tests that RAG endpoints handle disabled state gracefully
 *
 * These tests run when ENABLE_RAG=false and verify:
 * - Health endpoint reports RAG as disabled
 * - RAG endpoints return appropriate error responses
 * - Error messages are informative
 */

import request from 'supertest';
import express from 'express';
import { createRouter } from '../../src/infrastructure/routes';

describe('RAG Endpoints (Disabled State) E2E Tests', () => {
  let app: express.Application;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Ensure RAG is disabled
    process.env.ENABLE_RAG = 'false';

    // Create Express app
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
    it('should report RAG as disabled', async () => {
      const response = await request(app).get('/api/rag/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('enabled', false);
    });
  });

  describe('RAG Endpoints Error Handling', () => {
    it('should return error when trying to embed without RAG enabled', async () => {
      const response = await request(app)
        .post('/api/rag/embed')
        .send({
          videoId: 'test123',
          videoUrl: 'https://www.youtube.com/watch?v=test123',
          segments: [
            { time: '0:00', text: 'Test content' }
          ]
        });

      expect([400, 500, 503]).toContain(response.status);
      if (response.body.error) {
        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('RAG');
      }
    });

    it('should return error when trying to search without RAG enabled', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'test query',
          limit: 5
        });

      expect([400, 500, 503]).toContain(response.status);
      if (response.body.error) {
        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('RAG');
      }
    });

    it('should return error when trying to chat without RAG enabled', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          query: 'What is machine learning?',
          maxContextChunks: 3
        });

      expect([400, 500, 503]).toContain(response.status);
      if (response.body.error) {
        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('RAG');
      }
    });

    it('should return error for streaming chat without RAG enabled', async () => {
      const response = await request(app)
        .post('/api/rag/chat/stream')
        .send({
          query: 'Explain neural networks',
          maxContextChunks: 3
        });

      expect([400, 500, 503]).toContain(response.status);
    });
  });

  describe('API Contract Validation', () => {
    it('should return service unavailable when RAG is disabled', async () => {
      const response = await request(app)
        .post('/api/rag/embed')
        .send({
          // Missing required fields
        });

      // When RAG is disabled, endpoints return 503 Service Unavailable
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });

    it('should return service unavailable for search when RAG is disabled', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          // Missing query
          limit: 5
        });

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });

    it('should return service unavailable for chat when RAG is disabled', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          // Missing query
          maxContextChunks: 3
        });

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });
  });
});
