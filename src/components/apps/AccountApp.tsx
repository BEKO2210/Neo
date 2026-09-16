'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { AgentTokenSummary, ProviderKeyId, UsageTotals } from '@/lib/account/types';
import type { FeatureStatus } from '@/lib/env';
import type { NeoConfig } from '@/hooks/useConfig';
import { cn } from '@/lib/utils';

interface KeyRow {
  provider: ProviderKeyId;
  stored: boolean;
  hint: string | null;
  updatedAt: string | null;
  shared: boolean;
  available: boolean;
}

interface AccountData {
  email: string;
  role: string;
  store: string;
  period: string;
  keys: KeyRow[];
  sharedKeysOffered: boolean;
  quota: { enforced: boolean; limit: number; used: number; remaining: number | null };
  usage: UsageTotals;
  agentTokens: AgentTokenSummary[];
}

const PROVIDER_LABELS: Record<ProviderKeyId, { name: string; where: string; placeholder: string }> = {
  anthropic: {
    name: 'Anthropic',
    where: 'console.anthropic.com → API keys',
    placeholder: 'sk-ant-…',
  },
  openai: { name: 'OpenAI', where: 'platform.openai.com → API keys', placeholder: 'sk-…' },
  google: {
    name: 'Google Gemini',
    where: 'aistudio.google.com → Get API key',
    placeholder: 'AIza…',
  },
  github: {
    name: 'GitHub',
    where: 'github.com → Settings → Developer settings → Tokens',
    placeholder: 'github_pat_… or ghp_…',
  },
};

const subscribeToNothing = () => () => {};

function useOrigin(): string {
  return useSyncExternalStore(subscribeToNothing, () => window.location.origin, () => '');
}

interface AccountAppProps {
  config: NeoConfig | null;
  speakReplies: boolean;
  onSpeakRepliesChange(value: boolean): void;
}

