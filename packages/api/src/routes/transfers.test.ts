import { afterEach, describe, expect, it } from 'vitest';
import { MetadataDatabase } from '../db/database.js';
import { buildApiServer } from '../server.js';

const authToken = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

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
});
