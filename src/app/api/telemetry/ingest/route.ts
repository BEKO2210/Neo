import { requireSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';
import { telemetryPayloadSchema } from '@/lib/telemetry/types';
import { safeEqual, shortId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const expected = env.agentToken;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const custom = request.headers.get('x-neo-agent-token') ?? '';
  return safeEqual(bearer, expected) || safeEqual(custom, expected);
}

/** Ingest endpoint for agent/neo_agent.py. Authenticated by the shared agent token. */
export async function POST(request: Request): Promise<Response> {
  if (!env.agentToken) {
    return Response.json(
      {
        error: 'not_configured',
        message: 'Set NEO_AGENT_TOKEN before machines can report telemetry.',
      },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = telemetryPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: 'bad_payload',
        detail: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      },
      { status: 400 },
    );
  }

  const store = getStore();
  const previous = await store.getNode(parsed.data.id);
  const node = await store.upsertNode(parsed.data, new Date().toISOString());

  // Only log health transitions; a 10s heartbeat would otherwise drown the log.
  if (previous?.health !== node.health) {
    await store.appendEvent({
      id: shortId('evt'),
      at: node.lastSeen,
      level: node.health === 'critical' ? 'error' : node.health === 'warning' ? 'warn' : 'info',
      source: `node:${node.id}`,
      message: `${node.name} is ${node.health}${previous ? ` (was ${previous.health})` : ' (first report)'}`,
    });
  }

  return Response.json({ ok: true, id: node.id, health: node.health });
}

/** Lets an operator confirm from the browser that ingest is wired up. */
export async function GET(): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  return Response.json({
    configured: Boolean(env.agentToken),
    endpoint: '/api/telemetry/ingest',
    method: 'POST',
    auth: 'Authorization: Bearer <NEO_AGENT_TOKEN>',
  });
}
