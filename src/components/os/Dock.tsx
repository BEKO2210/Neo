'use client';

import { Icon, type IconName } from '@/components/hud/Icon';
import { cn } from '@/lib/utils';
import type { AppId, WindowState } from './types';

const APPS: Array<{ id: AppId; label: string; icon: IconName }> = [
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'agents', label: 'Agents', icon: 'agents' },
  { id: 'nodes', label: 'Fleet', icon: 'nodes' },
  { id: 'github', label: 'GitHub', icon: 'github' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' },
  { id: 'system', label: 'System', icon: 'system' },
];

interface DockProps {
  windows: WindowState[];
  onToggle(id: AppId): void;
}

export function Dock({ windows, onToggle }: DockProps) {
  const byId = new Map(windows.map((window) => [window.id, window]));

  return (
    <nav
      className="pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
      aria-label="Applications"
    >
      <ul className="neo-panel flex items-center gap-1 rounded-2xl px-2 py-2">
        {APPS.map((app) => {
          const state = byId.get(app.id);
          const active = Boolean(state?.open && !state.minimized);
          return (
            <li key={app.id}>
              <button
                type="button"
                onClick={() => onToggle(app.id)}
                aria-pressed={active}
                className={cn(
                  'group relative grid h-11 w-11 place-items-center rounded-xl border transition sm:h-12 sm:w-12',
                  active
                    ? 'border-neo/50 bg-neo/15 text-neo'
                    : 'border-transparent text-mist hover:border-edge hover:bg-edge/40 hover:text-chrome',
                )}
              >
                <Icon name={app.icon} size={20} />
                <span className="sr-only">{app.label}</span>
                <span
                  className={cn(
                    'pointer-events-none absolute -bottom-0.5 h-1 w-1 rounded-full transition',
                    active ? 'bg-neo' : 'bg-transparent',
                  )}
                  aria-hidden
                />
                <span className="pointer-events-none absolute -top-9 hidden whitespace-nowrap rounded-md border border-edge bg-abyss px-2 py-1 font-mono text-[10px] tracking-widest text-chrome group-hover:block">
                  {app.label.toUpperCase()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
