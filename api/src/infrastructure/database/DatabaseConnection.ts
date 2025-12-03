import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../Logger';

/**
 * DatabaseConnection manages SQLite database lifecycle and migrations.
 * Implements singleton pattern to ensure single connection across application.
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection | null = null;
  private db: Database.Database | null = null;
  private logger: Logger;
  private dbPath: string;

  private constructor(dbPath?: string, logger?: Logger) {
    this.logger = logger || new Logger('database');

    // Default database path: api/data/transcripts.db
    this.dbPath = dbPath || path.join(__dirname, '../../../data/transcripts.db');

    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      this.logger.info('Created data directory', { path: dataDir });
    }
  }

  /**
   * Get singleton instance of DatabaseConnection
   */
  static getInstance(dbPath?: string, logger?: Logger): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection(dbPath, logger);
    }
    return DatabaseConnection.instance;
  }

  /**
   * Initialize database connection and run migrations
   */
  initialize(): Database.Database {
    if (this.db) {
      return this.db;
    }

    this.logger.info('Initializing database connection', { path: this.dbPath });

    try {
      // Open database connection
      this.db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? (msg: unknown) => {
          this.logger.debug(String(msg));
        } : undefined
      });

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Run migrations
      this.runMigrations();

      this.logger.info('Database initialized successfully', {
        path: this.dbPath,
        journalMode: this.db.pragma('journal_mode', { simple: true }),
        foreignKeys: this.db.pragma('foreign_keys', { simple: true })
      });

      return this.db;
    } catch (error: any) {
      this.logger.error('Failed to initialize database', error, { path: this.dbPath });
      throw error;
    }
  }

  /**
   * Get database instance (initializes if not already done)
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      return this.initialize();
    }
    return this.db;
  }

  /**
   * Run database migrations
   */
  private runMigrations(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    this.logger.info('Running database migrations');

    // Create migrations table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    // Get list of applied migrations
    const appliedMigrations = this.db
      .prepare('SELECT version FROM migrations ORDER BY version')
      .all()
      .map((row: any) => row.version);

    this.logger.debug('Applied migrations', { count: appliedMigrations.length, versions: appliedMigrations });

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      this.logger.warn('Migrations directory not found', { path: migrationsDir });
      return;
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    // Apply pending migrations
    let appliedCount = 0;
    for (const file of migrationFiles) {
      const version = file.split('_')[0]; // Extract version (e.g., '001' from '001_initial_schema.sql')

      if (appliedMigrations.includes(version)) {
        continue; // Skip already applied migrations
      }

      this.logger.info('Applying migration', { file, version });

      try {
        // Read migration SQL
        const migrationPath = path.join(migrationsDir, file);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

        // Execute migration in transaction
        const transaction = this.db.transaction(() => {
          this.db!.exec(migrationSQL);

          // Record migration
          this.db!.prepare(`
            INSERT INTO migrations (version, name, applied_at)
            VALUES (?, ?, ?)
          `).run(version, file, new Date().toISOString());
        });

        transaction();
        appliedCount++;

        this.logger.info('Migration applied successfully', { file, version });
      } catch (error: any) {
        this.logger.error('Migration failed', error, { file, version });
        throw new Error(`Migration ${file} failed: ${error.message}`);
      }
    }

    if (appliedCount > 0) {
      this.logger.info('Migrations completed', { appliedCount });
    } else {
      this.logger.debug('No new migrations to apply');
    }
  }

  /**
   * Get database health status
   */
  getHealth(): { healthy: boolean; error?: string; stats?: any } {
    try {
      if (!this.db) {
        return { healthy: false, error: 'Database not initialized' };
      }

      // Test database connection with simple query
      const result = this.db.prepare('SELECT 1 as test').get();

      // Get database statistics
      const stats = {
        size: fs.statSync(this.dbPath).size,
        tables: this.db.prepare(`
          SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'
        `).get(),
        transcripts: this.db.prepare('SELECT COUNT(*) as count FROM transcripts').get(),
        jobs: this.db.prepare('SELECT COUNT(*) as count FROM jobs').get()
      };

      return { healthy: true, stats };
    } catch (error: any) {
      this.logger.error('Database health check failed', error);
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.logger.info('Closing database connection');
      this.db.close();
      this.db = null;
      DatabaseConnection.instance = null;
    }
  }

  /**
   * Backup database to specified path
   */
  async backup(backupPath?: string): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const finalBackupPath = backupPath || path.join(
      path.dirname(this.dbPath),
      'backups',
      `transcripts-${timestamp}.db`
    );

    // Ensure backup directory exists
    const backupDir = path.dirname(finalBackupPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    this.logger.info('Creating database backup', {
      source: this.dbPath,
      destination: finalBackupPath
    });

    try {
      // Use SQLite backup API
      await this.db.backup(finalBackupPath);

      const backupSize = fs.statSync(finalBackupPath).size;
      this.logger.info('Database backup completed', {
        path: finalBackupPath,
        size: backupSize
      });

      return finalBackupPath;
    } catch (error: any) {
      this.logger.error('Database backup failed', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  getStats(): any {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      return {
        filePath: this.dbPath,
        fileSize: fs.statSync(this.dbPath).size,
        journalMode: this.db.pragma('journal_mode', { simple: true }),
        pageSize: this.db.pragma('page_size', { simple: true }),
        pageCount: this.db.pragma('page_count', { simple: true }),
        cacheSize: this.db.pragma('cache_size', { simple: true }),
        foreignKeys: this.db.pragma('foreign_keys', { simple: true }),
        tables: {
          transcripts: this.db.prepare('SELECT COUNT(*) as count FROM transcripts').get(),
          jobs: this.db.prepare('SELECT COUNT(*) as count FROM jobs').get(),
          jobResults: this.db.prepare('SELECT COUNT(*) as count FROM job_results').get()
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get database stats', error);
      throw error;
    }
  }
}

// Export singleton instance getter
export const getDatabaseConnection = (dbPath?: string, logger?: Logger): DatabaseConnection => {
  return DatabaseConnection.getInstance(dbPath, logger);
};
