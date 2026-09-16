import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/auth/password';
import { hint, seal, SecretsNotConfiguredError, unseal } from '@/lib/crypto/secrets';
import { generateAgentToken, hashAgentToken, tokenHint } from '@/lib/crypto/tokens';

const SECRET_A = 'a'.repeat(48);
const SECRET_B = 'b'.repeat(48);
const saved = process.env.NEO_SESSION_SECRET;

beforeEach(() => {
  process.env.NEO_SESSION_SECRET = SECRET_A;
});

afterEach(() => {
  if (saved === undefined) delete process.env.NEO_SESSION_SECRET;
  else process.env.NEO_SESSION_SECRET = saved;
});

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery 9');
    expect(await verifyPassword('correct horse battery 9', stored)).toBe(true);
    expect(await verifyPassword('correct horse battery 8', stored)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    expect(await hashPassword('same-password-1')).not.toBe(await hashPassword('same-password-1'));
  });

  it('rejects a malformed or truncated stored hash instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt:aabb:ccdd')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt:aa:bb')).toBe(false);
  });

  it('states what a weak password is missing', () => {
    expect(passwordProblem('short1')).toContain('10 characters');
    expect(passwordProblem('nodigitsatall')).toContain('digit');
    expect(passwordProblem('has1digit-and-letters')).toBeNull();
  });
});

describe('secret sealing', () => {
  it('round-trips a key', () => {
    const sealed = seal('sk-ant-secret-value');
    expect(sealed.ciphertext).not.toContain('sk-ant');
    expect(unseal(sealed)).toBe('sk-ant-secret-value');
  });

  it('uses a fresh nonce for every seal', () => {
    expect(seal('same').iv).not.toBe(seal('same').iv);
  });

  it('refuses to decrypt under a rotated session secret', () => {
    const sealed = seal('sk-ant-secret-value');
    process.env.NEO_SESSION_SECRET = SECRET_B;
    expect(unseal(sealed)).toBeNull();
  });

  it('detects tampering with the ciphertext', () => {
    const sealed = seal('sk-ant-secret-value');
    const flipped = Buffer.from(sealed.ciphertext, 'base64');
    flipped.writeUInt8(flipped.readUInt8(0) ^ 0xff, 0);
    expect(unseal({ ...sealed, ciphertext: flipped.toString('base64') })).toBeNull();
  });

  it('fails loudly when no session secret is configured', () => {
    delete process.env.NEO_SESSION_SECRET;
    expect(() => seal('x')).toThrow(SecretsNotConfiguredError);
  });

  it('masks all but the last four characters', () => {
    expect(hint('sk-ant-api03-abcdWXYZ')).toBe('••••WXYZ');
    expect(hint('ab')).toBe('••••');
  });
});

describe('agent tokens', () => {
  it('produces a prefixed token whose hash is stable and not the token', () => {
    const { token, hash } = generateAgentToken();
    expect(token.startsWith('neo_')).toBe(true);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hashAgentToken(token)).toBe(hash);
  });

  it('never repeats a token', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateAgentToken().token));
    expect(tokens.size).toBe(50);
  });

  it('shows only the tail', () => {
    expect(tokenHint('neo_0123456789abcd')).toBe('neo_…abcd');
  });
});
