'use client';

import { useEffect, useRef } from 'react';
import type { NeoSceneEngine, SceneNode } from './scene-engine';

interface NeoSceneProps {
  nodes: SceneNode[];
  selectedId: string | null;
  /** Colour of the agent currently working, or null when idle. */
  activityColor: string | null;
  onSelect(id: string): void;
}

/**
 * React shell around the imperative three.js engine.
 *
 * The engine is imported lazily so WebGL never runs during server rendering,
 * and the component only pushes state into it — it never re-creates it.
 */
export function NeoScene({ nodes, selectedId, activityColor, onSelect }: NeoSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<NeoSceneEngine | null>(null);
  const onSelectRef = useRef(onSelect);

  // Keeps the latest callback reachable from the engine without re-creating it.
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: NeoSceneEngine | null = null;
    let observer: ResizeObserver | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { NeoSceneEngine: Engine } = await import('./scene-engine');
        if (cancelled) return;
        engine = new Engine(canvas, {
          onSelect: (id) => {
            if (id) onSelectRef.current(id);
          },
        });
        engineRef.current = engine;
        engine.start();

        observer = new ResizeObserver(() => engine?.resize());
        observer.observe(canvas);
      } catch (error) {
        // A machine without WebGL still gets the full HUD; only the backdrop is lost.
        console.warn('Neo: 3D view unavailable —', error);
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setNodes(nodes);
  }, [nodes]);

  useEffect(() => {
    engineRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (activityColor) engineRef.current?.pulse(activityColor);
  }, [activityColor]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      aria-label="Fleet operations view. Drag to orbit, scroll to zoom, click a node to select it."
    />
  );
}

export type { SceneNode };
