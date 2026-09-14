import { z } from 'zod';

export const nodeKinds = ['server', 'workstation', 'mobile', 'container', 'service'] as const;
export type NodeKind = (typeof nodeKinds)[number];

export const serviceStatusSchema = z.object({
  name: z.string().min(1).max(80),
  state: z.enum(['up', 'down', 'degraded', 'unknown']).default('unknown'),
  // Agents send null when they have nothing to add, so accept both shapes.
  detail: z.string().max(240).nullish(),
});

export const metricsSchema = z.object({
  cpuPercent: z.number().min(0).max(100).nullable().default(null),
  memoryUsedBytes: z.number().min(0).nullable().default(null),
  memoryTotalBytes: z.number().min(0).nullable().default(null),
  diskUsedBytes: z.number().min(0).nullable().default(null),
  diskTotalBytes: z.number().min(0).nullable().default(null),
  loadAverage: z.tuple([z.number(), z.number(), z.number()]).nullable().default(null),
  temperatureC: z.number().min(-50).max(200).nullable().default(null),
  uptimeSeconds: z.number().min(0).nullable().default(null),
  processCount: z.number().int().min(0).nullable().default(null),
});

export const telemetryPayloadSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'id may only contain letters, digits, dot, dash and underscore'),
  name: z.string().min(1).max(80),
  kind: z.enum(nodeKinds).default('server'),
  os: z.string().max(120).nullish(),
  ip: z.string().max(64).nullish(),
  tags: z.array(z.string().max(32)).max(12).default([]),
  metrics: metricsSchema,
  services: z.array(serviceStatusSchema).max(40).default([]),
});

export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;
export type NodeMetrics = z.infer<typeof metricsSchema>;
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export interface NeoNode extends TelemetryPayload {
  lastSeen: string;
  /** Derived, never sent by the agent. */
  health: NodeHealth;
}

export type NodeHealth = 'healthy' | 'warning' | 'critical' | 'stale';

export interface NeoEvent {
  id: string;
  at: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}
