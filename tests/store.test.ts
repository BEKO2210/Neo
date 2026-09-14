import { describe, expect, it } from 'vitest';
import { MemoryStore } from '@/lib/store/memory';
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

describe('MemoryStore', () => {
  it('upserts rather than duplicating a node that reports again', async () => {
    const store = new MemoryStore();
    const now = new Date().toISOString();
    await store.upsertNode(payload('a', 10), now);
    await store.upsertNode(payload('a', 99), now);
    const nodes = await store.listNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.metrics.cpuPercent).toBe(99);
  });

  it('derives health on read so a node goes stale without reporting again', async () => {
    const store = new MemoryStore();
    await store.upsertNode(payload('a', 10), new Date(Date.now() - 300_000).toISOString());
    expect((await store.getNode('a'))?.health).toBe('stale');
  });

  it('returns events newest first', async () => {
    const store = new MemoryStore();
    await store.appendEvent({ id: '1', at: '2026-01-01T00:00:00Z', level: 'info', source: 's', message: 'first' });
    await store.appendEvent({ id: '2', at: '2026-01-01T00:01:00Z', level: 'info', source: 's', message: 'second' });
    const events = await store.listEvents();
    expect(events.map((event) => event.message)).toEqual(['second', 'first']);
  });

  it('deletes a node', async () => {
    const store = new MemoryStore();
    await store.upsertNode(payload('a', 10), new Date().toISOString());
    expect(await store.deleteNode('a')).toBe(true);
    expect(await store.listNodes()).toHaveLength(0);
  });
});
