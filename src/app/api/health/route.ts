import { featureMatrix } from '@/lib/env';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Unauthenticated liveness probe. Reports configuration state, never secrets. */
export async function GET(): Promise<Response> {
  const features = featureMatrix();
  return Response.json({
    status: 'ok',
    service: 'neo-command-center',
    time: new Date().toISOString(),
    store: getStore().kind,
    configured: Object.fromEntries(features.map((feature) => [feature.id, feature.enabled])),
  });
}
