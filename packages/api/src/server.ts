import Fastify, { type FastifyInstance } from 'fastify';
import { MetadataDatabase } from './db/database.js';
import { registerTransferRoutes } from './routes/transfers.js';

export function buildApiServer(database: MetadataDatabase): FastifyInstance {
  const app = Fastify({ logger: false });
  registerTransferRoutes(app, database);
  return app;
}
