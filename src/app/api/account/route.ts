import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { keySchema, providerKeyIds, type ProviderKeyId } from '@/lib/account/types';
import { onSharedModelKey, resolveCredentials } from '@/lib/ai/credentials';
import { requireSession } from '@/lib/auth/session';
import { hint, seal } from '@/lib/crypto/secrets';
import { generateAgentToken, tokenHint } from '@/lib/crypto/tokens';
import { env, hasSharedKey } from '@/lib/env';
import { getStore } from '@/lib/store';
import { checkQuota, currentPeriod } from '@/lib/usage/quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tokenSchema = z.object({ label: z.string().trim().min(1).max(60) });

/** Account overview: stored keys (masked), agent tokens, and this month's usage. */
export async function GET(): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const store = getStore();
  const { credentials, usingSharedKey } = await resolveCredentials(guard.session.userId);
  const rows = await store.listKeys(guard.session.userId);
  const quota = await checkQuota(guard.session.userId, onSharedModelKey(usingSharedKey));

  return Response.json({
    email: guard.session.email,
    role: guard.session.role,
    store: store.kind,
    period: currentPeriod(),
    keys: providerKeyIds.map((provider) => {
      const row = rows.find((entry) => entry.provider === provider);
      return {
        provider,
        stored: Boolean(row),
        hint: row?.hint ?? null,
        updatedAt: row?.updatedAt ?? null,
        /** True when this provider currently runs on the deployment's key. */
        shared: usingSharedKey.has(provider),
        available: Boolean(credentials[provider]),
      };
    }),
    sharedKeysOffered: env.sharedKeys && hasSharedKey(),
    quota: {
      enforced: quota.enforced,
      limit: quota.limit,
      used: quota.used,
      remaining: Number.isFinite(quota.remaining) ? quota.remaining : null,
    },
    usage: quota.totals,
    agentTokens: await store.listAgentTokens(guard.session.userId),
  });
}

/** Store or clear one provider key; or mint a new agent token. */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const store = getStore();

  if (body?.action === 'agent-token') {
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'bad_request', message: 'A label is required.' }, { status: 400 });
    }
    const existing = await store.listAgentTokens(guard.session.userId);
    if (existing.length >= 20) {
      return Response.json(
        { error: 'too_many', message: 'Delete an agent token before creating another.' },
        { status: 409 },
      );
    }
    const { token, hash } = generateAgentToken();
    const id = randomUUID();
    await store.createAgentToken({
      id,
      userId: guard.session.userId,
      hash,
      label: parsed.data.label,
      hint: tokenHint(token),
      createdAt: new Date().toISOString(),
    });
    // The only time the plaintext is ever returned.
    return Response.json({ ok: true, id, token });
  }

  const parsed = keySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid key.' },
      { status: 400 },
    );
  }

  const value = parsed.data.value.trim();
  if (value.length === 0) {
    await store.deleteKey(guard.session.userId, parsed.data.provider);
    return Response.json({ ok: true, cleared: true });
  }
  if (value.length < 8) {
    return Response.json({ error: 'bad_request', message: 'That key looks too short.' }, { status: 400 });
  }

  await store.putKey(guard.session.userId, {
    provider: parsed.data.provider,
    sealed: seal(value),
    hint: hint(value),
    updatedAt: new Date().toISOString(),
  });
  return Response.json({ ok: true, hint: hint(value) });
}

export async function DELETE(request: Request): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const tokenId = url.searchParams.get('agentToken');
  if (tokenId) {
    const removed = await getStore().deleteAgentToken(guard.session.userId, tokenId);
    return Response.json({ ok: removed });
  }

  const provider = url.searchParams.get('provider');
  if (!provider || !(providerKeyIds as readonly string[]).includes(provider)) {
    return Response.json({ error: 'bad_request', message: 'Unknown provider.' }, { status: 400 });
  }
  await getStore().deleteKey(guard.session.userId, provider as ProviderKeyId);
  return Response.json({ ok: true });
}
