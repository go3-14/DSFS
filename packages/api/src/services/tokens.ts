import { createHash, randomBytes } from 'node:crypto';

const TOKEN_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export function createToken(): string {
  return randomBytes(32).toString('hex');
}

export function createFileId(): string {
  return randomBytes(16).toString('hex');
}

export function hashToken(token: string): string {
  if (!TOKEN_HEX_PATTERN.test(token)) {
    throw new Error('token must be 32 bytes encoded as hex');
  }
  return createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');
}

export function isTokenHex(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_HEX_PATTERN.test(value);
}
