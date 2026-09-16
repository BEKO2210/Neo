'use client';

import { useCallback, useMemo, useState } from 'react';
import { clampGeometry, defaultGeometry } from './layout';
import type { AppId, WindowGeometry, WindowState } from './types';
import type { Viewport } from './useViewport';

const APPS: Array<{ id: AppId; title: string }> = [
  { id: 'chat', title: 'Neo // Chat' },
  { id: 'agents', title: 'Agent Pipeline' },
  { id: 'nodes', title: 'Fleet' },
  { id: 'github', title: 'GitHub' },
  { id: 'terminal', title: 'Terminal' },
  { id: 'system', title: 'Account' },
];

// Listed front-to-back: chat ends up focused, which is what a phone shows first.
const INITIALLY_OPEN: AppId[] = ['chat', 'agents', 'nodes'];

interface Flags {
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  z: number;
}

function initialFlags(): Record<AppId, Flags> {
  const entries = APPS.map((app, index) => {
    const openIndex = INITIALLY_OPEN.indexOf(app.id);
    return [
      app.id,
      {
        open: openIndex !== -1,
        minimized: false,
        maximized: false,
        z: openIndex !== -1 ? INITIALLY_OPEN.length - openIndex + APPS.length : index + 1,
      },
    ] as const;
  });
  return Object.fromEntries(entries) as Record<AppId, Flags>;
}

export interface WindowApi {
  windows: WindowState[];
  /** The window a compact viewport should show, or null when all are closed. */
  focused: WindowState | null;
  open(id: AppId): void;
  close(id: AppId): void;
  toggle(id: AppId): void;
  focus(id: AppId): void;
  minimize(id: AppId): void;
  maximize(id: AppId): void;
  move(id: AppId, x: number, y: number): void;
  resize(id: AppId, width: number, height: number): void;
}

/**
 * Window bookkeeping for the desktop shell.
 *
 * Geometry is stored only once the operator drags or resizes a window; until
 * then it is derived from the viewport, so the default layout always fits.
 */
export function useWindows(viewport: Viewport): WindowApi {
  const [flags, setFlags] = useState<Record<AppId, Flags>>(initialFlags);
  const [overrides, setOverrides] = useState<Partial<Record<AppId, WindowGeometry>>>({});

  const windows = useMemo<WindowState[]>(
    () =>
      APPS.map((app) => {
        const override = overrides[app.id];
        const geometry = override
          ? clampGeometry(override, viewport)
          : defaultGeometry(app.id, viewport);
        return { id: app.id, title: app.title, ...flags[app.id], geometry };
      }),
    [flags, overrides, viewport],
  );

  const focused = useMemo(() => {
    const visible = windows.filter((window) => window.open && !window.minimized);
    if (visible.length === 0) return null;
    return visible.reduce((top, window) => (window.z > top.z ? window : top));
  }, [windows]);

  const update = useCallback((id: AppId, patch: (flag: Flags, topZ: number) => Flags) => {
    setFlags((current) => {
      const topZ = Object.values(current).reduce((max, flag) => Math.max(max, flag.z), 0);
      return { ...current, [id]: patch(current[id], topZ) };
    });
  }, []);

  const focus = useCallback(
    (id: AppId) => update(id, (flag, topZ) => (flag.z === topZ ? flag : { ...flag, z: topZ + 1 })),
    [update],
  );

  const open = useCallback(
    (id: AppId) => update(id, (flag, topZ) => ({ ...flag, open: true, minimized: false, z: topZ + 1 })),
    [update],
  );

  const close = useCallback((id: AppId) => update(id, (flag) => ({ ...flag, open: false })), [update]);

  const toggle = useCallback(
    (id: AppId) =>
      update(id, (flag, topZ) =>
        flag.open && !flag.minimized
          ? { ...flag, minimized: true }
          : { ...flag, open: true, minimized: false, z: topZ + 1 },
      ),
    [update],
  );

  const minimize = useCallback(
    (id: AppId) => update(id, (flag) => ({ ...flag, minimized: true })),
    [update],
  );

  const maximize = useCallback(
    (id: AppId) => update(id, (flag) => ({ ...flag, maximized: !flag.maximized })),
    [update],
  );

  const setGeometry = useCallback(
    (id: AppId, patch: (geometry: WindowGeometry) => WindowGeometry, fallback: WindowGeometry) => {
      setOverrides((current) => ({ ...current, [id]: patch(current[id] ?? fallback) }));
    },
    [],
  );

  const move = useCallback(
    (id: AppId, x: number, y: number) =>
      setGeometry(id, (geometry) => ({ ...geometry, x, y }), defaultGeometry(id, viewport)),
    [setGeometry, viewport],
  );

  const resize = useCallback(
    (id: AppId, width: number, height: number) =>
      setGeometry(id, (geometry) => ({ ...geometry, width, height }), defaultGeometry(id, viewport)),
    [setGeometry, viewport],
  );

  return { windows, focused, open, close, toggle, focus, minimize, maximize, move, resize };
}
