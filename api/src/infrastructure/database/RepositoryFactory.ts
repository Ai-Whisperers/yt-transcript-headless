import { DatabaseConnection } from './DatabaseConnection';
import { SQLiteCacheRepository } from './SQLiteCacheRepository';
import { SQLiteJobRepository } from './SQLiteJobRepository';
import { ICacheRepository } from '../../domain/repositories/ICacheRepository';
import { IJobRepository } from '../../domain/repositories/IJobRepository';
import { Logger } from '../Logger';

/**
 * RepositoryFactory provides centralized access to repository instances.
 * Implements singleton pattern to ensure single database connection.
 *
 * Usage:
 *   const factory = RepositoryFactory.getInstance();
 *   const cacheRepo = factory.getCacheRepository();
 *   const jobRepo = factory.getJobRepository();
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory | null = null;
  private dbConnection: DatabaseConnection;
  private cacheRepository: ICacheRepository | null = null;
  private jobRepository: IJobRepository | null = null;
  private logger: Logger;

  private constructor(logger?: Logger) {
    this.logger = logger || new Logger('repository-factory');
    this.dbConnection = DatabaseConnection.getInstance(undefined, this.logger);

    // Initialize database connection
    this.dbConnection.initialize();

    this.logger.info('RepositoryFactory initialized');
  }

  /**
   * Get singleton instance of RepositoryFactory
   */
  static getInstance(logger?: Logger): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory(logger);
    }
    return RepositoryFactory.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance(): void {
    if (RepositoryFactory.instance) {
      RepositoryFactory.instance.close();
      RepositoryFactory.instance = null;
    }
  }

  /**
   * Get cache repository instance (lazy initialization)
   */
  getCacheRepository(): ICacheRepository {
    if (!this.cacheRepository) {
      const db = this.dbConnection.getDatabase();
      this.cacheRepository = new SQLiteCacheRepository(db, this.logger);
      this.logger.debug('CacheRepository instance created');
    }
    return this.cacheRepository;
  }

  /**
   * Get job repository instance (lazy initialization)
   */
  getJobRepository(): IJobRepository {
    if (!this.jobRepository) {
      const db = this.dbConnection.getDatabase();
      this.jobRepository = new SQLiteJobRepository(db, this.logger);
      this.logger.debug('JobRepository instance created');
    }
    return this.jobRepository;
  }

  /**
   * Get database connection for direct access (use sparingly)
   */
  getDatabaseConnection(): DatabaseConnection {
    return this.dbConnection;
  }

  /**
   * Get database health status
   */
  getHealth(): { healthy: boolean; error?: string; stats?: any } {
    return this.dbConnection.getHealth();
  }

  /**
   * Get database statistics
   */
  getStats(): any {
    return this.dbConnection.getStats();
  }

  /**
   * Create database backup
   */
  async backup(backupPath?: string): Promise<string> {
    return this.dbConnection.backup(backupPath);
  }

  /**
   * Close database connection and cleanup
   */
  close(): void {
    this.logger.info('Closing RepositoryFactory');
    this.dbConnection.close();
    this.cacheRepository = null;
    this.jobRepository = null;
  }
}

/**
 * Convenience function to get repository factory instance
 */
export const getRepositoryFactory = (logger?: Logger): RepositoryFactory => {
  return RepositoryFactory.getInstance(logger);
};
