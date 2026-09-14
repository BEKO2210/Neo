'use client';

import { usagePercent } from '@/lib/telemetry/health';
import type { NeoEvent, NeoNode } from '@/lib/telemetry/types';
import { cn, formatBytes, formatRelativeTime } from '@/lib/utils';

interface NodesAppProps {
  nodes: NeoNode[];
  events: NeoEvent[];
  selectedId: string | null;
  demo: boolean;
  error: string | null;
  onSelect(id: string | null): void;
}

const HEALTH_STYLE: Record<NeoNode['health'], string> = {
  healthy: 'border-signal/40 text-signal',
  warning: 'border-warn/40 text-warn',
  critical: 'border-alert/40 text-alert',
  stale: 'border-mist/40 text-mist',
};

function Meter({ label, percent, detail }: { label: string; percent: number | null; detail?: string }) {
  const value = percent ?? 0;
  const tone = value >= 95 ? 'bg-alert' : value >= 80 ? 'bg-warn' : 'bg-signal';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="neo-label">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-chrome">
          {percent === null ? 'n/a' : `${percent}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-edge/60">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', tone)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      {detail ? <p className="mt-1 font-mono text-[10px] text-mist">{detail}</p> : null}
    </div>
  );
}

export function NodesApp({ nodes, events, selectedId, demo, error, onSelect }: NodesAppProps) {
  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {error ? (
        <p className="border-b border-alert/30 bg-alert/10 px-3 py-2 text-xs text-alert">{error}</p>
      ) : null}
      {demo ? (
        <p className="border-b border-plasma/30 bg-plasma/10 px-3 py-2 text-[11px] text-plasma">
          Showing demo nodes. Run <span className="font-mono">agent/neo_agent.py</span> on a real
          machine to replace them.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {nodes.length === 0 ? (
          <div className="space-y-2 p-5 text-center">
            <p className="neo-label">No nodes reporting</p>
            <p className="mx-auto max-w-xs text-xs leading-relaxed text-mist">
              Start the telemetry agent on any machine:
              <br />
              <span className="mt-2 inline-block rounded border border-edge bg-abyss px-2 py-1 font-mono text-[11px] text-neo">
                python3 agent/neo_agent.py
              </span>
            </p>
          </div>
        ) : null}

        <ul className="divide-y divide-edge/50">
          {nodes.map((node) => {
            const active = node.id === selectedId;
            const memory = usagePercent(node.metrics.memoryUsedBytes, node.metrics.memoryTotalBytes);
            const disk = usagePercent(node.metrics.diskUsedBytes, node.metrics.diskTotalBytes);
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onSelect(active ? null : node.id)}
                  className={cn(
                    'w-full px-3 py-2.5 text-left transition',
                    active ? 'bg-neo/10' : 'hover:bg-edge/25',
                  )}
                  aria-expanded={active}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-chrome">{node.name}</span>
                    <span
                      className={cn(
                        'rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider',
                        HEALTH_STYLE[node.health],
                      )}
                    >
                      {node.health}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-mist">
                      {formatRelativeTime(node.lastSeen)}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-mist">
                    {node.kind} · {node.os ?? 'unknown os'} · cpu {node.metrics.cpuPercent ?? '—'}% ·
                    mem {memory ?? '—'}% · disk {disk ?? '—'}%
                  </p>
                </button>

                {active ? (
                  <div className="neo-rise space-y-3 border-t border-edge/50 bg-abyss/50 px-3 py-3">
                    <Meter label="CPU" percent={node.metrics.cpuPercent} />
                    <Meter
                      label="Memory"
                      percent={memory}
                      detail={
                        node.metrics.memoryUsedBytes !== null && node.metrics.memoryTotalBytes !== null
                          ? `${formatBytes(node.metrics.memoryUsedBytes)} of ${formatBytes(node.metrics.memoryTotalBytes)}`
                          : undefined
                      }
                    />
                    <Meter
                      label="Disk"
                      percent={disk}
                      detail={
                        node.metrics.diskUsedBytes !== null && node.metrics.diskTotalBytes !== null
                          ? `${formatBytes(node.metrics.diskUsedBytes)} of ${formatBytes(node.metrics.diskTotalBytes)}`
                          : undefined
                      }
                    />

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between">
                        <dt className="text-mist">temp</dt>
                        <dd className="text-chrome">
                          {node.metrics.temperatureC !== null ? `${node.metrics.temperatureC}°C` : '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-mist">load</dt>
                        <dd className="text-chrome">
                          {node.metrics.loadAverage ? node.metrics.loadAverage.join(' / ') : '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-mist">procs</dt>
                        <dd className="text-chrome">{node.metrics.processCount ?? '—'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-mist">ip</dt>
                        <dd className="truncate text-chrome">{node.ip ?? '—'}</dd>
                      </div>
                    </dl>

                    {node.services.length > 0 ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {node.services.map((service) => (
                          <li
                            key={service.name}
                            title={service.detail ?? undefined}
                            className={cn(
                              'rounded border px-1.5 py-0.5 font-mono text-[10px]',
                              service.state === 'up' && 'border-signal/40 text-signal',
                              service.state === 'degraded' && 'border-warn/40 text-warn',
                              service.state === 'down' && 'border-alert/40 text-alert',
                              service.state === 'unknown' && 'border-edge text-mist',
                            )}
                          >
                            {service.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {events.length > 0 ? (
          <section className="border-t border-edge/60 p-3">
            <h3 className="neo-label mb-2">Event log</h3>
            <ul className="space-y-1 font-mono text-[10.5px] leading-relaxed">
              {events.slice(0, 20).map((event) => (
                <li key={event.id} className="flex gap-2">
                  <span className="shrink-0 text-mist">{formatRelativeTime(event.at)}</span>
                  <span
                    className={cn(
                      'shrink-0',
                      event.level === 'error' && 'text-alert',
                      event.level === 'warn' && 'text-warn',
                      event.level === 'info' && 'text-neo',
                    )}
                  >
                    {event.source}
                  </span>
                  <span className="text-chrome/80">{event.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {selected ? (
        <footer className="shrink-0 border-t border-edge/70 bg-abyss/60 px-3 py-1.5 font-mono text-[10px] text-mist">
          selected: {selected.id}
        </footer>
      ) : null}
    </div>
  );
}
