import { EventEmitter } from 'events';
import { Response } from 'express';
import { Logger } from './Logger';

/**
 * Progress update event data
 */
export interface ProgressUpdate {
  jobId: string;
  type: 'batch' | 'playlist';
  status: 'started' | 'processing' | 'completed' | 'failed' | 'aborted';
  currentIndex: number;
  totalItems: number;
  currentItem?: {
    videoId: string;
    videoUrl: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
  };
  result?: {
    videoId: string;
    success: boolean;
    error?: string;
  };
  summary?: {
    successCount: number;
    failureCount: number;
    totalProcessingTimeMs: number;
  };
  timestamp: string;
}

/**
 * ProgressStream manages Server-Sent Events (SSE) connections for real-time progress updates.
 *
 * Usage:
 * 1. Client connects to SSE endpoint with jobId
 * 2. Use case emits progress events via ProgressEmitter
 * 3. ProgressStream sends events to connected clients
 */
export class ProgressStream {
  private clients: Map<string, Set<Response>> = new Map();
  private emitter: EventEmitter;
  private logger: Logger;

  constructor(logger?: Logger) {
    this.emitter = new EventEmitter();
    this.logger = logger || new Logger('progress-stream');

    // Set up event listener
    this.emitter.on('progress', (update: ProgressUpdate) => {
      this.broadcastToJob(update.jobId, update);
    });
  }

  /**
   * Add a client connection for a specific job
   */
  addClient(jobId: string, res: Response): void {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Get or create client set for this job
    if (!this.clients.has(jobId)) {
      this.clients.set(jobId, new Set());
    }
    this.clients.get(jobId)!.add(res);

    this.logger.info('SSE client connected', {
      jobId,
      totalClients: this.clients.get(jobId)!.size
    });

    // Send initial connection event
    this.sendEvent(res, {
      type: 'connected',
      jobId,
      timestamp: new Date().toISOString()
    });

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(jobId, res);
    });
  }

  /**
   * Remove a client connection
   */
  removeClient(jobId: string, res: Response): void {
    const clients = this.clients.get(jobId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.clients.delete(jobId);
      }
      this.logger.info('SSE client disconnected', {
        jobId,
        remainingClients: clients.size
      });
    }
  }

  /**
   * Emit a progress update
   */
  emitProgress(update: ProgressUpdate): void {
    this.emitter.emit('progress', update);
  }

  /**
   * Broadcast update to all clients connected to a job
   */
  private broadcastToJob(jobId: string, update: ProgressUpdate): void {
    const clients = this.clients.get(jobId);
    if (!clients || clients.size === 0) {
      return;
    }

    this.logger.debug('Broadcasting progress update', {
      jobId,
      status: update.status,
      progress: `${update.currentIndex}/${update.totalItems}`,
      clientCount: clients.size
    });

    clients.forEach(res => {
      this.sendEvent(res, update);
    });

    // Clean up completed/failed jobs after sending final event
    if (update.status === 'completed' || update.status === 'failed' || update.status === 'aborted') {
      // Send completion event and close connections
      clients.forEach(res => {
        this.sendEvent(res, { type: 'done', jobId, timestamp: new Date().toISOString() });
        res.end();
      });
      this.clients.delete(jobId);
    }
  }

  /**
   * Send an SSE event to a client
   */
  private sendEvent(res: Response, data: any): void {
    try {
      const eventData = JSON.stringify(data);
      res.write(`data: ${eventData}\n\n`);
    } catch (error) {
      this.logger.warn('Failed to send SSE event', { error });
    }
  }

  /**
   * Get the number of connected clients for a job
   */
  getClientCount(jobId: string): number {
    return this.clients.get(jobId)?.size || 0;
  }

  /**
   * Check if a job has any connected clients
   */
  hasClients(jobId: string): boolean {
    return this.getClientCount(jobId) > 0;
  }
}

/**
 * ProgressEmitter is passed to use cases to emit progress updates
 */
export class ProgressEmitter {
  private stream: ProgressStream;
  private jobId: string;
  private type: 'batch' | 'playlist';
  private totalItems: number;

  constructor(stream: ProgressStream, jobId: string, type: 'batch' | 'playlist', totalItems: number) {
    this.stream = stream;
    this.jobId = jobId;
    this.type = type;
    this.totalItems = totalItems;
  }

  /**
   * Emit job started event
   */
  started(): void {
    this.stream.emitProgress({
      jobId: this.jobId,
      type: this.type,
      status: 'started',
      currentIndex: 0,
      totalItems: this.totalItems,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit processing event for a specific item
   */
  processing(index: number, videoId: string, videoUrl: string): void {
    this.stream.emitProgress({
      jobId: this.jobId,
      type: this.type,
      status: 'processing',
      currentIndex: index,
      totalItems: this.totalItems,
      currentItem: {
        videoId,
        videoUrl,
        status: 'processing'
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit item completed event
   */
  itemCompleted(index: number, videoId: string, success: boolean, error?: string): void {
    this.stream.emitProgress({
      jobId: this.jobId,
      type: this.type,
      status: 'processing',
      currentIndex: index + 1,
      totalItems: this.totalItems,
      result: {
        videoId,
        success,
        error
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit job completed event
   */
  completed(successCount: number, failureCount: number, totalProcessingTimeMs: number): void {
    this.stream.emitProgress({
      jobId: this.jobId,
      type: this.type,
      status: 'completed',
      currentIndex: this.totalItems,
      totalItems: this.totalItems,
      summary: {
        successCount,
        failureCount,
        totalProcessingTimeMs
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit job failed event
   */
  failed(error: string): void {
    this.stream.emitProgress({
      jobId: this.jobId,
      type: this.type,
      status: 'failed',
      currentIndex: 0,
      totalItems: this.totalItems,
      result: {
        videoId: '',
        success: false,
        error
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit job aborted event
   */
  aborted(processedCount: number): void {
    this.stream.emitProgress({
      jobId: this.jobId,
      type: this.type,
      status: 'aborted',
      currentIndex: processedCount,
      totalItems: this.totalItems,
      timestamp: new Date().toISOString()
    });
  }
}

// Singleton instance for shared progress stream
let sharedProgressStream: ProgressStream | null = null;

export function getSharedProgressStream(logger?: Logger): ProgressStream {
  if (!sharedProgressStream) {
    sharedProgressStream = new ProgressStream(logger);
  }
  return sharedProgressStream;
}
