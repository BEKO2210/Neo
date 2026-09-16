import { describe, expect, it } from 'vitest';
import { MemoryStore } from '@/lib/store/memory';
import type { NeoUserRecord } from '@/lib/account/types';
import type { TelemetryPayload } from '@/lib/telemetry/types';

function payload(id: string, cpu: number): TelemetryPayload {
  return {
    id,
    name: id,
    kind: 'server',
    tags: [],
    services: [],
    metrics: {
      cpuPercent: cpu,
      memoryUsedBytes: null,
      memoryTotalBytes: null,
      diskUsedBytes: null,
      diskTotalBytes: null,
      loadAverage: null,
      temperatureC: null,
      uptimeSeconds: null,
      processCount: null,
    },
  };
}

function user(id: string, email: string): NeoUserRecord {
  return { id, email, role: 'member', createdAt: '2026-01-01T00:00:00Z', passwordHash: 'x' };
}

describe('MemoryStore accounts', () => {
  it('finds a user by email and by id', async () => {
    const store = new MemoryStore();
    await store.createUser(user('u1', 'a@example.com'));
    expect((await store.findUserByEmail('a@example.com'))?.id).toBe('u1');
    expect((await store.findUserById('u1'))?.email).toBe('a@example.com');
    expect(await store.findUserByEmail('nobody@example.com')).toBeNull();
  });

  it('counts users so the first account can be made owner', async () => {
    const store = new MemoryStore();
    expect(await store.countUsers()).toBe(0);
    await store.createUser(user('u1', 'a@example.com'));
    expect(await store.countUsers()).toBe(1);
  });
});

describe('MemoryStore isolation', () => {
  it('keeps one account from seeing another account nodes', async () => {
    const store = new MemoryStore();
    const now = new Date().toISOString();
    await store.upsertNode('alice', payload('box', 10), now);
    await store.upsertNode('bob', payload('box', 90), now);

    expect(await store.listNodes('alice')).toHaveLength(1);
    expect((await store.getNode('alice', 'box'))?.metrics.cpuPercent).toBe(10);
    expect((await store.getNode('bob', 'box'))?.metrics.cpuPercent).toBe(90);
    expect(await store.getNode('carol', 'box')).toBeNull();
  });

  it('keeps event logs separate', async () => {
    const store = new MemoryStore();
    await store.appendEvent('alice', { id: '1', at: 'x', level: 'info', source: 's', message: 'alice only' });
    expect(await store.listEvents('bob')).toEqual([]);
    expect(await store.listEvents('alice')).toHaveLength(1);
  });

  it('does not let one account delete another node', async () => {
    const store = new MemoryStore();
    await store.upsertNode('alice', payload('box', 10), new Date().toISOString());
    expect(await store.deleteNode('bob', 'box')).toBe(false);
    expect(await store.listNodes('alice')).toHaveLength(1);
  });

  it('resolves an agent token only to its own owner', async () => {
    const store = new MemoryStore();
    await store.createAgentToken({
      id: 't1',
      userId: 'alice',
      hash: 'hash-1',
      label: 'core',
      hint: 'neo_…abcd',
      createdAt: new Date().toISOString(),
    });
    expect(await store.resolveAgentToken('hash-1')).toEqual({ userId: 'alice' });
    expect(await store.resolveAgentToken('hash-2')).toBeNull();
    expect(await store.deleteAgentToken('bob', 't1')).toBe(false);
    expect(await store.deleteAgentToken('alice', 't1')).toBe(true);
  });
});

describe('MemoryStore usage', () => {
  it('totals only the requested account and period', async () => {
    const store = new MemoryStore();
    const base = {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-5',
      kind: 'chat' as const,
    };
    await store.recordUsage({ ...base, userId: 'alice', at: '2026-09-01T10:00:00Z', inputTokens: 1000, outputTokens: 100, costUsd: 0.003 });
    await store.recordUsage({ ...base, userId: 'alice', at: '2026-09-20T10:00:00Z', inputTokens: 2000, outputTokens: 200, costUsd: 0.006 });
    await store.recordUsage({ ...base, userId: 'alice', at: '2026-08-20T10:00:00Z', inputTokens: 9000, outputTokens: 900, costUsd: 0.027 });
    await store.recordUsage({ ...base, userId: 'bob', at: '2026-09-20T10:00:00Z', inputTokens: 5000, outputTokens: 500, costUsd: 0.015 });

    const totals = await store.usageTotals('alice', '2026-09');
    expect(totals.calls).toBe(2);
    expect(totals.inputTokens).toBe(3000);
    expect(totals.outputTokens).toBe(300);
    expect(totals.totalTokens).toBe(3300);
    expect(totals.costUsd).toBeCloseTo(0.009, 6);
  });

  it('reports cost as unknown when any call used a model it cannot price', async () => {
    const store = new MemoryStore();
    await store.recordUsage({ userId: 'alice', at: '2026-09-01T10:00:00Z', provider: 'openai', model: 'mystery-model', inputTokens: 10, outputTokens: 1, costUsd: null, kind: 'chat' });
    expect((await store.usageTotals('alice', '2026-09')).costUsd).toBeNull();
  });
});
