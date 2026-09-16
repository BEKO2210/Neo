import { z } from 'zod';
import { runMission, type MissionEvent } from '@/lib/agents/orchestrator';
import { pipelineOrder } from '@/lib/agents/roster';
import { resolveCredentials } from '@/lib/ai/credentials';
import { resolveModel } from '@/lib/ai/registry';
import { requireSession } from '@/lib/auth/session';
import { sseResponse } from '@/lib/sse-response';
import { getStore } from '@/lib/store';
import { checkQuota, quotaMessage, recordUsage } from '@/lib/usage/quota';
import { shortId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  mission: z.string().min(3).max(4000),
  model: z.string().max(200).optional(),
  agents: z.array(z.enum(['planner', 'researcher', 'engineer', 'reviewer'])).min(1).max(4).optional(),
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
        message: 'No model key is available for this account. Add one in the Account panel.',
      },
      { status: 503 },
    );
  }

  const onSharedKey = usingSharedKey.has(resolved.provider.id);
  const quota = await checkQuota(userId, onSharedKey);
  if (quota.exceeded) {
    return Response.json({ error: 'quota_exceeded', message: quotaMessage(quota) }, { status: 429 });
  }

  await getStore()
    .appendEvent(userId, {
      id: shortId('evt'),
      at: new Date().toISOString(),
      level: 'info',
      source: 'agents',
      message: `Mission started: ${parsed.data.mission.slice(0, 120)}`,
    })
    .catch(() => undefined);

  async function* events(): AsyncGenerator<MissionEvent> {
    for await (const event of runMission({
      mission: parsed.data!.mission,
      modelReference: parsed.data!.model,
      agents: parsed.data!.agents ?? pipelineOrder,
      credentials,
      toolContext: { userId, credentials, signal: request.signal },
      signal: request.signal,
    })) {
      if (event.type === 'mission_done') {
        await recordUsage({
          userId,
          provider: resolved!.provider.id,
          model: resolved!.model,
          inputTokens: event.totals.inputTokens,
          outputTokens: event.totals.outputTokens,
          kind: 'mission',
        });
      }
      yield event;
    }
  }

  return sseResponse(events());
}
