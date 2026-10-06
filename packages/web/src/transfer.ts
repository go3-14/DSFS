import {
  createChunkAad,
  decryptChunk,
  deriveKeys,
  encryptChunk,
  encryptFilename,
  generateSecret,
  sha256,
} from '@voidshare/shared';

const CHUNK_OVERHEAD_BYTES = 28;
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
const CONCURRENCY = 3;

export interface UploadResult { fileId: string; secret: string; }
export interface DownloadResult { bytes: Uint8Array; encryptedFileName: string | null; }

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function responseJson(response: Response): Promise<any> {
  if (!response.ok) throw new Error(`Transfer request failed (${response.status})`);
  return response.json();
}

async function withConcurrency<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const secret = generateSecret();
  const { encKey, authToken } = await deriveKeys(secret);
  const chunkCount = Math.ceil(file.size / CHUNK_SIZE_BYTES);
  const totalSizeBytes = file.size + chunkCount * CHUNK_OVERHEAD_BYTES;
  const init = await responseJson(await fetch('/api/transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      authToken: bytesToHex(authToken),
      totalSizeBytes,
      chunkCount,
      chunkSizeBytes: CHUNK_SIZE_BYTES + CHUNK_OVERHEAD_BYTES,
      encryptedFileName: await encryptFilename(file.name, secret),
      ttlSeconds: 86400,
      maxDownloads: 1,
    }),
  }));
  const indices = Array.from({ length: chunkCount }, (_, index) => index);
  await withConcurrency(indices, async (index) => {
    const start = index * CHUNK_SIZE_BYTES;
    const plaintextChunk = new Uint8Array(await file.slice(start, start + CHUNK_SIZE_BYTES).arrayBuffer());
    const encrypted = await encryptChunk(encKey, plaintextChunk, createChunkAad(init.fileId, index, chunkCount));
    const checksum = await sha256(encrypted);
    const response = await fetch(`/api/transfers/${init.fileId}/chunks/${index}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${init.uploadToken}`,
        'content-type': 'application/octet-stream',
        'x-chunk-checksum-sha256': checksum,
      },
      body: encrypted as unknown as BodyInit,
    });
    if (!response.ok) throw new Error(`Chunk ${index + 1} could not be uploaded`);
  });
  await responseJson(await fetch(`/api/transfers/${init.fileId}/finalize`, {
    method: 'POST',
    headers: { authorization: `Bearer ${init.uploadToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ totalChunksUploaded: chunkCount }),
  }));
  return { fileId: init.fileId, secret };
}

export async function downloadFile(fileId: string, secret: string): Promise<DownloadResult> {
  const { encKey, authToken } = await deriveKeys(secret);
  const access = await responseJson(await fetch(`/api/transfers/${encodeURIComponent(fileId)}/access`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bytesToHex(authToken)}` },
  }));
  const chunks = new Map<number, Uint8Array>();
  await withConcurrency(access.manifest, async (manifestChunk: { chunkIndex: number; checksumSha256: string }) => {
    const response = await fetch(`/api/transfers/${encodeURIComponent(fileId)}/chunks/${manifestChunk.chunkIndex}`, {
      headers: { authorization: `Bearer ${access.downloadToken}` },
    });
    if (!response.ok) throw new Error(`Chunk ${manifestChunk.chunkIndex + 1} could not be downloaded`);
    const encrypted = new Uint8Array(await response.arrayBuffer());
    if (await sha256(encrypted) !== manifestChunk.checksumSha256) {
      throw new Error(`Chunk ${manifestChunk.chunkIndex + 1} failed its integrity check`);
    }
    chunks.set(manifestChunk.chunkIndex, await decryptChunk(
      encKey,
      encrypted,
      createChunkAad(fileId, manifestChunk.chunkIndex, access.manifest.length),
    ));
  });
  await responseJson(await fetch(`/api/transfers/${encodeURIComponent(fileId)}/complete`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access.downloadToken}` },
  }));
  const ordered = Array.from({ length: access.manifest.length }, (_, index) => chunks.get(index)!);
  const bytes = new Uint8Array(ordered.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of ordered) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, encryptedFileName: access.encryptedFileName ?? null };
}
