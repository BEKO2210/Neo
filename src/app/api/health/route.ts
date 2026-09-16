import { featureMatrix } from '@/lib/env';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Unauthenticated liveness probe. Reports configuration state, never secrets. */
export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ok',
    service: 'neo-command-center',
    time: new Date().toISOString(),
    store: getStore().kind,
    configured: Object.fromEntries(featureMatrix().map((f) => [f.id, f.enabled])),
  });
}
