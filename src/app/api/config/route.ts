import { agentRoster, pipelineOrder } from '@/lib/agents/roster';
import { resolveCredentials } from '@/lib/ai/credentials';
import { availableProviders } from '@/lib/ai/registry';
import { requireSession } from '@/lib/auth/session';
import { env, featureMatrix, hasSharedKey } from '@/lib/env';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { credentials, usingSharedKey } = await resolveCredentials(guard.session.userId);

  return Response.json({
    email: guard.session.email,
    role: guard.session.role,
    store: getStore().kind,
    demoMode: env.demoMode,
    sharedKeysOffered: env.sharedKeys && hasSharedKey(),
    // The full matrix is deployment configuration, so only the owner sees it.
    features: guard.session.role === 'owner' ? featureMatrix() : [],
    providers: availableProviders(credentials).map((provider) => ({
      id: provider.id,
      label: provider.label,
      supportsTools: provider.supportsTools,
      defaultModel: provider.defaultModel,
      shared: usingSharedKey.has(provider.id),
    })),
    agents: agentRoster.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      color: agent.color,
      tools: agent.tools,
    })),
    pipeline: pipelineOrder,
  });
}
