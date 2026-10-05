import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFileId, createToken, hashToken } from '../services/tokens.js';

export interface CreateTransferInput {
  authToken: string;
  totalSizeBytes: number;
  chunkCount: number;
  chunkSizeBytes: number;
  encryptedFileName: string | null;
  ttlSeconds: number;
  maxDownloads: number;
}

export interface CreatedTransfer {
  fileId: string;
  status: 'CREATING';
  expiresAt: string;
  uploadToken: string;
}

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

  public createTransfer(input: CreateTransferInput): CreatedTransfer {
    const fileId = createFileId();
    const uploadToken = createToken();
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
    this.db.prepare(`
      INSERT INTO transfers (
        file_id, capability_hash, upload_session_hash, original_name_encrypted,
        total_size_bytes, chunk_count, chunk_size_bytes, status,
        max_downloads, expires_at
      ) VALUES (@fileId, @capabilityHash, @uploadSessionHash, @encryptedFileName,
        @totalSizeBytes, @chunkCount, @chunkSizeBytes, 'CREATING',
        @maxDownloads, @expiresAt)
    `).run({
      fileId,
      capabilityHash: hashToken(input.authToken),
      uploadSessionHash: hashToken(uploadToken),
      encryptedFileName: input.encryptedFileName,
      totalSizeBytes: input.totalSizeBytes,
      chunkCount: input.chunkCount,
      chunkSizeBytes: input.chunkSizeBytes,
      maxDownloads: input.maxDownloads,
      expiresAt,
    });

    return { fileId, status: 'CREATING', expiresAt, uploadToken };
  }

  public close(): void {
    this.db.close();
  }
}
