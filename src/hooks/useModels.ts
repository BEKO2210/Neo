'use client';

import { useEffect, useState } from 'react';
import type { ModelInfo } from '@/lib/ai/types';

export interface ModelOption {
  value: string;
  label: string;
}

/**
 * Loads the live model catalogue once per session.
 *
 * `value` is always `provider:model` so the server never has to guess which
 * provider a bare model id belongs to.
 */
export function useModels(): { models: ModelOption[]; loading: boolean } {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/models', { signal: controller.signal });
        if (!response.ok) return;
        const body = (await response.json()) as { models: ModelInfo[] };
        setModels(
          body.models.map((model) => ({
            value: `${model.provider}:${model.id}`,
            label: `${model.provider === 'anthropic' ? 'CL' : model.provider === 'openai' ? 'AI' : 'GG'} · ${model.label}`,
          })),
        );
      } catch {
        // Selector simply stays empty; the server still falls back to its default model.
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { models, loading };
}
