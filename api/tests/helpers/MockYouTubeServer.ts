/**
 * Mock YouTube Server for E2E Testing
 * Provides controlled YouTube-like responses without hitting real YouTube
 */

import { Server } from 'http';
import express, { Express } from 'express';
import { Socket } from 'net';

export interface MockVideoConfig {
  videoId: string;
  title: string;
  hasTranscript: boolean;
  transcriptSegments?: Array<{ time: string; text: string }>;
  responseDelay?: number; // Simulate network latency
}

export class MockYouTubeServer {
  private app: Express;
  private server: Server | null = null;
  private port: number;
  private videos: Map<string, MockVideoConfig> = new Map();
  private connections: Set<Socket> = new Set();

  constructor(port: number = 9999) {
    this.port = port;
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Mock YouTube watch page
    this.app.get('/watch', (req, res) => {
      const videoId = req.query.v as string;
      const video = this.videos.get(videoId);

      if (!video) {
        res.status(404).send('Video not found');
        return;
      }

      const delay = video.responseDelay || 0;
      setTimeout(() => {
        const html = this.generateMockYouTubePage(video);
        res.send(html);
      }, delay);
    });

    // Mock transcript endpoint
    this.app.get('/api/timedtext', (req, res) => {
      const videoId = req.query.v as string;
      const video = this.videos.get(videoId);

      if (!video || !video.hasTranscript) {
        res.status(404).send('Transcript not available');
        return;
      }

      const delay = video.responseDelay || 0;
      setTimeout(() => {
        res.json({ segments: video.transcriptSegments || [] });
      }, delay);
    });
  }

  private generateMockYouTubePage(video: MockVideoConfig): string {
    const transcript = video.hasTranscript
      ? video.transcriptSegments?.map(seg =>
          `<div class="segment" data-time="${seg.time}">${seg.text}</div>`
        ).join('')
      : '';

    return `
<!DOCTYPE html>
<html>
<head><title>${video.title} - YouTube</title></head>
<body>
  <div id="movie_player"></div>
  <button aria-label="Show transcript">Show transcript</button>
  <div id="transcript-panel" style="display: none;">
    ${transcript}
    <button>Show more</button>
  </div>
  <script>
    document.querySelector('[aria-label="Show transcript"]').onclick = () => {
      document.getElementById('transcript-panel').style.display = 'block';
    };
  </script>
</body>
</html>
    `;
  }

  registerVideo(config: MockVideoConfig): void {
    this.videos.set(config.videoId, config);
  }

  clearVideos(): void {
    this.videos.clear();
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Mock YouTube server listening on port ${this.port}`);
        resolve(this.port);
      });

      this.server.on('error', reject);

      // Track all connections for proper cleanup
      this.server.on('connection', (socket: Socket) => {
        this.connections.add(socket);
        socket.on('close', () => {
          this.connections.delete(socket);
        });
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        // Force close all active connections immediately
        for (const socket of this.connections) {
          socket.destroy();
        }
        this.connections.clear();

        // Now close the server
        this.server.close(() => {
          console.log('Mock YouTube server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }
}
