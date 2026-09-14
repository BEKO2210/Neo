import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';

export const SESSION_COOKIE = 'neo_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface SessionPayload {
  operator: string;
  issuedAt: number;
}

export class AuthNotConfiguredError extends Error {
  constructor() {
    super('NEO_ACCESS_PASSWORD and NEO_SESSION_SECRET must be set before Neo can accept logins.');
    this.name = 'AuthNotConfiguredError';
  }
}

function secretKey(): Uint8Array {
  const secret = env.sessionSecret;
  if (!secret || secret.length < 32) {
    throw new AuthNotConfiguredError();
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(operator: string): Promise<string> {
  return new SignJWT({ operator, issuedAt: Date.now() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
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
    const operator = typeof payload.operator === 'string' ? payload.operator : null;
    if (!operator) return null;
    const issuedAt = typeof payload.issuedAt === 'number' ? payload.issuedAt : 0;
    return { operator, issuedAt };
  } catch {
    return null;
  }
}

/** Reads the current session from cookies. Returns null when unauthenticated. */
export async function getSession(): Promise<SessionPayload | null> {
  if (!env.sessionSecret || !env.accessPassword) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
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

/** Guard for API routes. Returns a 401 Response when the caller is not signed in. */
export async function requireSession(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: Response }
> {
  if (!env.accessPassword || !env.sessionSecret) {
    return {
      ok: false,
      response: Response.json(
        {
          error: 'not_configured',
          message:
            'Neo is not configured yet. Set NEO_ACCESS_PASSWORD and NEO_SESSION_SECRET, then redeploy.',
        },
        { status: 503 },
      ),
    };
  }
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: Response.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, session };
}
