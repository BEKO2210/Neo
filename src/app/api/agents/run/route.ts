import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { runMission, type MissionEvent } from '@/lib/agents/orchestrator';
import { pipelineOrder } from '@/lib/agents/roster';
import { sseResponse } from '@/lib/sse-response';
import { getStore } from '@/lib/store';
import { shortId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Accepted by every Vercel plan. Raise it (up to 800 on Pro) if you have
// the headroom: A four-agent mission can outlive 60 seconds.
export const maxDuration = 60;

const bodySchema = z.object({
  mission: z.string().min(3).max(4000),
  model: z.string().max(200).optional(),
  agents: z.array(z.enum(['planner', 'researcher', 'engineer', 'reviewer'])).min(1).max(4).optional(),
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

  await getStore().appendEvent({
    id: shortId('evt'),
    at: new Date().toISOString(),
    level: 'info',
    source: 'agents',
    message: `Mission started: ${parsed.data.mission.slice(0, 120)}`,
  });

  const source: AsyncGenerator<MissionEvent> = runMission({
    mission: parsed.data.mission,
    modelReference: parsed.data.model,
    agents: parsed.data.agents ?? pipelineOrder,
    signal: request.signal,
  });

  return sseResponse(source);
}
