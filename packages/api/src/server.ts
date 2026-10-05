import Fastify, { type FastifyInstance } from 'fastify';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MetadataDatabase } from './db/database.js';
import { registerTransferRoutes } from './routes/transfers.js';
import type { StorageNodeClient } from './services/storage-client.js';
import { HttpStorageNodeClient } from './services/storage-client.js';

export function buildApiServer(
  database: MetadataDatabase,
  storageClient: StorageNodeClient = new HttpStorageNodeClient('http://localhost:9001'),
): FastifyInstance {
  const app = Fastify({ logger: false });
  app.addContentTypeParser(
    'application/octet-stream',
    (_request, payload, done) => done(null, payload),
  );
  registerTransferRoutes(app, database, storageClient);
  return app;
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const databasePath = process.env.DB_PATH ?? './data/api.db';
  await mkdir(dirname(databasePath), { recursive: true });
  const database = new MetadataDatabase(databasePath);
  const app = buildApiServer(database);
  app.listen({
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 8080),
  }).catch((error) => {
    app.log.error(error);
    database.close();
    process.exitCode = 1;
  });
}
