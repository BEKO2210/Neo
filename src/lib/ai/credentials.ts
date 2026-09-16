import type { ProviderKeyId } from '@/lib/account/types';
import { unseal } from '@/lib/crypto/secrets';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';

export type Credentials = Partial<Record<ProviderKeyId, string>>;

export interface ResolvedCredentials {
  credentials: Credentials;
  /** Providers where the deployment's key is being used, not the account's. */
  usingSharedKey: Set<ProviderKeyId>;
}

function deploymentKeys(): Credentials {
  return {
    anthropic: env.anthropicKey,
    openai: env.openaiKey,
    google: env.googleKey,
    github: env.githubToken,
  };
}

/**
 * Builds the credentials for one request.
 *
 * An account's own key always wins. The deployment's keys fill the gaps only
 * when NEO_SHARED_KEYS is on — that single flag is what separates
 * bring-your-own-key (the operator pays nothing) from a hosted service (the
 * operator pays, and the monthly quota applies).
 */
export async function resolveCredentials(userId: string): Promise<ResolvedCredentials> {
  const rows = await getStore().listKeys(userId);
  const credentials: Credentials = {};

  for (const row of rows) {
    const value = unseal(row.sealed);
    // A key sealed under a rotated NEO_SESSION_SECRET no longer decrypts; skip
    // it rather than failing the whole request — the UI shows it as unusable.
    if (value) credentials[row.provider] = value;
  }

  const usingSharedKey = new Set<ProviderKeyId>();
  if (env.sharedKeys) {
    for (const [provider, value] of Object.entries(deploymentKeys()) as Array<
      [ProviderKeyId, string | undefined]
    >) {
      if (!value || credentials[provider]) continue;
      credentials[provider] = value;
      usingSharedKey.add(provider);
    }
  }

  return { credentials, usingSharedKey };
}

const MODEL_PROVIDERS: ProviderKeyId[] = ['anthropic', 'openai', 'google'];

export function hasAnyModelKey(credentials: Credentials): boolean {
  return MODEL_PROVIDERS.some((provider) => Boolean(credentials[provider]));
}

/**
 * Whether this request would spend the operator's token allowance.
 *
 * Only model providers count: a shared GitHub token costs the operator nothing
 * in tokens, so it must never drag an account into the model quota.
 */
export function onSharedModelKey(usingSharedKey: Set<ProviderKeyId>): boolean {
  return MODEL_PROVIDERS.some((provider) => usingSharedKey.has(provider));
}
