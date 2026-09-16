import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'neo_';
const TOKEN_BYTES = 24;

/**
 * Agent tokens are shown once and stored only as a SHA-256 digest, so a dump of
 * the database cannot be replayed against the ingest endpoint.
 */
export function generateAgentToken(): { token: string; hash: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('hex')}`;
  return { token, hash: hashAgentToken(token) };
}

export function hashAgentToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function tokenHashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Display form: the prefix plus the last four characters. */
export function tokenHint(token: string): string {
  return `${TOKEN_PREFIX}…${token.slice(-4)}`;
}
