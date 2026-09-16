import type { UsageTotals } from '@/lib/account/types';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';
import { costUsd, type UsageRecord } from './pricing';
import type { ProviderId } from '@/lib/ai/types';

/** Calendar month key, e.g. "2026-09". */
export function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export interface QuotaState {
  /** False when the account pays for its own tokens; then nothing is capped. */
  enforced: boolean;
  limit: number;
  used: number;
  remaining: number;
  exceeded: boolean;
  totals: UsageTotals;
}

/**
 * Quota only bites when the account is spending the operator's money. An
 * account using its own API key is metered for transparency but never blocked.
 */
export async function checkQuota(userId: string, onSharedKey: boolean): Promise<QuotaState> {
  const period = currentPeriod();
  const totals = await getStore().usageTotals(userId, period);
  const limit = env.monthlyTokenLimit;
  const used = totals.totalTokens;

  if (!onSharedKey || limit === 0) {
    return { enforced: false, limit, used, remaining: Number.POSITIVE_INFINITY, exceeded: false, totals };
  }
  return {
    enforced: true,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    exceeded: used >= limit,
    totals,
  };
}

export function quotaMessage(state: QuotaState): string {
  return `Monthly allowance used: ${state.used.toLocaleString()} of ${state.limit.toLocaleString()} tokens. Add your own API key in the Account panel to continue without a cap.`;
}

/** Records one call's usage. Never throws: metering must not break a response. */
export async function recordUsage(entry: {
  userId: string;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  kind: UsageRecord['kind'];
}): Promise<void> {
  if (entry.inputTokens === 0 && entry.outputTokens === 0) return;
  try {
    await getStore().recordUsage({
      userId: entry.userId,
      at: new Date().toISOString(),
      provider: entry.provider,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: costUsd(entry.model, entry.inputTokens, entry.outputTokens),
      kind: entry.kind,
    });
  } catch (error) {
    console.warn('Neo: failed to record usage —', error instanceof Error ? error.message : error);
  }
}
