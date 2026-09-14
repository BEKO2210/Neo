'use client';

import { useSyncExternalStore } from 'react';
import type { NeoConfig } from '@/hooks/useConfig';
import { cn } from '@/lib/utils';

interface SystemAppProps {
  config: NeoConfig | null;
  speakReplies: boolean;
  onSpeakRepliesChange(value: boolean): void;
}

const subscribeToNothing = () => () => {};

function InstallHint() {
  // The origin only exists in the browser; the server snapshot renders a placeholder.
  const origin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => '',
  );
  return (
    <code className="break-all font-mono text-[10.5px] text-neo">
      {origin || 'https://your-neo-deployment'}/api/telemetry/ingest
    </code>
  );
}

export function SystemApp({ config, speakReplies, onSpeakRepliesChange }: SystemAppProps) {
  if (!config) return <p className="p-4 font-mono text-xs text-mist">Loading configuration…</p>;

  return (
    <div className="h-full space-y-5 overflow-y-auto p-4 text-sm">
      <section>
        <h3 className="neo-label mb-2">Integrations</h3>
        <ul className="space-y-1.5">
          {config.features.map((feature) => (
            <li
              key={feature.id}
              className="flex items-start gap-2.5 rounded-lg border border-edge/60 bg-abyss/40 px-3 py-2"
            >
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  feature.enabled ? 'bg-signal' : 'bg-mist/50',
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-xs text-chrome">
                  {feature.label}
                  <span className={cn('ml-2 font-mono text-[10px]', feature.enabled ? 'text-signal' : 'text-mist')}>
                    {feature.enabled ? 'ONLINE' : 'OFF'}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-mist">{feature.hint}</p>
                {!feature.enabled ? (
                  <p className="mt-1 font-mono text-[10px] text-neo">{feature.envVars.join('  ')}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="neo-label mb-2">Agents</h3>
        <ul className="space-y-1.5">
          {config.agents.map((agent) => (
            <li key={agent.id} className="rounded-lg border border-edge/60 bg-abyss/40 px-3 py-2">
              <p className="flex items-center gap-2 text-xs text-chrome">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: agent.color }}
                  aria-hidden
                />
                {agent.name}
                <span className="text-[11px] text-mist">{agent.role}</span>
              </p>
              <p className="mt-1 font-mono text-[10px] text-mist">{agent.tools.join(' · ')}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="neo-label mb-2">Preferences</h3>
        <label className="flex items-center gap-2.5 rounded-lg border border-edge/60 bg-abyss/40 px-3 py-2.5">
          <input
            type="checkbox"
            checked={speakReplies}
            onChange={(event) => onSpeakRepliesChange(event.target.checked)}
            className="h-4 w-4 accent-[#22d3ee]"
          />
          <span className="text-xs text-chrome">
            Speak chat replies aloud
            <span className="ml-2 text-[11px] text-mist">uses the browser voice, no API key</span>
          </span>
        </label>
      </section>

      <section>
        <h3 className="neo-label mb-2">Connect a machine</h3>
        <div className="space-y-2 rounded-lg border border-edge/60 bg-abyss/40 p-3">
          <p className="text-[11px] leading-relaxed text-mist">
            Copy <span className="font-mono text-chrome">agent/neo_agent.py</span> onto any Linux or
            macOS machine and run it. It needs no dependencies beyond Python 3.9.
          </p>
          <pre className="overflow-x-auto rounded border border-edge bg-void/80 p-2 font-mono text-[10.5px] text-chrome/90">
{`export NEO_URL=<your deployment>
export NEO_AGENT_TOKEN=<NEO_AGENT_TOKEN>
python3 neo_agent.py`}
          </pre>
          <p className="text-[11px] text-mist">
            Ingest endpoint: <InstallHint />
          </p>
        </div>
      </section>

      <section>
        <h3 className="neo-label mb-2">Runtime</h3>
        <dl className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
          <dt className="text-mist">operator</dt>
          <dd className="text-chrome">{config.operator}</dd>
          <dt className="text-mist">store</dt>
          <dd className="text-chrome">{config.store}</dd>
          <dt className="text-mist">providers</dt>
          <dd className="text-chrome">
            {config.providers.map((provider) => provider.id).join(', ') || 'none'}
          </dd>
          <dt className="text-mist">demo mode</dt>
          <dd className="text-chrome">{config.demoMode ? 'on' : 'off'}</dd>
        </dl>
      </section>
    </div>
  );
}
