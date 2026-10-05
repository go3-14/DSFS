import { describe, expect, it } from 'vitest';
import {
  createChunkAad,
  decryptChunk,
  deriveKeys,
  encryptChunk,
  generateSecret,
} from './crypto.js';

describe('secret generation and key derivation', () => {
  it('generates a 32-byte secret encoded as 64 lowercase hex characters', () => {
    const secret = generateSecret();

    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives an AES-256 encryption key and a separate 32-byte auth token', async () => {
    const { encKey, authToken } = await deriveKeys(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    );

    expect(encKey.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(encKey.usages).toEqual(expect.arrayContaining(['decrypt', 'encrypt']));
    expect(authToken).toBeInstanceOf(Uint8Array);
    expect(authToken).toHaveLength(32);

    expect(encKey.extractable).toBe(false);

    const secondDerivation = await deriveKeys(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    );
    expect(secondDerivation.authToken).toEqual(authToken);
  });

  it('rejects malformed secrets', async () => {
    await expect(deriveKeys('not-a-secret')).rejects.toThrow(
      'secret must be exactly 32 bytes encoded as hex',
    );
  });

  it('constructs AAD from the file ID and unsigned chunk metadata', () => {
    const aad = createChunkAad('file-123', 2, 10);

    expect(new TextDecoder().decode(aad.slice(0, 8))).toBe('file-123');
    expect(new DataView(aad.buffer).getUint32(8)).toBe(2);
    expect(new DataView(aad.buffer).getUint32(12)).toBe(10);
  });

  it('encrypts and decrypts a chunk with an IV prefix', async () => {
    const { encKey } = await deriveKeys(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    );
    const plaintext = new TextEncoder().encode('ciphertext only');
    const aad = createChunkAad('file-123', 0, 1);

    const ciphertext = await encryptChunk(encKey, plaintext, aad);
    const decrypted = await decryptChunk(encKey, ciphertext, aad);

    expect(ciphertext).toHaveLength(plaintext.length + 12 + 16);
    expect(decrypted).toEqual(plaintext);
  });
});
