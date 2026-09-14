'use client';

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { WindowState } from './types';

interface WindowProps {
  state: WindowState;
  compact: boolean;
  accent?: string;
  children: ReactNode;
  onFocus(): void;
  onClose(): void;
  onMinimize(): void;
  onMaximize(): void;
  onMove(x: number, y: number): void;
  onResize(width: number, height: number): void;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;

export function NeoWindow({
  state,
  compact,
  accent = '#22d3ee',
  children,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onMove,
  onResize,
}: WindowProps) {
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const resizeRef = useRef<{
    pointerX: number;
    pointerY: number;
    width: number;
    height: number;
  } | null>(null);

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (compact || state.maximized) return;
      // Ignore drags that start on the control buttons.
      if ((event.target as HTMLElement).closest('button')) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        x: state.geometry.x,
        y: state.geometry.y,
      };
      onFocus();
    },
    [compact, onFocus, state.geometry.x, state.geometry.y, state.maximized],
  );

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (compact || state.maximized) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        width: state.geometry.width,
        height: state.geometry.height,
      };
      onFocus();
    },
    [compact, onFocus, state.geometry.height, state.geometry.width, state.maximized],
  );

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (drag) {
        // Keep at least a sliver of the title bar reachable.
        const maxX = window.innerWidth - 120;
        const maxY = window.innerHeight - 80;
        onMove(
          Math.min(maxX, Math.max(-40, drag.x + (event.clientX - drag.pointerX))),
          Math.min(maxY, Math.max(56, drag.y + (event.clientY - drag.pointerY))),
        );
        return;
      }
      const resize = resizeRef.current;
      if (resize) {
        onResize(
          Math.max(MIN_WIDTH, resize.width + (event.clientX - resize.pointerX)),
          Math.max(MIN_HEIGHT, resize.height + (event.clientY - resize.pointerY)),
        );
      }
    }
    function handleUp() {
      dragRef.current = null;
      resizeRef.current = null;
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [onMove, onResize]);

  if (!state.open || state.minimized) return null;

  const style =
    compact || state.maximized
      ? { inset: compact ? '3.5rem 0 6.25rem' : '4rem 1rem 5.5rem', zIndex: state.z + 10 }
      : {
          left: state.geometry.x,
          top: state.geometry.y,
          width: state.geometry.width,
          height: state.geometry.height,
          zIndex: state.z + 10,
        };

  return (
    <section
      className={cn(
        'neo-panel neo-rise absolute flex flex-col overflow-hidden rounded-xl',
        compact && 'rounded-none border-x-0',
      )}
      style={style}
      onPointerDown={onFocus}
      aria-label={state.title}
    >
      <header
        className="flex shrink-0 cursor-grab items-center gap-2 border-b border-edge/70 bg-abyss/70 px-3 py-2 active:cursor-grabbing"
        onPointerDown={handleDragStart}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
          aria-hidden
        />
        <h2 className="neo-label flex-1 truncate !text-[0.6875rem] !text-chrome">{state.title}</h2>
        <div className="flex items-center gap-1">
          {!compact ? (
            <>
              <button
                type="button"
                onClick={onMinimize}
                className="grid h-6 w-6 place-items-center rounded text-mist transition hover:bg-edge hover:text-chrome"
                aria-label={`Minimize ${state.title}`}
              >
                <span className="block h-px w-3 bg-current" />
              </button>
              <button
                type="button"
                onClick={onMaximize}
                className="grid h-6 w-6 place-items-center rounded text-mist transition hover:bg-edge hover:text-chrome"
                aria-label={`${state.maximized ? 'Restore' : 'Maximize'} ${state.title}`}
              >
                <span className="block h-2.5 w-2.5 border border-current" />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded text-mist transition hover:bg-alert/20 hover:text-alert"
            aria-label={`Close ${state.title}`}
          >
            <span aria-hidden className="text-sm leading-none">
              ×
            </span>
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

      {!compact && !state.maximized ? (
        <button
          type="button"
          onPointerDown={handleResizeStart}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          aria-label={`Resize ${state.title}`}
        >
          <span className="absolute bottom-1 right-1 block h-2 w-2 border-b border-r border-mist/60" />
        </button>
      ) : null}
    </section>
  );
}
