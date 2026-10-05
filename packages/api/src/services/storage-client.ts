import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface StoredChunkResult {
  sizeBytes: number;
  checksumSha256: string;
}

export interface StorageNodeClient {
  putChunk(
    chunkId: string,
    input: NodeJS.ReadableStream,
    checksumSha256: string,
  ): Promise<StoredChunkResult>;
}

export class HttpStorageNodeClient implements StorageNodeClient {
  public constructor(private readonly endpoint: string) {}

  public putChunk(
    chunkId: string,
    input: NodeJS.ReadableStream,
    checksumSha256: string,
  ): Promise<StoredChunkResult> {
    const target = new URL(`/chunks/${encodeURIComponent(chunkId)}`, this.endpoint);
    const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      const outgoing = request(target, {
        method: 'PUT',
        headers: {
          'content-type': 'application/octet-stream',
          'x-checksum': checksumSha256,
        },
      }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => { body += chunk; });
        response.on('end', () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`storage node returned ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as StoredChunkResult);
          } catch {
            reject(new Error('storage node returned invalid JSON'));
          }
        });
      });
      outgoing.on('error', reject);
      input.on('error', reject);
      input.pipe(outgoing);
    });
  }
}
