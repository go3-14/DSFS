import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { FilesystemChunkStore } from './storage.js';

const checksum = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createStore(): Promise<FilesystemChunkStore> {
  const directory = await mkdtemp(join(tmpdir(), 'voidshare-node-'));
  temporaryDirectories.push(directory);
  return new FilesystemChunkStore(directory, 'node-test', 1024);
}

describe('FilesystemChunkStore', () => {
  it('puts, gets, checks, and deletes a chunk', async () => {
    const store = await createStore();
    const content = 'encrypted chunk bytes';
    const result = await store.putChunk('chunk-1', Readable.from([content]), checksum(content));

    expect(result).toEqual({ sizeBytes: content.length, checksumSha256: checksum(content) });
    expect(await store.hasChunk('chunk-1')).toBe(true);
    await expect(store.getChunk('chunk-1').then((stream) => stream.toArray())).resolves.toEqual([
      Buffer.from(content),
    ]);
    expect(await store.deleteChunk('chunk-1')).toBe(true);
    expect(await store.deleteChunk('chunk-1')).toBe(false);
    expect(await store.hasChunk('chunk-1')).toBe(false);
  });

  it('reports stored bytes and ignores temporary files', async () => {
    const store = await createStore();
    const content = '12345';
    await store.putChunk('chunk-1', Readable.from([content]), checksum(content));

    const health = await store.healthCheck();
    expect(health).toMatchObject({
      nodeId: 'node-test',
      status: 'HEALTHY',
      totalCapacityBytes: 1024,
      usedCapacityBytes: content.length,
      activeOperations: 0,
    });
    expect(await store.listChunks()).toEqual(['chunk-1']);
  });

  it('rejects path traversal and unsafe checksum input', async () => {
    const store = await createStore();

    await expect(store.hasChunk('../escape')).rejects.toThrow('invalid chunk ID');
    await expect(
      store.putChunk('chunk-1', Readable.from(['data']), 'not-a-checksum'),
    ).rejects.toThrow('invalid SHA-256 checksum');
  });
});
