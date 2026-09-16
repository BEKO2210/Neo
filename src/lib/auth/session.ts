import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { NeoUser, UserRole } from '@/lib/account/types';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';

export const SESSION_COOKIE = 'neo_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export class AuthNotConfiguredError extends Error {
  constructor() {
    super('NEO_SESSION_SECRET (32+ characters) must be set before Neo can accept sign-ins.');
    this.name = 'AuthNotConfiguredError';
  }
}

function secretKey(): Uint8Array {
  const secret = env.sessionSecret;
  if (!secret || secret.length < 32) throw new AuthNotConfiguredError();
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: NeoUser): Promise<string> {
  return new SignJWT({ userId: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setSubject(user.id)
    .setIssuer('neo')
    .setAudience('neo-command-center')
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: 'neo',
      audience: 'neo-command-center',
    });
    const userId = typeof payload.userId === 'string' ? payload.userId : null;
    const email = typeof payload.email === 'string' ? payload.email : null;
    const role = payload.role === 'owner' ? 'owner' : 'member';
    if (!userId || !email) return null;
    return { userId, email, role };
  } catch {
    return null;
  }
}

/**
 * Reads the current session.
 *
 * The token is re-checked against the store so a deleted account cannot keep
 * using a cookie that has not expired yet.
 */
export async function getSession(): Promise<SessionPayload | null> {
  if (!env.sessionSecret) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await getStore().findUserById(payload.userId);
  if (!user) return null;
  return { userId: user.id, email: user.email, role: user.role };
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** Guard for API routes. Returns a Response when the caller may not proceed. */
export async function requireSession(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: Response }
> {
  if (!env.sessionSecret || env.sessionSecret.length < 32) {
    return {
      ok: false,
      response: Response.json(
        {
          error: 'not_configured',
          message: 'Neo is not configured yet. Set NEO_SESSION_SECRET, then redeploy.',
        },
        { status: 503 },
      ),
    };
  }
  const session = await getSession();
  if (!session) {
    return { ok: false, response: Response.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  return { ok: true, session };
}
