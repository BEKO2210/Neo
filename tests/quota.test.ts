import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '@/lib/store/memory';
import type { NeoStore } from '@/lib/store/types';
import { checkQuota, quotaMessage, currentPeriod, recordUsage } from '@/lib/usage/quota';

declare global {
  var __neoStore: NeoStore | undefined;
}

const savedLimit = process.env.NEO_MONTHLY_TOKEN_LIMIT;

beforeEach(() => {
  globalThis.__neoStore = new MemoryStore();
});

afterEach(() => {
  globalThis.__neoStore = undefined;
  if (savedLimit === undefined) delete process.env.NEO_MONTHLY_TOKEN_LIMIT;
  else process.env.NEO_MONTHLY_TOKEN_LIMIT = savedLimit;
});

async function spend(userId: string, inputTokens: number, outputTokens: number) {
  await recordUsage({
    userId,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    inputTokens,
    outputTokens,
    kind: 'chat',
  });
}

describe('checkQuota', () => {
  it('never caps an account that is paying with its own key', async () => {
    process.env.NEO_MONTHLY_TOKEN_LIMIT = '100';
    await spend('alice', 10_000, 5_000);

    const state = await checkQuota('alice', false);
    expect(state.enforced).toBe(false);
    expect(state.exceeded).toBe(false);
    expect(state.used).toBe(15_000);
  });

  it('caps an account spending the operator allowance', async () => {
    process.env.NEO_MONTHLY_TOKEN_LIMIT = '10000';
    await spend('alice', 4_000, 1_000);

    const under = await checkQuota('alice', true);
    expect(under.enforced).toBe(true);
    expect(under.exceeded).toBe(false);
    expect(under.remaining).toBe(5_000);

    await spend('alice', 5_000, 500);
    const over = await checkQuota('alice', true);
    expect(over.exceeded).toBe(true);
    expect(over.remaining).toBe(0);
  });

  it('counts each account separately', async () => {
    process.env.NEO_MONTHLY_TOKEN_LIMIT = '1000';
    await spend('alice', 2_000, 0);

    expect((await checkQuota('alice', true)).exceeded).toBe(true);
    expect((await checkQuota('bob', true)).exceeded).toBe(false);
  });

  it('treats a limit of 0 as no cap, as documented', async () => {
    process.env.NEO_MONTHLY_TOKEN_LIMIT = '0';
    await spend('alice', 999_999, 0);
    expect((await checkQuota('alice', true)).enforced).toBe(false);
  });

  it('ignores spend from an earlier month', async () => {
    process.env.NEO_MONTHLY_TOKEN_LIMIT = '1000';
    const store = globalThis.__neoStore!;
    await store.recordUsage({
      userId: 'alice',
      at: '2020-01-05T00:00:00.000Z',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      inputTokens: 900_000,
      outputTokens: 0,
      costUsd: null,
      kind: 'chat',
    });
    const state = await checkQuota('alice', true);
    expect(state.used).toBe(0);
    expect(state.exceeded).toBe(false);
    expect(state.totals.period).toBe(currentPeriod());
  });

  it('records nothing for a call that produced no tokens', async () => {
    await spend('alice', 0, 0);
    expect((await checkQuota('alice', true)).used).toBe(0);
  });

  it('tells the account how to lift the cap', async () => {
    process.env.NEO_MONTHLY_TOKEN_LIMIT = '1000';
    await spend('alice', 1_200, 0);
    expect(quotaMessage(await checkQuota('alice', true))).toContain('own API key');
  });
});

describe('onSharedModelKey', () => {
  it('ignores a shared GitHub token, which costs the operator no model tokens', async () => {
    const { onSharedModelKey } = await import('@/lib/ai/credentials');
    expect(onSharedModelKey(new Set(['github']))).toBe(false);
    expect(onSharedModelKey(new Set())).toBe(false);
  });

  it('counts any shared model provider', async () => {
    const { onSharedModelKey } = await import('@/lib/ai/credentials');
    expect(onSharedModelKey(new Set(['anthropic']))).toBe(true);
    expect(onSharedModelKey(new Set(['github', 'openai']))).toBe(true);
    expect(onSharedModelKey(new Set(['google']))).toBe(true);
  });
});
