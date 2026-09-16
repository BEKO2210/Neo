import { hashAgentToken } from '@/lib/crypto/tokens';
import { getStore } from '@/lib/store';
import { telemetryPayloadSchema } from '@/lib/telemetry/types';
import { shortId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function presentedToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim() || null;
  const custom = request.headers.get('x-neo-agent-token');
  return custom?.trim() || null;
}

/**
 * Ingest endpoint for agent/neo_agent.py.
 *
 * The token identifies the account the machine belongs to, so telemetry lands
 * in exactly one fleet and never in anyone else's. Only the token's hash is
 * stored, so a database dump cannot be replayed against this endpoint.
 */
export async function POST(request: Request): Promise<Response> {
  const token = presentedToken(request);
  if (!token) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const owner = await getStore().resolveAgentToken(hashAgentToken(token));
  if (!owner) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return Response.json(
      { error: 'unauthorized', message: 'This agent token is not recognised.' },
      { status: 401 },
    );
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
  const previous = await store.getNode(owner.userId, parsed.data.id);
  const node = await store.upsertNode(owner.userId, parsed.data, new Date().toISOString());

  // Only log health transitions; a 10s heartbeat would otherwise drown the log.
  if (previous?.health !== node.health) {
    await store.appendEvent(owner.userId, {
      id: shortId('evt'),
      at: node.lastSeen,
      level: node.health === 'critical' ? 'error' : node.health === 'warning' ? 'warn' : 'info',
      source: `node:${node.id}`,
      message: `${node.name} is ${node.health}${previous ? ` (was ${previous.health})` : ' (first report)'}`,
    });
  }

  return Response.json({ ok: true, id: node.id, health: node.health });
}
