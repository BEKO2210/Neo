import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { OpenAiProvider } from './openai';
import type { ModelInfo, Provider, ProviderId } from './types';

const providers: Record<ProviderId, Provider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAiProvider(),
  google: new GoogleProvider(),
};

export const providerOrder: ProviderId[] = ['anthropic', 'openai', 'google'];

export function getProvider(id: ProviderId): Provider {
  return providers[id];
}

export function allProviders(): Provider[] {
  return providerOrder.map((id) => providers[id]);
}

export function configuredProviders(): Provider[] {
  return allProviders().filter((provider) => provider.isConfigured());
}

/** The provider Neo falls back to when the caller did not pick one. */
export function defaultProvider(): Provider | null {
  return configuredProviders()[0] ?? null;
}

export interface ResolvedModel {
  provider: Provider;
  model: string;
}

/**
 * Accepts `"anthropic:claude-sonnet-5"`, a bare provider id, a bare model id,
 * or nothing at all, and always resolves to a configured provider — or null
 * when the deployment has no model keys yet.
 */
export function resolveModel(reference?: string | null): ResolvedModel | null {
  const configured = configuredProviders();
  if (configured.length === 0) return null;

  if (!reference) {
    const provider = configured[0]!;
    return { provider, model: provider.defaultModel };
  }

  const [head, ...rest] = reference.split(':');
  if (head && isProviderId(head)) {
    const provider = providers[head];
    if (!provider.isConfigured()) return null;
    const model = rest.join(':').trim();
    return { provider, model: model.length > 0 ? model : provider.defaultModel };
  }

  // Bare model id: infer the provider from the id prefix, else use the default.
  const inferred = inferProvider(reference);
  const provider = inferred && providers[inferred].isConfigured() ? providers[inferred] : configured[0]!;
  return { provider, model: reference };
}

export function isProviderId(value: string): value is ProviderId {
  return value === 'anthropic' || value === 'openai' || value === 'google';
}

export function inferProvider(modelId: string): ProviderId | null {
  if (/^claude/i.test(modelId)) return 'anthropic';
  if (/^(gpt|o[1-9]|chatgpt)/i.test(modelId)) return 'openai';
  if (/^gemini/i.test(modelId)) return 'google';
  return null;
}

export function modelReference(provider: ProviderId, model: string): string {
  return `${provider}:${model}`;
}

/** Live model catalogue across every configured provider. Never throws. */
export async function catalogue(signal?: AbortSignal): Promise<ModelInfo[]> {
  const results = await Promise.all(
    configuredProviders().map(async (provider) => {
      try {
        return await provider.listModels(signal);
      } catch {
        return provider.knownModels();
      }
    }),
  );
  return results.flat();
}
