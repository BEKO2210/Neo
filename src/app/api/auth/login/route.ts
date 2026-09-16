import { loginSchema } from '@/lib/account/types';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!env.sessionSecret || env.sessionSecret.length < 32) {
    return Response.json(
      { error: 'not_configured', message: 'Set NEO_SESSION_SECRET (32+ characters) first.' },
      { status: 503 },
    );
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const user = await getStore().findUserByEmail(parsed.data.email);
  // Same response and roughly the same cost whether the account exists or not,
  // so this endpoint cannot be used to enumerate registered addresses.
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return Response.json(
      { error: 'invalid_credentials', message: 'Email or password is wrong.' },
      { status: 401 },
    );
  }

  await setSessionCookie(await createSessionToken(user));
  return Response.json({ ok: true, email: user.email, role: user.role });
}
