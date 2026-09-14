import { describe, expect, it } from 'vitest';
import { telemetryPayloadSchema } from '@/lib/telemetry/types';

/** Exactly what agent/neo_agent.py sends on a machine with no sensors and no systemd. */
const agentPayload = {
  id: 'core-01',
  name: 'core-01',
  kind: 'server',
  os: 'Linux 6.8.0',
  ip: null,
  tags: ['home-lab'],
  metrics: {
    cpuPercent: 12.5,
    memoryUsedBytes: 723435520,
    memoryTotalBytes: 16856092672,
    diskUsedBytes: 8836165632,
    diskTotalBytes: 270553174016,
    loadAverage: [0.1, 0.2, 0.3],
    temperatureC: null,
    uptimeSeconds: 1242,
    processCount: 73,
  },
  services: [{ name: 'docker', state: 'unknown', detail: null }],
};

describe('telemetryPayloadSchema', () => {
  it('accepts a real agent payload including its nulls', () => {
    const parsed = telemetryPayloadSchema.safeParse(agentPayload);
    expect(parsed.success).toBe(true);
  });

  it('rejects an id that could escape a URL path segment', () => {
    expect(telemetryPayloadSchema.safeParse({ ...agentPayload, id: '../../etc' }).success).toBe(false);
  });

  it('rejects an impossible CPU reading', () => {
    const broken = { ...agentPayload, metrics: { ...agentPayload.metrics, cpuPercent: 240 } };
    expect(telemetryPayloadSchema.safeParse(broken).success).toBe(false);
  });

  it('defaults tags and services when the agent omits them', () => {
    const minimal = {
      id: 'x',
      name: 'x',
      metrics: {
        cpuPercent: null,
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
    const parsed = telemetryPayloadSchema.parse(minimal);
    expect(parsed.kind).toBe('server');
    expect(parsed.tags).toEqual([]);
    expect(parsed.services).toEqual([]);
  });
});
