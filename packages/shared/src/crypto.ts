const SECRET_BYTES = 32;
const HKDF_SALT = new Uint8Array(32);

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is required');
  }

  return globalThis.crypto;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error('secret must be exactly 32 bytes encoded as hex');
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }

  if (bytes.length !== SECRET_BYTES) {
    throw new Error('secret must be exactly 32 bytes encoded as hex');
  }

  return bytes;
}

async function importSecret(secret: string): Promise<CryptoKey> {
  return getCrypto().subtle.importKey(
    'raw',
    hexToBytes(secret) as BufferSource,
    'HKDF',
    false,
    ['deriveBits', 'deriveKey'],
  );
}

export function generateSecret(): string {
  const bytes = new Uint8Array(SECRET_BYTES);
  getCrypto().getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function deriveKeys(secret: string): Promise<{
  encKey: CryptoKey;
  authToken: Uint8Array;
}> {
  const baseKey = await importSecret(secret);
  const encoder = new TextEncoder();
  const cryptoApi = getCrypto();

  const [encKey, authBits] = await Promise.all([
    cryptoApi.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: HKDF_SALT,
        info: encoder.encode('voidshare-enc'),
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    ),
    cryptoApi.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: HKDF_SALT,
        info: encoder.encode('voidshare-auth'),
      },
      baseKey,
      256,
    ),
  ]);

  return { encKey, authToken: new Uint8Array(authBits) };
}
