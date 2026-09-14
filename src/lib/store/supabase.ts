import { deriveHealth } from '@/lib/telemetry/health';
import {
  telemetryPayloadSchema,
  type NeoEvent,
  type NeoNode,
  type TelemetryPayload,
} from '@/lib/telemetry/types';
import type { NeoStore } from './types';

interface NodeRow {
  id: string;
  last_seen: string;
  payload: unknown;
}

interface EventRow {
  id: string;
  at: string;
  level: NeoEvent['level'];
  source: string;
  message: string;
}

/**
 * Durable store backed by Supabase's PostgREST endpoint.
 *
 * Deliberately talks plain HTTP instead of pulling in the Supabase SDK: the two
 * tables Neo needs are simple, and this keeps the deployment dependency-free.
 * Schema lives in supabase/schema.sql.
 */
export class SupabaseStore implements NeoStore {
  readonly kind = 'supabase' as const;

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
  ) {}

  private async request<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('apikey', this.serviceKey);
    headers.set('Authorization', `Bearer ${this.serviceKey}`);
    headers.set('Content-Type', 'application/json');
    if (init.prefer) headers.set('Prefer', init.prefer);

    const response = await fetch(`${this.url.replace(/\/$/, '')}/rest/v1/${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    if (response.status === 204) return [] as unknown as T;
    return (await response.json()) as T;
  }

  async upsertNode(payload: TelemetryPayload, lastSeen: string): Promise<NeoNode> {
    await this.request('neo_nodes', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify([{ id: payload.id, last_seen: lastSeen, payload }]),
    });
    return { ...payload, lastSeen, health: deriveHealth(payload, lastSeen) };
  }

  async listNodes(): Promise<NeoNode[]> {
    const rows = await this.request<NodeRow[]>('neo_nodes?select=id,last_seen,payload&order=id');
    return rows.flatMap((row) => {
      const node = this.hydrate(row);
      return node ? [node] : [];
    });
  }

  async getNode(id: string): Promise<NeoNode | null> {
    const rows = await this.request<NodeRow[]>(
      `neo_nodes?select=id,last_seen,payload&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    const row = rows[0];
    return row ? this.hydrate(row) : null;
  }

  async deleteNode(id: string): Promise<boolean> {
    await this.request(`neo_nodes?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
    return true;
  }

  async appendEvent(event: NeoEvent): Promise<void> {
    await this.request('neo_events', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify([
        {
          id: event.id,
          at: event.at,
          level: event.level,
          source: event.source,
          message: event.message,
        },
      ]),
    });
  }

  async listEvents(limit = 100): Promise<NeoEvent[]> {
    const rows = await this.request<EventRow[]>(
      `neo_events?select=id,at,level,source,message&order=at.desc&limit=${limit}`,
    );
    return rows.map((row) => ({
      id: row.id,
      at: row.at,
      level: row.level,
      source: row.source,
      message: row.message,
    }));
  }

  /** Rows are written by trusted agents, but a bad row must not take the fleet view down. */
  private hydrate(row: NodeRow): NeoNode | null {
    const parsed = telemetryPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return null;
    return {
      ...parsed.data,
      lastSeen: row.last_seen,
      health: deriveHealth(parsed.data, row.last_seen),
    };
  }
}
