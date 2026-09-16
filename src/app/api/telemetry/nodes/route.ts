import { requireSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';
import { demoNodes } from '@/lib/telemetry/demo';
import { summarizeFleet } from '@/lib/telemetry/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const store = getStore();
  const real = await store.listNodes(guard.session.userId);
  // Demo mode fills the scene so a fresh account is not an empty grid.
  const nodes = real.length === 0 && env.demoMode ? demoNodes() : real;

  return Response.json({
    nodes,
    summary: summarizeFleet(nodes),
    store: store.kind,
    demo: real.length === 0 && env.demoMode,
    events: await store.listEvents(guard.session.userId, 50),
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return Response.json({ error: 'bad_request', message: 'id is required' }, { status: 400 });
  }
  return Response.json({ ok: await getStore().deleteNode(guard.session.userId, id) });
}
