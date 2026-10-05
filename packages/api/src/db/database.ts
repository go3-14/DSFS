import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_SCHEMA_PATH = fileURLToPath(new URL('./schema.sql', import.meta.url));

export class MetadataDatabase {
  public readonly db: Database.Database;

  public constructor(
    filePath = ':memory:',
    schemaPath = DEFAULT_SCHEMA_PATH,
  ) {
    this.db = new Database(filePath);
    this.db.pragma('foreign_keys = ON');
    this.migrate(schemaPath);
  }

  public migrate(schemaPath = DEFAULT_SCHEMA_PATH): void {
    this.db.exec(readFileSync(schemaPath, 'utf8'));
  }

  public close(): void {
    this.db.close();
  }
}
