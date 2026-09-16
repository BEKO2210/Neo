'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FeatureStatus } from '@/lib/env';

export interface AgentSummary {
  id: string;
  name: string;
  role: string;
  color: string;
  tools: string[];
}

export interface NeoConfig {
  email: string;
  role: string;
  store: string;
  demoMode: boolean;
  sharedKeysOffered: boolean;
  /** Deployment configuration, only populated for the owner account. */
  features: FeatureStatus[];
  providers: Array<{
    id: string;
    label: string;
    supportsTools: boolean;
    defaultModel: string;
    shared: boolean;
  }>;
  agents: AgentSummary[];
  pipeline: string[];
}

export function useConfig(): { config: NeoConfig | null; error: string | null; reload(): void } {
  const [config, setConfig] = useState<NeoConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/config', { signal: controller.signal });
        if (response.status === 401) {
          router.replace('/login');
          return;
        }
        if (!response.ok) throw new Error(`Config request failed (${response.status}).`);
        setConfig((await response.json()) as NeoConfig);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Config unavailable.');
      }
    })();
    return () => controller.abort();
  }, [router, nonce]);

  return { config, error, reload: () => setNonce((value) => value + 1) };
}
