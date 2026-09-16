import { z } from 'zod';
import { getAgent } from '@/lib/agents/roster';
import { resolveCredentials } from '@/lib/ai/credentials';
import { resolveModel } from '@/lib/ai/registry';
import { runConversation, type RunEvent } from '@/lib/ai/runner';
import type { ChatMessage } from '@/lib/ai/types';
import { requireSession } from '@/lib/auth/session';
import { sseResponse } from '@/lib/sse-response';
import { getStore } from '@/lib/store';
import { checkQuota, quotaMessage, recordUsage } from '@/lib/usage/quota';
import { shortId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  model: z.string().max(200).optional(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(32_000) }))
    .min(1)
    .max(60),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  const { userId } = guard.session;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'bad_request', detail: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }

  const { credentials, usingSharedKey } = await resolveCredentials(userId);
  const resolved = resolveModel(parsed.data.model, credentials);
  if (!resolved) {
    return Response.json(
      {
        error: 'no_key',
        message:
          'No model key is available for this account. Add one in the Account panel to start chatting.',
      },
      { status: 503 },
    );
  }

  // The quota only applies while the account is spending the operator's money.
  const onSharedKey = usingSharedKey.has(resolved.provider.id);
  const quota = await checkQuota(userId, onSharedKey);
  if (quota.exceeded) {
    return Response.json({ error: 'quota_exceeded', message: quotaMessage(quota) }, { status: 429 });
  }

  const operator = getAgent('operator');
  const messages: ChatMessage[] = parsed.data.messages.map((message) => ({
    role: message.role,
    parts: [{ type: 'text', text: message.content }],
  }));

  async function* events(): AsyncGenerator<RunEvent | { type: 'meta'; model: string; shared: boolean }> {
    yield { type: 'meta', model: `${resolved!.provider.id}:${resolved!.model}`, shared: onSharedKey };

    for await (const event of runConversation({
      provider: resolved!.provider,
      apiKey: resolved!.apiKey,
      model: resolved!.model,
      system: operator.system,
      messages,
      toolContext: { userId, credentials, signal: request.signal },
      toolNames: operator.tools,
      maxTokens: operator.maxTokens,
      temperature: operator.temperature,
      signal: request.signal,
    })) {
      if (event.type === 'final') {
        await recordUsage({
          userId,
          provider: resolved!.provider.id,
          model: resolved!.model,
          inputTokens: event.totals.inputTokens,
          outputTokens: event.totals.outputTokens,
          kind: 'chat',
        });
      }
      yield event;
    }
  }

  await getStore()
    .appendEvent(userId, {
      id: shortId('evt'),
      at: new Date().toISOString(),
      level: 'info',
      source: 'chat',
      message: `Chat turn on ${resolved.provider.id}:${resolved.model}`,
    })
    .catch(() => undefined);

  return sseResponse(events());
}
