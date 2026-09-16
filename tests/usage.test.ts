import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { costUsd, priceFor } from '@/lib/usage/pricing';
import { currentPeriod } from '@/lib/usage/quota';

const saved = process.env.NEO_MONTHLY_TOKEN_LIMIT;

beforeEach(() => {
  delete process.env.NEO_MONTHLY_TOKEN_LIMIT;
});

afterEach(() => {
  if (saved === undefined) delete process.env.NEO_MONTHLY_TOKEN_LIMIT;
  else process.env.NEO_MONTHLY_TOKEN_LIMIT = saved;
});

describe('pricing', () => {
  it('knows the published Claude prices', () => {
    expect(priceFor('claude-opus-5')).toEqual({ input: 5, output: 25 });
    expect(priceFor('claude-sonnet-5')).toEqual({ input: 2, output: 10 });
    expect(priceFor('claude-haiku-4-5')).toEqual({ input: 1, output: 5 });
  });

  it('matches a dated model snapshot to its base model', () => {
    expect(priceFor('claude-haiku-4-5-20251001')).toEqual({ input: 1, output: 5 });
  });

  it('returns null rather than guessing at an unknown model', () => {
    expect(priceFor('some-future-model')).toBeNull();
    expect(costUsd('some-future-model', 1000, 1000)).toBeNull();
  });

  it('computes a call cost from the per-million rates', () => {
    // 100k input + 10k output on Sonnet 5 = 0.2 + 0.1 USD
    expect(costUsd('claude-sonnet-5', 100_000, 10_000)).toBeCloseTo(0.3, 6);
  });

  it('costs nothing for an empty call', () => {
    expect(costUsd('claude-sonnet-5', 0, 0)).toBe(0);
  });
});

describe('currentPeriod', () => {
  it('formats the calendar month', () => {
    expect(currentPeriod(new Date('2026-09-16T14:00:00Z'))).toBe('2026-09');
    expect(currentPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });
});
