import { requireSession } from '@/lib/auth/session';
import { configuredProviders } from '@/lib/ai/registry';
import { agentRoster, pipelineOrder } from '@/lib/agents/roster';
import { env, featureMatrix } from '@/lib/env';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  return Response.json({
    operator: guard.session.operator,
    store: getStore().kind,
    demoMode: env.demoMode,
    features: featureMatrix(),
    providers: configuredProviders().map((provider) => ({
      id: provider.id,
      label: provider.label,
      supportsTools: provider.supportsTools,
      defaultModel: provider.defaultModel,
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
