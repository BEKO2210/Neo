import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const INFO = 'neo:user-api-keys:v1';

export class SecretsNotConfiguredError extends Error {
  constructor() {
    super('NEO_SESSION_SECRET must be set before Neo can store user API keys.');
    this.name = 'SecretsNotConfiguredError';
  }
}

/**
 * Derives the encryption key from the deployment's session secret.
 *
 * HKDF with a fixed info string keeps this key domain-separated from the JWT
 * signing use of the same secret, so neither can be used to attack the other.
 * Rotating NEO_SESSION_SECRET therefore invalidates stored keys by design —
 * users re-enter them, which is the correct outcome for a rotated secret.
 */
function encryptionKey(): Buffer {
  const secret = env.sessionSecret;
  if (!secret || secret.length < 32) throw new SecretsNotConfiguredError();
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), INFO, KEY_LENGTH));
}

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function seal(plaintext: string): SealedSecret {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

/** Returns null when the payload is corrupt or was sealed with another secret. */
export function unseal(sealed: SealedSecret): string | null {
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(sealed.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Last four characters of a key, for showing the operator which key is stored
 * without ever sending the key itself back to the browser.
 */
export function hint(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return tail.length === 4 ? `••••${tail}` : '••••';
}
