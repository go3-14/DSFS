import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MetadataDatabase } from './db/database.js';
import { buildApiServer } from './server.js';

const databasePath = process.env.DB_PATH ?? './data/api.db';
await mkdir(dirname(databasePath), { recursive: true });
const database = new MetadataDatabase(databasePath);
const app = buildApiServer(database);

try {
  await app.listen({
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 8080),
  });
} catch (error) {
  app.log.error(error);
  database.close();
  process.exitCode = 1;
}
