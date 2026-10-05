import { describe, expect, it } from 'vitest';
import { deriveKeys, generateSecret } from './crypto.js';

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
});
