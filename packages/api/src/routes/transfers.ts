import type { FastifyInstance } from 'fastify';
import { MetadataDatabase } from '../db/database.js';
import { isTokenHex } from '../services/tokens.js';

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

export function registerTransferRoutes(app: FastifyInstance, database: MetadataDatabase): void {
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
}
