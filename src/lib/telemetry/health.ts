import type { NeoNode, NodeHealth, TelemetryPayload } from './types';

/** A node that has not reported within this window is considered stale. */
export const STALE_AFTER_MS = 90_000;

export interface HealthThresholds {
  cpuWarn: number;
  cpuCritical: number;
  memoryWarn: number;
  memoryCritical: number;
  diskWarn: number;
  diskCritical: number;
  temperatureWarn: number;
  temperatureCritical: number;
}

export const defaultThresholds: HealthThresholds = {
  cpuWarn: 80,
  cpuCritical: 95,
  memoryWarn: 85,
  memoryCritical: 95,
  diskWarn: 85,
  diskCritical: 95,
  temperatureWarn: 75,
  temperatureCritical: 88,
};

function ratio(used: number | null, total: number | null): number | null {
  if (used === null || total === null || total <= 0) return null;
  return (used / total) * 100;
}

export function usagePercent(
  used: number | null,
  total: number | null,
): number | null {
  const value = ratio(used, total);
  return value === null ? null : Math.round(value * 10) / 10;
}

/**
 * Derives a node's health from its last payload and how long ago it arrived.
 * Staleness wins over everything else: metrics we cannot trust are not "healthy".
 */
export function deriveHealth(
  payload: TelemetryPayload,
  lastSeenIso: string,
  now: number = Date.now(),
  thresholds: HealthThresholds = defaultThresholds,
): NodeHealth {
  const lastSeen = Date.parse(lastSeenIso);
  if (Number.isNaN(lastSeen) || now - lastSeen > STALE_AFTER_MS) return 'stale';

  const { metrics, services } = payload;
  const memory = ratio(metrics.memoryUsedBytes, metrics.memoryTotalBytes);
  const disk = ratio(metrics.diskUsedBytes, metrics.diskTotalBytes);

  const critical =
    (metrics.cpuPercent !== null && metrics.cpuPercent >= thresholds.cpuCritical) ||
    (memory !== null && memory >= thresholds.memoryCritical) ||
    (disk !== null && disk >= thresholds.diskCritical) ||
    (metrics.temperatureC !== null && metrics.temperatureC >= thresholds.temperatureCritical) ||
    services.some((service) => service.state === 'down');
  if (critical) return 'critical';

  const warning =
    (metrics.cpuPercent !== null && metrics.cpuPercent >= thresholds.cpuWarn) ||
    (memory !== null && memory >= thresholds.memoryWarn) ||
    (disk !== null && disk >= thresholds.diskWarn) ||
    (metrics.temperatureC !== null && metrics.temperatureC >= thresholds.temperatureWarn) ||
    services.some((service) => service.state === 'degraded');
  return warning ? 'warning' : 'healthy';
}

export function summarizeFleet(nodes: NeoNode[]): {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  stale: number;
} {
  const summary = { total: nodes.length, healthy: 0, warning: 0, critical: 0, stale: 0 };
  for (const node of nodes) summary[node.health] += 1;
  return summary;
}