export function AccountApp({ config, speakReplies, onSpeakRepliesChange }: AccountAppProps) {
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ProviderKeyId, string>>>({});
  const [saving, setSaving] = useState<ProviderKeyId | null>(null);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const origin = useOrigin();

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/account', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Account request failed (${response.status}).`);
      setData((await response.json()) as AccountData);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the account.');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function saveKey(provider: ProviderKeyId, value: string) {
    setSaving(provider);
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, value }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? `Failed (${response.status}).`);
      setDrafts((current) => ({ ...current, [provider]: '' }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the key.');
    } finally {
      setSaving(null);
    }
  }

  async function createToken() {
    const label = newTokenLabel.trim();
    if (!label) return;
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'agent-token', label }),
      });
      const body = (await response.json().catch(() => ({}))) as { token?: string; message?: string };
      if (!response.ok || !body.token) throw new Error(body.message ?? 'Could not create the token.');
      setFreshToken(body.token);
      setNewTokenLabel('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the token.');
    }
  }

  async function deleteToken(id: string) {
    await fetch(`/api/account?agentToken=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  }

  if (!data) {
    return (
      <p className="p-4 font-mono text-xs text-mist">
        {error ?? 'Loading account…'}
      </p>
    );
  }

  const quotaPercent =
    data.quota.enforced && data.quota.limit > 0
      ? Math.min(100, Math.round((data.quota.used / data.quota.limit) * 100))
      : 0;

  return (
    <div className="h-full space-y-6 overflow-y-auto p-4 text-sm">
      {error ? (
        <p className="rounded-lg border border-alert/40 bg-alert/10 p-2.5 text-xs text-alert">{error}</p>
      ) : null}

      {/* --- API keys ------------------------------------------------------ */}
      <section>
        <h3 className="neo-label mb-1">Your API keys</h3>
        <p className="mb-3 text-[11px] leading-relaxed text-mist">
          Stored encrypted on the server and never sent back to your browser. Leave a field empty and
          save to remove a key.
        </p>
        <ul className="space-y-2">
          {data.keys.map((row) => {
            const meta = PROVIDER_LABELS[row.provider];
            const draft = drafts[row.provider] ?? '';
            return (
              <li key={row.provider} className="rounded-lg border border-edge/60 bg-abyss/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      row.available ? 'bg-signal' : 'bg-mist/50',
                    )}
                    aria-hidden
                  />
                  <span className="text-xs text-chrome">{meta.name}</span>
                  {row.stored ? (
                    <span className="font-mono text-[10px] text-signal">{row.hint}</span>
                  ) : row.shared ? (
                    <span className="rounded border border-plasma/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-plasma">
                      operator key
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-mist">not set</span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <label className="sr-only" htmlFor={`key-${row.provider}`}>
                    {meta.name} key
                  </label>
                  <input
                    id={`key-${row.provider}`}
                    type="password"
                    autoComplete="off"
                    value={draft}
                    placeholder={row.stored ? 'replace…' : meta.placeholder}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [row.provider]: event.target.value }))
                    }
                    className="min-w-0 flex-1 rounded border border-edge bg-panel px-2 py-1.5 font-mono text-[11px] text-chrome placeholder:text-mist/50"
                  />
                  <button
                    type="button"
                    disabled={saving === row.provider || (draft.trim().length === 0 && !row.stored)}
                    onClick={() => void saveKey(row.provider, draft)}
                    className="shrink-0 rounded border border-neo/50 bg-neo/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-neo transition hover:bg-neo/20 disabled:opacity-30"
                  >
                    {saving === row.provider ? '…' : draft.trim() ? 'Save' : 'Clear'}
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-mist">{meta.where}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* --- usage --------------------------------------------------------- */}
      <section>
        <h3 className="neo-label mb-2">Usage · {data.period}</h3>
        <div className="rounded-lg border border-edge/60 bg-abyss/40 p-3">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
            <dt className="text-mist">calls</dt>
            <dd className="text-right text-chrome">{data.usage.calls.toLocaleString()}</dd>
            <dt className="text-mist">input tokens</dt>
            <dd className="text-right text-chrome">{data.usage.inputTokens.toLocaleString()}</dd>
            <dt className="text-mist">output tokens</dt>
            <dd className="text-right text-chrome">{data.usage.outputTokens.toLocaleString()}</dd>
            <dt className="text-mist">cost</dt>
            <dd className="text-right text-chrome">
              {data.usage.costUsd === null ? '—' : `$${data.usage.costUsd.toFixed(4)}`}
            </dd>
          </dl>

          {data.quota.enforced ? (
            <div className="mt-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="neo-label">Monthly allowance</span>
                <span className="font-mono text-[11px] text-chrome">
                  {data.quota.used.toLocaleString()} / {data.quota.limit.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-edge/60">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-500',
                    quotaPercent >= 95 ? 'bg-alert' : quotaPercent >= 80 ? 'bg-warn' : 'bg-signal',
                  )}
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-mist">
                You are using the operator&rsquo;s key. Add your own above to lift the cap.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[10px] leading-relaxed text-mist">
              Running on your own key — no cap. The figures above are what you spent with your
              provider, calculated from published prices where Neo knows them.
            </p>
          )}
        </div>
      </section>

      {/* --- agent tokens --------------------------------------------------- */}
      <section>
        <h3 className="neo-label mb-1">Machine tokens</h3>
        <p className="mb-3 text-[11px] leading-relaxed text-mist">
          One token per machine you want to watch. Shown once — copy it now.
        </p>

        {freshToken ? (
          <div className="mb-3 rounded-lg border border-signal/40 bg-signal/10 p-3">
            <p className="neo-label mb-1.5 !text-signal">New token — copy it now</p>
            <pre className="overflow-x-auto rounded border border-edge bg-void/80 p-2 font-mono text-[10px] text-chrome">
{`export NEO_URL=${origin || 'https://your-neo'}
export NEO_AGENT_TOKEN=${freshToken}
python3 neo_agent.py`}
            </pre>
            <button
              type="button"
              onClick={() => setFreshToken(null)}
              className="mt-2 font-mono text-[10px] uppercase tracking-wider text-mist hover:text-chrome"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="mb-2 flex gap-1.5">
          <label className="sr-only" htmlFor="token-label">
            Machine name
          </label>
          <input
            id="token-label"
            value={newTokenLabel}
            onChange={(event) => setNewTokenLabel(event.target.value)}
            placeholder="core-01"
            className="min-w-0 flex-1 rounded border border-edge bg-panel px-2 py-1.5 font-mono text-[11px] text-chrome placeholder:text-mist/50"
          />
          <button
            type="button"
            onClick={() => void createToken()}
            disabled={newTokenLabel.trim().length === 0}
            className="shrink-0 rounded border border-neo/50 bg-neo/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-neo transition hover:bg-neo/20 disabled:opacity-30"
          >
            Create
          </button>
        </div>

        {data.agentTokens.length > 0 ? (
          <ul className="space-y-1">
            {data.agentTokens.map((token) => (
              <li
                key={token.id}
                className="flex items-center gap-2 rounded border border-edge/60 bg-abyss/40 px-2.5 py-1.5"
              >
                <span className="truncate text-xs text-chrome">{token.label}</span>
                <span className="font-mono text-[10px] text-mist">{token.hint}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-mist">
                  {token.lastUsedAt ? 'active' : 'unused'}
                </span>
                <button
                  type="button"
                  onClick={() => void deleteToken(token.id)}
                  aria-label={`Delete token ${token.label}`}
                  className="shrink-0 text-mist transition hover:text-alert"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-mist">No machine tokens yet.</p>
        )}
      </section>

      {/* --- deployment, owner only ---------------------------------------- */}
      {config && config.features.length > 0 ? (
        <section>
          <h3 className="neo-label mb-2">Deployment</h3>
          <ul className="space-y-1.5">
            {config.features.map((feature: FeatureStatus) => (
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
                    <span
                      className={cn(
                        'ml-2 font-mono text-[10px]',
                        feature.enabled ? 'text-signal' : 'text-mist',
                      )}
                    >
                      {feature.enabled ? 'ON' : 'OFF'}
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
      ) : null}

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
            <span className="ml-2 text-[11px] text-mist">browser voice, no API key</span>
          </span>
        </label>
      </section>

      <section>
        <h3 className="neo-label mb-2">Account</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
          <dt className="text-mist">email</dt>
          <dd className="truncate text-chrome">{data.email}</dd>
          <dt className="text-mist">role</dt>
          <dd className="text-chrome">{data.role}</dd>
          <dt className="text-mist">storage</dt>
          <dd className="text-chrome">{data.store}</dd>
        </dl>
      </section>
    </div>
  );
}
