import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { MetadataDatabase } from '../db/database.js';
import type { StorageNodeClient } from '../services/storage-client.js';
import { hashToken, isTokenHex } from '../services/tokens.js';

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TTLS = new Set([600, 3600, 86400]);

interface InitBody {
  authToken: string;
  totalSizeBytes: number;
  chunkCount: number;
  chunkSizeBytes?: number;
  encryptedFileName?: string | null;
  ttlSeconds: number;
  maxDownloads?: number;
}

interface ChunkParams {
  fileId: string;
  index: string;
}

interface FinalizeParams {
  fileId: string;
}

interface FinalizeBody {
  totalChunksUploaded?: number;
}

interface StatusParams {
  fileId: string;
}

function bearerToken(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) {
    return undefined;
  }
  const token = value.slice('Bearer '.length);
  return isTokenHex(token) ? token : undefined;
}

function tokensEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validateInitBody(body: Partial<InitBody>): asserts body is InitBody {
  const chunkSizeBytes = body.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE_BYTES;
  const expectedChunkCount = isPositiveInteger(body.totalSizeBytes) && isPositiveInteger(chunkSizeBytes)
    ? Math.ceil(body.totalSizeBytes / chunkSizeBytes)
    : 0;
  if (
    !isTokenHex(body.authToken) ||
    !isPositiveInteger(body.totalSizeBytes) ||
    body.totalSizeBytes > MAX_FILE_SIZE_BYTES ||
    !isPositiveInteger(body.chunkCount) ||
    body.chunkCount !== expectedChunkCount ||
    !isPositiveInteger(chunkSizeBytes) ||
    chunkSizeBytes > 10 * 1024 * 1024 ||
    !ALLOWED_TTLS.has(body.ttlSeconds!) ||
    (body.maxDownloads !== undefined &&
      (!Number.isSafeInteger(body.maxDownloads) || body.maxDownloads < 0)) ||
    (body.encryptedFileName !== undefined &&
      body.encryptedFileName !== null &&
      typeof body.encryptedFileName !== 'string')
  ) {
    throw new Error('invalid transfer initialization');
  }
}

export function registerTransferRoutes(
  app: FastifyInstance,
  database: MetadataDatabase,
  storageClient: StorageNodeClient,
): void {
  app.post<{ Body: Partial<InitBody> }>('/api/transfers', async (request, reply) => {
    try {
      validateInitBody(request.body ?? {});
      const chunkSizeBytes = request.body.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE_BYTES;
      const chunkCount = request.body.chunkCount!;
      const transfer = database.createTransfer({
        authToken: request.body.authToken!,
        totalSizeBytes: request.body.totalSizeBytes!,
        chunkCount,
        chunkSizeBytes,
        encryptedFileName: request.body.encryptedFileName ?? null,
        ttlSeconds: request.body.ttlSeconds!,
        maxDownloads: request.body.maxDownloads ?? 1,
      });
      return reply.code(201).send({
        fileId: transfer.fileId,
        status: transfer.status,
        expiresAt: transfer.expiresAt,
        uploadToken: transfer.uploadToken,
        chunkUploads: Array.from({ length: chunkCount }, (_, chunkIndex) => ({
          chunkIndex,
          uploadUrl: `/api/transfers/${transfer.fileId}/chunks/${chunkIndex}`,
        })),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid transfer initialization') {
        return reply.code(400).send({ error: 'VALIDATION_ERROR' });
      }
      throw error;
    }
  });

  app.put<{ Params: ChunkParams }>('/api/transfers/:fileId/chunks/:index', async (request, reply) => {
    const transfer = database.getTransfer(request.params.fileId);
    const token = bearerToken(request.headers.authorization);
    const providedHash = token ? hashToken(token) : undefined;
    if (!transfer || !providedHash || !tokensEqual(providedHash, transfer.upload_session_hash)) {
      return reply.code(404).send({ error: 'TRANSFER_NOT_FOUND' });
    }

    const chunkIndex = Number(request.params.index);
    const checksum = request.headers['x-chunk-checksum-sha256'];
    if (
      !Number.isSafeInteger(chunkIndex) ||
      chunkIndex < 0 ||
      chunkIndex >= transfer.chunk_count ||
      typeof checksum !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(checksum)
    ) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR' });
    }

    const result = await storageClient.putChunk(
      `${request.params.fileId}-${chunkIndex}`,
      request.body as NodeJS.ReadableStream,
      checksum,
    );
    database.recordStoredChunk(request.params.fileId, chunkIndex, result);
    return reply.code(200).send({
      chunkIndex,
      storedSizeBytes: result.sizeBytes,
      checksumVerified: result.checksumSha256.toLowerCase() === checksum.toLowerCase(),
      replicationAcknowledged: 1,
    });
  });

  app.post<{ Params: FinalizeParams; Body: FinalizeBody }>(
    '/api/transfers/:fileId/finalize',
    async (request, reply) => {
      const transfer = database.getTransfer(request.params.fileId);
      const token = bearerToken(request.headers.authorization);
      const providedHash = token ? hashToken(token) : undefined;
      if (!transfer || !providedHash || !tokensEqual(providedHash, transfer.upload_session_hash)) {
        return reply.code(404).send({ error: 'TRANSFER_NOT_FOUND' });
      }

      const uploadedCount = request.body?.totalChunksUploaded;
      if (uploadedCount !== undefined && uploadedCount !== database.countStoredChunks(request.params.fileId)) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR' });
      }
      const finalized = database.finalizeTransfer(request.params.fileId);
      if (!finalized) {
        return reply.code(409).send({ error: 'UPLOAD_INCOMPLETE' });
      }
      return reply.code(200).send({
        fileId: finalized.file_id,
        status: finalized.status,
        expiresAt: finalized.expires_at,
      });
    },
  );

  app.get<{ Params: StatusParams }>('/api/transfers/:fileId/status', async (request, reply) => {
    const transfer = database.getTransfer(request.params.fileId);
    const token = bearerToken(request.headers.authorization);
    const providedHash = token ? hashToken(token) : undefined;
    if (!transfer || !providedHash || !tokensEqual(providedHash, transfer.upload_session_hash)) {
      return reply.code(404).send({ error: 'TRANSFER_NOT_FOUND' });
    }

    const uploadedChunkIndices = database.getStoredChunkIndices(request.params.fileId);
    const uploaded = new Set(uploadedChunkIndices);
    const missingChunkIndices = Array.from(
      { length: transfer.chunk_count },
      (_, index) => index,
    ).filter((index) => !uploaded.has(index));
    return reply.code(200).send({
      fileId: transfer.file_id,
      status: transfer.status,
      chunkCount: transfer.chunk_count,
      uploadedChunkIndices,
      missingChunkIndices,
      expiresAt: transfer.expires_at,
    });
  });
}
