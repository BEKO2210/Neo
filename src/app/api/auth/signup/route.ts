import { randomUUID } from 'node:crypto';
import { signupSchema } from '@/lib/account/types';
import { hashPassword, passwordProblem } from '@/lib/auth/password';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';
import { safeEqual } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Account creation, gated by an invite code.
 *
 * Signup is closed unless NEO_SIGNUP_CODE is set: an open signup form on a
 * deployment with shared keys is an open invitation to spend the operator's
 * money. The first account created becomes the owner.
 */
export async function POST(request: Request): Promise<Response> {
  if (!env.sessionSecret || env.sessionSecret.length < 32) {
    return Response.json(
      { error: 'not_configured', message: 'Set NEO_SESSION_SECRET (32+ characters) first.' },
      { status: 503 },
    );
  }
  if (!env.signupCode) {
    return Response.json(
      {
        error: 'signup_closed',
        message: 'Signup is closed. The operator must set NEO_SIGNUP_CODE to allow new accounts.',
      },
      { status: 403 },
    );
  }

  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid signup details.' },
      { status: 400 },
    );
  }

  const { email, password, inviteCode } = parsed.data;

  if (!safeEqual(inviteCode, env.signupCode)) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return Response.json({ error: 'bad_invite', message: 'That invite code is not valid.' }, { status: 403 });
  }

  const problem = passwordProblem(password);
  if (problem) {
    return Response.json({ error: 'weak_password', message: problem }, { status: 400 });
  }

  const store = getStore();
  if (await store.findUserByEmail(email)) {
    return Response.json(
      { error: 'email_taken', message: 'An account with that email already exists.' },
      { status: 409 },
    );
  }

  const isFirstAccount = (await store.countUsers()) === 0;
  const user = {
    id: randomUUID(),
    email,
    role: isFirstAccount ? ('owner' as const) : ('member' as const),
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(password),
  };
  await store.createUser(user);
  await setSessionCookie(await createSessionToken(user));

  return Response.json({ ok: true, email: user.email, role: user.role });
}

export async function GET(): Promise<Response> {
  return Response.json({
    open: Boolean(env.signupCode),
    durable: getStore().kind === 'supabase',
  });
}
