import { resolveCredentials } from '@/lib/ai/credentials';
import { availableProviders, catalogue } from '@/lib/ai/registry';
import { requireSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live model list, queried with this account's own credentials.
 *
 * Providers ship new model ids constantly; asking the account which models it
 * can use beats shipping a list that silently goes stale.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { credentials } = await resolveCredentials(guard.session.userId);
  if (availableProviders(credentials).length === 0) {
    return Response.json({ models: [], message: 'No model key is available for this account.' });
  }

  try {
    return Response.json({ models: await catalogue(credentials, request.signal) });
  } catch (error) {
    return Response.json(
      { models: [], message: error instanceof Error ? error.message : 'Model listing failed.' },
      { status: 502 },
    );
  }
}
