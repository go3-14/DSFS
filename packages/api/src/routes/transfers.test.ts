import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { MetadataDatabase } from '../db/database.js';
import { buildApiServer } from '../server.js';
import type { StorageNodeClient, StoredChunkResult } from '../services/storage-client.js';

const authToken = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

class FakeStorageNodeClient implements StorageNodeClient {
  public readonly writes: Array<{ chunkId: string; body: Buffer; checksumSha256: string }> = [];

  public async putChunk(
    chunkId: string,
    input: NodeJS.ReadableStream,
    checksumSha256: string,
  ): Promise<StoredChunkResult> {
    const chunks: Buffer[] = [];
    for await (const chunk of input as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    this.writes.push({ chunkId, body, checksumSha256 });
    return {
      sizeBytes: body.byteLength,
      checksumSha256: createHash('sha256').update(body).digest('hex'),
    };
  }
}

describe('POST /api/transfers', () => {
  let database: MetadataDatabase | undefined;
  let app: Awaited<ReturnType<typeof buildApiServer>> | undefined;

  afterEach(async () => {
    await app?.close();
    database?.close();
  });

  it('creates a transfer and returns a separate upload session token', async () => {
    database = new MetadataDatabase();
    app = buildApiServer(database);

    const response = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: {
        authToken,
        totalSizeBytes: 8 * 1024 * 1024,
        chunkCount: 2,
        chunkSizeBytes: 4 * 1024 * 1024,
        ttlSeconds: 3600,
        maxDownloads: 1,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ status: 'CREATING' });
    expect(body.fileId).toMatch(/^[a-f0-9]{32}$/);
    expect(body.uploadToken).toMatch(/^[a-f0-9]{64}$/);
    expect(body.chunkUploads).toHaveLength(2);
    expect(body.uploadToken).not.toBe(authToken);

    const row = database.db.prepare('SELECT * FROM transfers WHERE file_id = ?').get(body.fileId) as Record<string, unknown>;
    expect(row.capability_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.upload_session_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.capability_hash).not.toBe(authToken);
    expect(row.upload_session_hash).not.toBe(body.uploadToken);
  });

  it('rejects invalid size, TTL, and chunk-count combinations', async () => {
    database = new MetadataDatabase();
    app = buildApiServer(database);

    const response = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: {
        authToken,
        totalSizeBytes: 200 * 1024 * 1024 + 1,
        chunkCount: 1,
        chunkSizeBytes: 4 * 1024 * 1024,
        ttlSeconds: 601,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(database.db.prepare('SELECT count(*) AS count FROM transfers').pluck().get()).toBe(0);
  });

  it('authorizes upload, forwards the stream, and records the stored chunk', async () => {
    database = new MetadataDatabase();
    const storage = new FakeStorageNodeClient();
    app = buildApiServer(database, storage);
    const init = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { authToken, totalSizeBytes: 5, chunkCount: 1, chunkSizeBytes: 4 * 1024 * 1024, ttlSeconds: 600 },
    });
    const initialized = init.json();
    const content = Buffer.from('hello');
    const checksum = createHash('sha256').update(content).digest('hex');

    const upload = await app.inject({
      method: 'PUT',
      url: `/api/transfers/${initialized.fileId}/chunks/0`,
      headers: {
        authorization: `Bearer ${initialized.uploadToken}`,
        'content-type': 'application/octet-stream',
        'x-chunk-checksum-sha256': checksum,
      },
      payload: content,
    });

    expect(upload.statusCode).toBe(200);
    expect(storage.writes).toEqual([{ chunkId: `${initialized.fileId}-0`, body: content, checksumSha256: checksum }]);
    expect(database.db.prepare('SELECT status FROM transfers WHERE file_id = ?').pluck().get(initialized.fileId)).toBe('UPLOADING');
    expect(database.db.prepare('SELECT chunk_index, size_bytes, checksum_sha256, status FROM chunks WHERE file_id = ?').get(initialized.fileId)).toEqual({
      chunk_index: 0,
      size_bytes: 5,
      checksum_sha256: checksum,
      status: 'STORED',
    });
  });

  it('does not forward a chunk with an invalid upload-session token', async () => {
    database = new MetadataDatabase();
    const storage = new FakeStorageNodeClient();
    app = buildApiServer(database, storage);
    const init = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { authToken, totalSizeBytes: 5, chunkCount: 1, ttlSeconds: 600 },
    });
    const initialized = init.json();

    const response = await app.inject({
      method: 'PUT',
      url: `/api/transfers/${initialized.fileId}/chunks/0`,
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/octet-stream',
      },
      payload: 'hello',
    });

    expect(response.statusCode).toBe(404);
    expect(storage.writes).toHaveLength(0);
  });
});
