import type { ProviderId } from '@/lib/ai/types';

/**
 * Per-million-token prices in USD.
 *
 * Only models Neo can price confidently are listed. An unknown model is not
 * guessed at: its tokens still count against the quota, but its cost is
 * reported as null rather than as a made-up number.
 */
interface Price {
  input: number;
  output: number;
}

const PRICES: Record<string, Price> = {
  // Anthropic — https://www.anthropic.com/pricing
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

function normalise(model: string): string {
  // Strip a trailing date snapshot, e.g. claude-haiku-4-5-20251001.
  return model.replace(/-\d{8}$/, '');
}

export function priceFor(model: string): Price | null {
  return PRICES[normalise(model)] ?? null;
}

/** USD cost of one call, or null when the model's price is unknown to Neo. */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const cost = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export interface UsageRecord {
  userId: string;
  at: string;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  kind: 'chat' | 'mission';
}
