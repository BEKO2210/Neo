import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { resolveModel } from '@/lib/ai/registry';
import { runConversation, type RunEvent } from '@/lib/ai/runner';
import { getAgent } from '@/lib/agents/roster';
import type { ChatMessage } from '@/lib/ai/types';
import { sseResponse } from '@/lib/sse-response';
import { getStore } from '@/lib/store';
import { shortId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Accepted by every Vercel plan. Raise it (up to 800 on Pro) if you have
// the headroom: A tool-heavy answer can outlive 60 seconds.
export const maxDuration = 60;

const bodySchema = z.object({
  model: z.string().max(200).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(32_000),
      }),
    )
    .min(1)
    .max(60),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'bad_request', detail: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }

  const resolved = resolveModel(parsed.data.model);
  if (!resolved) {
    return Response.json(
      {
        error: 'no_provider',
        message:
          'No model provider is configured. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.',
      },
      { status: 503 },
    );
  }

  const operator = getAgent('operator');
  const messages: ChatMessage[] = parsed.data.messages.map((message) => ({
    role: message.role,
    parts: [{ type: 'text', text: message.content }],
  }));

  await getStore().appendEvent({
    id: shortId('evt'),
    at: new Date().toISOString(),
    level: 'info',
    source: 'chat',
    message: `Chat turn on ${resolved.provider.id}:${resolved.model}`,
  });

  async function* events(): AsyncGenerator<RunEvent | { type: 'meta'; model: string }> {
    yield { type: 'meta', model: `${resolved!.provider.id}:${resolved!.model}` };
    yield* runConversation({
      provider: resolved!.provider,
      model: resolved!.model,
      system: operator.system,
      messages,
      toolNames: operator.tools,
      maxTokens: operator.maxTokens,
      temperature: operator.temperature,
      signal: request.signal,
    });
  }

  return sseResponse(events());
}
