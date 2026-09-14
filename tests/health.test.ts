import { describe, expect, it } from 'vitest';
import { deriveHealth, summarizeFleet, usagePercent } from '@/lib/telemetry/health';
import type { NeoNode, TelemetryPayload } from '@/lib/telemetry/types';

const NOW = Date.parse('2026-01-01T12:00:00.000Z');
const FRESH = new Date(NOW - 5_000).toISOString();

function payload(overrides: Partial<TelemetryPayload['metrics']> = {}, services: TelemetryPayload['services'] = []): TelemetryPayload {
  return {
    id: 'node-1',
    name: 'node-1',
    kind: 'server',
    tags: [],
    services,
    metrics: {
      cpuPercent: 10,
      memoryUsedBytes: 1_000,
      memoryTotalBytes: 10_000,
      diskUsedBytes: 1_000,
      diskTotalBytes: 10_000,
      loadAverage: null,
      temperatureC: null,
      uptimeSeconds: null,
      processCount: null,
      ...overrides,
    },
  };
}

describe('usagePercent', () => {
  it('rounds to one decimal', () => {
    expect(usagePercent(1, 3)).toBe(33.3);
  });

  it('returns null when either side is unknown or the total is zero', () => {
    expect(usagePercent(null, 100)).toBeNull();
    expect(usagePercent(10, null)).toBeNull();
    expect(usagePercent(10, 0)).toBeNull();
  });
});

describe('deriveHealth', () => {
  it('reports healthy for a quiet node', () => {
    expect(deriveHealth(payload(), FRESH, NOW)).toBe('healthy');
  });

  it('treats a node that stopped reporting as stale regardless of its last metrics', () => {
    const old = new Date(NOW - 120_000).toISOString();
    expect(deriveHealth(payload({ cpuPercent: 1 }), old, NOW)).toBe('stale');
  });

  it('warns above the CPU warning threshold', () => {
    expect(deriveHealth(payload({ cpuPercent: 85 }), FRESH, NOW)).toBe('warning');
  });

  it('escalates to critical on memory pressure', () => {
    expect(deriveHealth(payload({ memoryUsedBytes: 9_600, memoryTotalBytes: 10_000 }), FRESH, NOW)).toBe(
      'critical',
    );
  });

  it('treats a down service as critical even when metrics look fine', () => {
    expect(deriveHealth(payload({}, [{ name: 'db', state: 'down' }]), FRESH, NOW)).toBe('critical');
  });

  it('treats a degraded service as a warning', () => {
    expect(deriveHealth(payload({}, [{ name: 'cache', state: 'degraded' }]), FRESH, NOW)).toBe('warning');
  });

  it('ignores metrics it does not have', () => {
    const blind = payload({ cpuPercent: null, memoryUsedBytes: null, memoryTotalBytes: null });
    expect(deriveHealth(blind, FRESH, NOW)).toBe('healthy');
  });

  it('marks an unparsable timestamp as stale rather than healthy', () => {
    expect(deriveHealth(payload(), 'not-a-date', NOW)).toBe('stale');
  });
});

describe('summarizeFleet', () => {
  it('counts each health bucket', () => {
    const nodes = [
      { health: 'healthy' },
      { health: 'healthy' },
      { health: 'critical' },
      { health: 'stale' },
    ] as NeoNode[];
    expect(summarizeFleet(nodes)).toEqual({
      total: 4,
      healthy: 2,
      warning: 0,
      critical: 1,
      stale: 1,
    });
  });
});
