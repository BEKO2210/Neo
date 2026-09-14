import { deriveHealth } from './health';
import type { NeoNode, TelemetryPayload } from './types';

const GB = 1024 ** 3;

/**
 * Synthetic fleet used when NEO_DEMO_MODE=true and no real agent has reported.
 * Values drift deterministically with the clock so the scene feels alive
 * without pretending to be measured data — the UI labels it as demo.
 */
export function demoNodes(now: number = Date.now()): NeoNode[] {
  const phase = (offset: number) => (Math.sin(now / 20_000 + offset) + 1) / 2;
  const lastSeen = new Date(now - 4_000).toISOString();

  const payloads: TelemetryPayload[] = [
    {
      id: 'demo-core',
      name: 'core-01',
      kind: 'server',
      os: 'Debian 12',
      ip: '10.0.0.10',
      tags: ['demo', 'home-lab'],
      metrics: {
        cpuPercent: Math.round(18 + phase(0) * 30),
        memoryUsedBytes: Math.round((9 + phase(1) * 4) * GB),
        memoryTotalBytes: 32 * GB,
        diskUsedBytes: 612 * GB,
        diskTotalBytes: 1024 * GB,
        loadAverage: [0.6, 0.8, 0.7],
        temperatureC: Math.round(44 + phase(2) * 8),
        uptimeSeconds: 1_820_400,
        processCount: 214,
      },
      services: [
        { name: 'docker', state: 'up' },
        { name: 'postgres', state: 'up' },
        { name: 'caddy', state: 'up' },
      ],
    },
    {
      id: 'demo-edge',
      name: 'edge-gateway',
      kind: 'service',
      os: 'Alpine 3.20',
      ip: '10.0.0.20',
      tags: ['demo', 'edge'],
      metrics: {
        cpuPercent: Math.round(55 + phase(3) * 40),
        memoryUsedBytes: Math.round((3.2 + phase(4) * 0.6) * GB),
        memoryTotalBytes: 4 * GB,
        diskUsedBytes: 18 * GB,
        diskTotalBytes: 40 * GB,
        loadAverage: [1.9, 1.4, 1.1],
        temperatureC: null,
        uptimeSeconds: 96_000,
        processCount: 61,
      },
      services: [
        { name: 'nginx', state: 'up' },
        { name: 'redis', state: 'degraded', detail: 'evicting keys' },
      ],
    },
    {
      id: 'demo-workstation',
      name: 'workstation',
      kind: 'workstation',
      os: 'Ubuntu 24.04',
      ip: '10.0.0.31',
      tags: ['demo', 'desk'],
      metrics: {
        cpuPercent: Math.round(8 + phase(5) * 22),
        memoryUsedBytes: Math.round((11 + phase(6) * 5) * GB),
        memoryTotalBytes: 64 * GB,
        diskUsedBytes: 1_400 * GB,
        diskTotalBytes: 2_048 * GB,
        loadAverage: [0.4, 0.5, 0.6],
        temperatureC: Math.round(38 + phase(7) * 10),
        uptimeSeconds: 42_000,
        processCount: 388,
      },
      services: [{ name: 'ollama', state: 'up' }],
    },
    {
      id: 'demo-build',
      name: 'build-runner',
      kind: 'container',
      os: 'Ubuntu 22.04',
      ip: '10.0.0.44',
      tags: ['demo', 'ci'],
      metrics: {
        cpuPercent: Math.round(70 + phase(8) * 28),
        memoryUsedBytes: Math.round((7.4 + phase(9) * 0.5) * GB),
        memoryTotalBytes: 8 * GB,
        diskUsedBytes: 74 * GB,
        diskTotalBytes: 80 * GB,
        loadAverage: [3.2, 2.8, 2.1],
        temperatureC: null,
        uptimeSeconds: 7_200,
        processCount: 44,
      },
      services: [{ name: 'buildkit', state: 'up' }],
    },
  ];

  return payloads.map((payload) => ({
    ...payload,
    lastSeen,
    health: deriveHealth(payload, lastSeen, now),
  }));
}
