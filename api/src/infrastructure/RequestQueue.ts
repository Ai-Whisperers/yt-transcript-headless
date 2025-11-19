import { Logger } from './Logger';
import { ILogger } from '../domain/ILogger';

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  queueSize: number;
}

export interface QueuedTask<T> {
  execute: (signal?: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  addedAt: number;
  timeout?: NodeJS.Timeout;
  abortController?: AbortController;
}

export class RequestQueue {
  private queue: QueuedTask<any>[] = [];
  private active: number = 0;
  private readonly maxConcurrency: number;
  private readonly maxQueueSize: number;
  private readonly queueTimeout: number;
  private logger: ILogger;

  // Statistics
  private stats = {
    completed: 0,
    failed: 0,
    totalProcessed: 0
  };

  constructor(
    maxConcurrency: number = 3,
    maxQueueSize: number = 100,
    queueTimeout: number = 60000,
    logger?: Logger
  ) {
    this.maxConcurrency = maxConcurrency;
    this.maxQueueSize = maxQueueSize;
    this.queueTimeout = queueTimeout;
    this.logger = logger || new Logger('request-queue');

    this.logger.info('RequestQueue initialized', {
      maxConcurrency,
      maxQueueSize,
      queueTimeout
    });
  }

  /**
   * Add a task to the queue with timeout protection
   */
  async add<T>(task: (signal?: AbortSignal) => Promise<T>): Promise<T> {
    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      this.logger.warn('Queue is full, rejecting task', {
        queueSize: this.queue.length,
        maxQueueSize: this.maxQueueSize
      });
      throw new Error('Queue is full. Please try again later.');
    }

    return new Promise<T>((resolve, reject) => {
      const addedAt = Date.now();
      const abortController = new AbortController();

      // Create timeout for queue wait time
      const timeout = setTimeout(() => {
        this.logger.warn('Task timed out in queue', {
          waitTime: Date.now() - addedAt,
          queueTimeout: this.queueTimeout
        });

        // Abort the task if it's executing
        abortController.abort();

        // Remove from queue if still pending
        const index = this.queue.findIndex(t => t.addedAt === addedAt);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }

        // Create error with code property for better error handling
        const error: any = new Error('Request timed out in queue');
        error.code = 'QUEUE_TIMEOUT';
        reject(error);
      }, this.queueTimeout);

      const queuedTask: QueuedTask<T> = {
        execute: task,
        resolve,
        reject,
        addedAt,
        timeout,
        abortController
      };

      this.queue.push(queuedTask);

      this.logger.info('Task added to queue', {
        queueSize: this.queue.length,
        active: this.active
      });

      // Process next task if slots available
      this.processNext();
    });
  }

  /**
   * Process next task in queue if concurrency allows
   */
  private async processNext(): Promise<void> {
    // Check if we can process more tasks
    if (this.active >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) {
      return;
    }

    // Clear timeout since task is starting
    if (task.timeout) {
      clearTimeout(task.timeout);
    }

    this.active++;
    const waitTime = Date.now() - task.addedAt;

    this.logger.info('Starting task execution', {
      active: this.active,
      queueSize: this.queue.length,
      waitTime
    });

    try {
      // Pass abort signal to task execution
      const result = await task.execute(task.abortController?.signal);

      this.stats.completed++;
      this.stats.totalProcessed++;

      this.logger.info('Task completed successfully', {
        totalProcessed: this.stats.totalProcessed,
        completed: this.stats.completed
      });

      task.resolve(result);
    } catch (error: unknown) {
      this.stats.failed++;
      this.stats.totalProcessed++;

      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Task execution failed', errorObj, {
        totalProcessed: this.stats.totalProcessed,
        failed: this.stats.failed
      });

      task.reject(errorObj);
    } finally {
      this.active--;

      // Process next task in queue
      this.processNext();
    }
  }

  /**
   * Get current queue statistics
   */
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      active: this.active,
      completed: this.stats.completed,
      failed: this.stats.failed,
      totalProcessed: this.stats.totalProcessed,
      queueSize: this.queue.length
    };
  }

  /**
   * Clear all pending tasks (useful for shutdown)
   */
  clear(): void {
    this.logger.warn('Clearing queue', {
      pendingTasks: this.queue.length
    });

    // Clear all timeouts and abort controllers
    this.queue.forEach(task => {
      if (task.timeout) {
        clearTimeout(task.timeout);
      }
      if (task.abortController) {
        task.abortController.abort();
      }
      task.reject(new Error('Queue cleared'));
    });

    this.queue = [];
  }

  /**
   * Wait for all active tasks to complete
   */
  async drain(): Promise<void> {
    this.logger.info('Draining queue', {
      pending: this.queue.length,
      active: this.active
    });

    while (this.active > 0 || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.info('Queue drained successfully');
  }
}
