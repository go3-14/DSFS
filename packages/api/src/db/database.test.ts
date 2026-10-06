import { describe, expect, it } from 'vitest';
import { MetadataDatabase } from './database.js';
import { hashToken } from '../services/tokens.js';

describe('metadata database migrations', () => {
  it('creates the coordination schema and is safe to run repeatedly', () => {
    const database = new MetadataDatabase();

    expect(database.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()).toEqual([
      { name: 'chunk_replicas' },
      { name: 'chunks' },
      { name: 'storage_nodes' },
      { name: 'transfers' },
    ]);
    expect(database.db.prepare('PRAGMA table_info(transfers)').all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'upload_session_hash' }),
        expect.objectContaining({ name: 'download_lease_until' }),
      ]),
    );

    database.migrate();
    expect(database.db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'").pluck().get()).toBe(4);
    database.close();
  });

  it('replaces an expired download lease and invalidates the previous token hash', () => {
    const database = new MetadataDatabase();
    const authToken = '33'.repeat(32);
    const created = database.createTransfer({
      authToken,
      totalSizeBytes: 1,
      chunkCount: 1,
      chunkSizeBytes: 1,
      encryptedFileName: null,
      ttlSeconds: 600,
      maxDownloads: 1,
    });
    database.db.prepare("UPDATE transfers SET status = 'READY', expires_at = '2026-12-31T00:00:00.000Z' WHERE file_id = ?").run(created.fileId);
    const first = database.acquireDownloadLease(created.fileId, hashToken(authToken), new Date('2026-10-01T00:00:00.000Z'))!;
    database.db.prepare("UPDATE transfers SET download_lease_until = '2025-12-31T23:59:00.000Z' WHERE file_id = ?").run(created.fileId);
    const second = database.acquireDownloadLease(created.fileId, hashToken(authToken), new Date('2026-10-01T00:01:00.000Z'))!;
    expect(second.downloadToken).not.toBe(first.downloadToken);
    expect(second.transfer.download_token_hash).not.toBe(hashToken(first.downloadToken));
    database.close();
  });
});
