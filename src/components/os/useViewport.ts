'use client';

import { useSyncExternalStore } from 'react';

export interface Viewport {
  width: number;
  height: number;
  /** Phone-sized: floating windows collapse into one full-screen panel. */
  compact: boolean;
}

const COMPACT_BREAKPOINT = 900;
const SERVER_VIEWPORT: Viewport = { width: 1440, height: 900, compact: false };

// useSyncExternalStore compares snapshots by identity, so the same object must
// come back until the viewport actually changes.
let cached: Viewport = SERVER_VIEWPORT;

function readViewport(): Viewport {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (cached.width === width && cached.height === height) return cached;
  cached = { width, height, compact: width <= COMPACT_BREAKPOINT };
  return cached;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  };
}

/**
 * Viewport size read through an external store rather than an effect, so the
 * hydration render matches the server and the layout settles in one pass.
 */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, readViewport, () => SERVER_VIEWPORT);
}
