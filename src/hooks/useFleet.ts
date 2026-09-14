'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NeoEvent, NeoNode } from '@/lib/telemetry/types';

export interface FleetSummary {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  stale: number;
}

export interface FleetState {
  nodes: NeoNode[];
  events: NeoEvent[];
  summary: FleetSummary;
  store: string;
  demo: boolean;
  error: string | null;
  loading: boolean;
  refresh(): void;
}

const EMPTY_SUMMARY: FleetSummary = { total: 0, healthy: 0, warning: 0, critical: 0, stale: 0 };

/** Polls the telemetry endpoint. Agents report every ~10s, so 5s keeps the view live. */
export function useFleet(intervalMs = 5000): FleetState {
  const [nodes, setNodes] = useState<NeoNode[]>([]);
  const [events, setEvents] = useState<NeoEvent[]>([]);
  const [summary, setSummary] = useState<FleetSummary>(EMPTY_SUMMARY);
  const [store, setStore] = useState('memory');
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch('/api/telemetry/nodes', { cache: 'no-store' });
      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (!response.ok) throw new Error(`Telemetry request failed (${response.status}).`);
      const body = (await response.json()) as {
        nodes: NeoNode[];
        events: NeoEvent[];
        summary: FleetSummary;
        store: string;
        demo: boolean;
      };
      setNodes(body.nodes);
      setEvents(body.events);
      setSummary(body.summary);
      setStore(body.store);
      setDemo(body.demo);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Telemetry unavailable.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Scheduled rather than called inline so the HUD paints before the first poll.
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [intervalMs, refresh]);

  return { nodes, events, summary, store, demo, error, loading, refresh: () => void refresh() };
}
