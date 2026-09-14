import { requireSession } from '@/lib/auth/session';
import { catalogue, configuredProviders } from '@/lib/ai/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live model list, queried from each configured provider.
 *
 * Providers ship new model ids constantly; asking the account beats shipping a
 * hard-coded list that silently goes stale. Each provider falls back to its own
 * curated list if the listing endpoint is unavailable.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  if (configuredProviders().length === 0) {
    return Response.json({ models: [], message: 'No model provider is configured.' });
  }

  try {
    const models = await catalogue(request.signal);
    return Response.json({ models });
  } catch (error) {
    return Response.json(
      { models: [], message: error instanceof Error ? error.message : 'Model listing failed.' },
      { status: 502 },
    );
  }
}
