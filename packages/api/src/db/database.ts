import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFileId, createToken, hashToken } from '../services/tokens.js';
import type { StoredChunkResult } from '../services/storage-client.js';

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

export interface TransferRow {
  file_id: string;
  capability_hash: string;
  upload_session_hash: string;
  total_size_bytes: number;
  chunk_count: number;
  chunk_size_bytes: number;
  status: string;
  expires_at: string;
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

  public getTransfer(fileId: string): TransferRow | undefined {
    return this.db.prepare('SELECT * FROM transfers WHERE file_id = ?').get(fileId) as TransferRow | undefined;
  }

  public recordStoredChunk(fileId: string, chunkIndex: number, result: StoredChunkResult): { chunkId: string } {
    const chunkId = `${fileId}-${chunkIndex}`;
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO chunks (chunk_id, file_id, chunk_index, size_bytes, checksum_sha256, status)
        VALUES (?, ?, ?, ?, ?, 'STORED')
        ON CONFLICT(file_id, chunk_index) DO UPDATE SET
          size_bytes = excluded.size_bytes,
          checksum_sha256 = excluded.checksum_sha256,
          status = 'STORED'
      `).run(chunkId, fileId, chunkIndex, result.sizeBytes, result.checksumSha256);
      this.db.prepare(`
        UPDATE transfers SET status = 'UPLOADING'
        WHERE file_id = ? AND status = 'CREATING'
      `).run(fileId);
    });
    transaction();
    return { chunkId };
  }

  public countStoredChunks(fileId: string): number {
    return this.db.prepare(
      "SELECT count(*) AS count FROM chunks WHERE file_id = ? AND status = 'STORED'",
    ).pluck().get(fileId) as number;
  }

  public finalizeTransfer(fileId: string): TransferRow | undefined {
    const transfer = this.getTransfer(fileId);
    if (!transfer || this.countStoredChunks(fileId) !== transfer.chunk_count) {
      return undefined;
    }
    this.db.prepare(`
      UPDATE transfers SET status = 'READY'
      WHERE file_id = ? AND status IN ('CREATING', 'UPLOADING')
    `).run(fileId);
    return this.getTransfer(fileId);
  }

  public close(): void {
    this.db.close();
  }
}
