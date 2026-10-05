import { describe, expect, it } from 'vitest';
import { MetadataDatabase } from './database.js';

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
});
