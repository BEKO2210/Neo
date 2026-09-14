'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/hud/Icon';
import { cn } from '@/lib/utils';
import type { FleetSummary } from '@/hooks/useFleet';
import type { ModelOption } from '@/hooks/useModels';

interface TopBarProps {
  operator: string;
  storeKind: string;
  demo: boolean;
  summary: FleetSummary;
  models: ModelOption[];
  model: string | null;
  onModelChange(value: string): void;
  onRefresh(): void;
  busy: boolean;
}

function Clock() {
  const [now, setNow] = useState<string>('--:--:--');
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString(undefined, { hour12: false }));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="font-mono text-xs tabular-nums text-chrome" suppressHydrationWarning>
      {now}
    </span>
  );
}

function Pill({ label, value, tone }: { label: string; value: number; tone: string }) {
  if (value === 0) return null;
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-mist">
      <span className={cn('h-1.5 w-1.5 rounded-full', tone)} aria-hidden />
      {value} {label}
    </span>
  );
}

export function TopBar({
  operator,
  storeKind,
  demo,
  summary,
  models,
  model,
  onModelChange,
  onRefresh,
  busy,
}: TopBarProps) {
  const router = useRouter();

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  return (
    <header className="pointer-events-auto fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-edge/60 bg-abyss/75 px-3 backdrop-blur-xl sm:px-4">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 place-items-center rounded-lg border border-neo/40 bg-neo/10 font-mono text-sm font-bold text-neo"
          aria-hidden
        >
          N
        </span>
        <div className="hidden leading-tight sm:block">
          <p className="font-mono text-sm tracking-[0.3em] text-chrome">NEO</p>
          <p className="neo-label !text-[0.5625rem]">{operator}</p>
        </div>
      </div>

      <div className="hidden items-center gap-3 border-l border-edge/60 pl-3 md:flex">
        <span className="neo-label">Fleet</span>
        {summary.total === 0 ? (
          <span className="font-mono text-[11px] text-mist">no nodes</span>
        ) : (
          <>
            <Pill label="ok" value={summary.healthy} tone="bg-signal" />
            <Pill label="warn" value={summary.warning} tone="bg-warn" />
            <Pill label="crit" value={summary.critical} tone="bg-alert" />
            <Pill label="stale" value={summary.stale} tone="bg-mist" />
          </>
        )}
        {demo ? (
          <span className="rounded border border-plasma/40 bg-plasma/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-plasma">
            DEMO DATA
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="sr-only" htmlFor="model-select">
          Model
        </label>
        <select
          id="model-select"
          value={model ?? ''}
          onChange={(event) => onModelChange(event.target.value)}
          disabled={models.length === 0}
          className="max-w-[9rem] rounded-lg border border-edge bg-panel px-2 py-1.5 font-mono text-[11px] text-chrome disabled:opacity-40 sm:max-w-[16rem]"
        >
          {models.length === 0 ? <option value="">no model keys</option> : null}
          {models.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onRefresh}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-lg border border-edge text-mist transition hover:border-neo/50 hover:text-neo',
            busy && 'text-neo',
          )}
          aria-label="Refresh fleet data"
        >
          <Icon name="refresh" size={15} className={cn(busy && 'neo-pulse')} />
        </button>

        <span
          className="hidden rounded border border-edge px-1.5 py-1 font-mono text-[10px] tracking-wider text-mist lg:inline"
          title={
            storeKind === 'memory'
              ? 'State lives in this instance and resets on restart. Configure Supabase for durability.'
              : 'State is persisted in Supabase.'
          }
        >
          {storeKind.toUpperCase()}
        </span>

        <Clock />

        <button
          type="button"
          onClick={() => void signOut()}
          className="grid h-8 w-8 place-items-center rounded-lg border border-edge text-mist transition hover:border-alert/50 hover:text-alert"
          aria-label="Sign out"
        >
          <Icon name="power" size={15} />
        </button>
      </div>
    </header>
  );
}
