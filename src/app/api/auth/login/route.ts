import { z } from 'zod';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: Request): Promise<Response> {
  if (!env.accessPassword || !env.sessionSecret) {
    return Response.json(
      {
        error: 'not_configured',
        message:
          'Set NEO_ACCESS_PASSWORD and a NEO_SESSION_SECRET of at least 32 characters, then restart Neo.',
      },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  if (!safeEqual(parsed.data.password, env.accessPassword)) {
    // Blunt the brute-force edge without keeping per-IP state.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return Response.json({ error: 'invalid_password' }, { status: 401 });
  }

  await setSessionCookie(await createSessionToken(env.operatorName));
  return Response.json({ ok: true, operator: env.operatorName });
}
