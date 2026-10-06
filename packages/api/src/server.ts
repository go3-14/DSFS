import Fastify, { type FastifyInstance } from 'fastify';
import { MetadataDatabase } from './db/database.js';
import { registerTransferRoutes } from './routes/transfers.js';
import type { StorageNodeClient } from './services/storage-client.js';
import { HttpStorageNodeClient } from './services/storage-client.js';
import type { ChunkReplicator } from './replication/replication.js';

export function buildApiServer(
  database: MetadataDatabase,
  storageClient: StorageNodeClient = new HttpStorageNodeClient('http://localhost:9001'),
  replicator?: ChunkReplicator,
): FastifyInstance {
  const app = Fastify({ logger: false });
  app.addContentTypeParser(
    'application/octet-stream',
    (_request, payload, done) => done(null, payload),
  );
  registerTransferRoutes(app, database, storageClient, replicator);
  return app;
}
