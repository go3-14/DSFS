import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tsxCli = resolve(root, 'node_modules/tsx/dist/cli.mjs');
const nodes = [
  { nodeId: 'node-1', port: 9001 },
  { nodeId: 'node-2', port: 9002 },
  { nodeId: 'node-3', port: 9003 },
];
const children = nodes.map(({ nodeId, port }) => spawn(
  process.execPath,
  [tsxCli, 'packages/storage-node/src/server.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ID: nodeId, PORT: String(port), DATA_DIR: `./data/${nodeId}` },
  },
));

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGINT');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => {
  if (!stopping && code !== 0) {
    stop();
    process.exitCode = code ?? 1;
  }
});
