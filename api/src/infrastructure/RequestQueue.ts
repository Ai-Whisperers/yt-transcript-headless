import { Logger } from './Logger';

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  queueSize: number;
}

export interface QueuedTask<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  addedAt: number;
  timeout?: NodeJS.Timeout;
}

export class RequestQueue {
  private queue: QueuedTask<any>[] = [];
  private active: number = 0;
  private readonly maxConcurrency: number;
  private readonly maxQueueSize: number;
  private readonly queueTimeout: number;
  private logger: Logger;

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
  async add<T>(task: () => Promise<T>): Promise<T> {
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

      // Create timeout for queue wait time
      const timeout = setTimeout(() => {
        this.logger.warn('Task timed out in queue', {
          waitTime: Date.now() - addedAt,
          queueTimeout: this.queueTimeout
        });

        // Remove from queue
        const index = this.queue.findIndex(t => t.addedAt === addedAt);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }

        reject(new Error('Request timed out in queue'));
      }, this.queueTimeout);

      const queuedTask: QueuedTask<T> = {
        execute: task,
        resolve,
        reject,
        addedAt,
        timeout
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
      const result = await task.execute();

      this.stats.completed++;
      this.stats.totalProcessed++;

      this.logger.info('Task completed successfully', {
        totalProcessed: this.stats.totalProcessed,
        completed: this.stats.completed
      });

      task.resolve(result);
    } catch (error: any) {
      this.stats.failed++;
      this.stats.totalProcessed++;

      this.logger.error('Task execution failed', error, {
        totalProcessed: this.stats.totalProcessed,
        failed: this.stats.failed
      });

      task.reject(error);
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

    // Clear all timeouts
    this.queue.forEach(task => {
      if (task.timeout) {
        clearTimeout(task.timeout);
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
