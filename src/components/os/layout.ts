import { clamp } from '@/lib/utils';
import type { AppId, WindowGeometry } from './types';
import type { Viewport } from './useViewport';

const TOP_BAR = 56;
const DOCK = 92;
const GUTTER = 16;

/**
 * Default placement for a window.
 *
 * Computed from the viewport instead of hard-coded pixels so a window never
 * opens off-screen on a laptop, an ultrawide, or a rotated tablet.
 */
export function defaultGeometry(id: AppId, viewport: Viewport): WindowGeometry {
  const { width, height } = viewport;
  const top = TOP_BAR + GUTTER;
  const usableHeight = Math.max(240, height - top - DOCK);
  const usableWidth = Math.max(320, width - GUTTER * 2);

  const columns = width >= 1280 ? 3 : width >= 1024 ? 2 : 1;
  const columnWidth = clamp(
    (usableWidth - GUTTER * (columns - 1)) / columns,
    320,
    columns === 1 ? usableWidth : 440,
  );
  const columnX = (index: number) => GUTTER + index * (columnWidth + GUTTER);
  // Columns stop short of the dock so the operations view stays readable behind them.
  const columnHeight = Math.round(usableHeight * 0.8);

  const centred = (preferredWidth: number, preferredHeight: number): WindowGeometry => {
    const w = Math.min(preferredWidth, usableWidth);
    const h = Math.min(preferredHeight, usableHeight);
    return { x: Math.round((width - w) / 2), y: Math.round(top + (usableHeight - h) / 4), width: w, height: h };
  };

  switch (id) {
    case 'chat':
      return { x: columnX(0), y: top, width: columnWidth, height: columnHeight };
    case 'agents':
      return {
        x: columns >= 2 ? columnX(1) : columnX(0) + 24,
        y: top,
        width: columnWidth,
        height: columnHeight,
      };
    case 'nodes':
      return {
        x: columns >= 3 ? columnX(2) : columnX(0) + 48,
        y: top,
        width: columnWidth,
        height: columns >= 3 ? columnHeight : Math.round(columnHeight * 0.9),
      };
    case 'github':
      return centred(760, 600);
    case 'terminal':
      return centred(720, 440);
    case 'system':
      return centred(620, 620);
    default:
      return centred(560, 480);
  }
}

/** Keeps a stored geometry usable after the viewport shrinks. */
export function clampGeometry(geometry: WindowGeometry, viewport: Viewport): WindowGeometry {
  const width = clamp(geometry.width, 320, Math.max(320, viewport.width - GUTTER * 2));
  const height = clamp(geometry.height, 220, Math.max(220, viewport.height - TOP_BAR - GUTTER));
  return {
    width,
    height,
    x: clamp(geometry.x, -width + 140, Math.max(0, viewport.width - 140)),
    y: clamp(geometry.y, TOP_BAR, Math.max(TOP_BAR, viewport.height - 80)),
  };
}
