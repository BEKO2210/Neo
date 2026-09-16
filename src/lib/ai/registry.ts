import { AnthropicProvider } from './anthropic';
import type { Credentials } from './credentials';
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

/** Providers the caller actually holds a key for. */
export function availableProviders(credentials: Credentials): Provider[] {
  return allProviders().filter((provider) => Boolean(credentials[provider.id]));
}

export interface ResolvedModel {
  provider: Provider;
  model: string;
  apiKey: string;
}

/**
 * Accepts `"anthropic:claude-sonnet-5"`, a bare provider id, a bare model id,
 * or nothing at all, and resolves it against the credentials of this request —
 * returning null when the caller has no usable key.
 */
export function resolveModel(
  reference: string | null | undefined,
  credentials: Credentials,
): ResolvedModel | null {
  const available = availableProviders(credentials);
  if (available.length === 0) return null;

  const pick = (provider: Provider, model?: string): ResolvedModel | null => {
    const apiKey = credentials[provider.id];
    if (!apiKey) return null;
    return { provider, apiKey, model: model && model.length > 0 ? model : provider.defaultModel };
  };

  if (!reference) return pick(available[0]!);

  const [head, ...rest] = reference.split(':');
  if (head && isProviderId(head)) {
    return pick(providers[head], rest.join(':').trim());
  }

  const inferred = inferProvider(reference);
  const provider = inferred && credentials[inferred] ? providers[inferred] : available[0]!;
  return pick(provider, reference);
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

/** Live model catalogue across every provider the caller has a key for. Never throws. */
export async function catalogue(
  credentials: Credentials,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  const results = await Promise.all(
    availableProviders(credentials).map(async (provider) => {
      const key = credentials[provider.id];
      if (!key) return [];
      try {
        return await provider.listModels(key, signal);
      } catch {
        return provider.knownModels();
      }
    }),
  );
  return results.flat();
}
