import type { AgentTokenSummary, NeoUserRecord, ProviderKeyId, UsageTotals, UserRole } from '@/lib/account/types';
import { deriveHealth } from '@/lib/telemetry/health';
import {
  telemetryPayloadSchema,
  type NeoEvent,
  type NeoNode,
  type TelemetryPayload,
} from '@/lib/telemetry/types';
import type { UsageRecord } from '@/lib/usage/pricing';
import { aggregate } from './memory';
import type { NeoStore, SealedKeyRow } from './types';

/**
 * Durable store backed by Supabase's PostgREST endpoint.
 *
 * Deliberately talks plain HTTP instead of pulling in the Supabase SDK: the
 * handful of tables Neo needs are simple, and this keeps the deployment
 * dependency-free. Schema lives in supabase/schema.sql.
 */
export class SupabaseStore implements NeoStore {
  readonly kind = 'supabase' as const;

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit & { prefer?: string } = {},
  ): Promise<T> {
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
      throw new Error(`Supabase ${response.status} on ${path}: ${detail.slice(0, 300)}`);
    }
    if (response.status === 204) return [] as unknown as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : []) as T;
  }

  // --- accounts ---

  async countUsers(): Promise<number> {
    const rows = await this.request<Array<{ id: string }>>('neo_users?select=id&limit=1000');
    return rows.length;
  }

  async createUser(user: NeoUserRecord): Promise<void> {
    await this.request('neo_users', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify([
        {
          id: user.id,
          email: user.email,
          password_hash: user.passwordHash,
          role: user.role,
          created_at: user.createdAt,
        },
      ]),
    });
  }

  async findUserByEmail(email: string): Promise<NeoUserRecord | null> {
    return this.findUser(`email=eq.${encodeURIComponent(email)}`);
  }

  async findUserById(id: string): Promise<NeoUserRecord | null> {
    return this.findUser(`id=eq.${encodeURIComponent(id)}`);
  }

  private async findUser(filter: string): Promise<NeoUserRecord | null> {
    const rows = await this.request<
      Array<{ id: string; email: string; password_hash: string; role: UserRole; created_at: string }>
    >(`neo_users?select=id,email,password_hash,role,created_at&${filter}&limit=1`);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      passwordHash: row.password_hash,
    };
  }

  // --- keys ---

  async putKey(userId: string, row: SealedKeyRow): Promise<void> {
    await this.request('neo_user_keys', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify([
        {
          user_id: userId,
          provider: row.provider,
          ciphertext: row.sealed.ciphertext,
          iv: row.sealed.iv,
          tag: row.sealed.tag,
          hint: row.hint,
          updated_at: row.updatedAt,
        },
      ]),
    });
  }

  async deleteKey(userId: string, provider: ProviderKeyId): Promise<void> {
    await this.request(
      `neo_user_keys?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${provider}`,
      { method: 'DELETE', prefer: 'return=minimal' },
    );
  }

  async listKeys(userId: string): Promise<SealedKeyRow[]> {
    const rows = await this.request<
      Array<{
        provider: ProviderKeyId;
        ciphertext: string;
        iv: string;
        tag: string;
        hint: string;
        updated_at: string;
      }>
    >(
      `neo_user_keys?select=provider,ciphertext,iv,tag,hint,updated_at&user_id=eq.${encodeURIComponent(userId)}`,
    );
    return rows.map((row) => ({
      provider: row.provider,
      sealed: { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag },
      hint: row.hint,
      updatedAt: row.updated_at,
    }));
  }

  // --- usage ---

  async recordUsage(record: UsageRecord): Promise<void> {
    await this.request('neo_usage', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify([
        {
          user_id: record.userId,
          at: record.at,
          provider: record.provider,
          model: record.model,
          input_tokens: record.inputTokens,
          output_tokens: record.outputTokens,
          cost_usd: record.costUsd,
          kind: record.kind,
        },
      ]),
    });
  }

  async usageTotals(userId: string, period: string): Promise<UsageTotals> {
    const rows = await this.request<
      Array<{
        at: string;
        provider: string;
        model: string;
        input_tokens: number;
        output_tokens: number;
        cost_usd: number | null;
        kind: string;
      }>
    >(
      `neo_usage?select=at,provider,model,input_tokens,output_tokens,cost_usd,kind&user_id=eq.${encodeURIComponent(userId)}&at=gte.${period}-01&limit=5000`,
    );
    return aggregate(
      period,
      rows.map((row) => ({
        userId,
        at: row.at,
        provider: row.provider as UsageRecord['provider'],
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        costUsd: row.cost_usd,
        kind: row.kind as UsageRecord['kind'],
      })),
    );
  }

  // --- agent tokens ---

  async createAgentToken(row: {
    id: string;
    userId: string;
    hash: string;
    label: string;
    hint: string;
    createdAt: string;
  }): Promise<void> {
    await this.request('neo_agent_tokens', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify([
        {
          id: row.id,
          user_id: row.userId,
          token_hash: row.hash,
          label: row.label,
          hint: row.hint,
          created_at: row.createdAt,
        },
      ]),
    });
  }

  async listAgentTokens(userId: string): Promise<AgentTokenSummary[]> {
    const rows = await this.request<
      Array<{ id: string; label: string; hint: string; created_at: string; last_used_at: string | null }>
    >(
      `neo_agent_tokens?select=id,label,hint,created_at,last_used_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at`,
    );
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      hint: row.hint,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  async deleteAgentToken(userId: string, id: string): Promise<boolean> {
    await this.request(
      `neo_agent_tokens?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', prefer: 'return=minimal' },
    );
    return true;
  }

  async resolveAgentToken(hash: string): Promise<{ userId: string } | null> {
    const rows = await this.request<Array<{ user_id: string }>>(
      `neo_agent_tokens?select=user_id&token_hash=eq.${encodeURIComponent(hash)}&limit=1`,
    );
    const row = rows[0];
    if (!row) return null;
    // Best effort: a failed stamp must not reject otherwise valid telemetry.
    void this.request(`neo_agent_tokens?token_hash=eq.${encodeURIComponent(hash)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => undefined);
    return { userId: row.user_id };
  }

  // --- fleet ---

  async upsertNode(userId: string, payload: TelemetryPayload, lastSeen: string): Promise<NeoNode> {
    await this.request('neo_nodes', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify([
        { user_id: userId, id: payload.id, last_seen: lastSeen, payload },
      ]),
    });
    return { ...payload, lastSeen, health: deriveHealth(payload, lastSeen) };
  }

  async listNodes(userId: string): Promise<NeoNode[]> {
    const rows = await this.request<Array<{ id: string; last_seen: string; payload: unknown }>>(
      `neo_nodes?select=id,last_seen,payload&user_id=eq.${encodeURIComponent(userId)}&order=id`,
    );
    return rows.flatMap((row) => {
      const node = hydrateRow(row);
      return node ? [node] : [];
    });
  }

  async getNode(userId: string, id: string): Promise<NeoNode | null> {
    const rows = await this.request<Array<{ id: string; last_seen: string; payload: unknown }>>(
      `neo_nodes?select=id,last_seen,payload&user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    const row = rows[0];
    return row ? hydrateRow(row) : null;
  }

  async deleteNode(userId: string, id: string): Promise<boolean> {
    await this.request(
      `neo_nodes?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', prefer: 'return=minimal' },
    );
    return true;
  }

  async appendEvent(userId: string, event: NeoEvent): Promise<void> {
    await this.request('neo_events', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify([
        {
          id: event.id,
          user_id: userId,
          at: event.at,
          level: event.level,
          source: event.source,
          message: event.message,
        },
      ]),
    });
  }

  async listEvents(userId: string, limit = 100): Promise<NeoEvent[]> {
    const rows = await this.request<
      Array<{ id: string; at: string; level: NeoEvent['level']; source: string; message: string }>
    >(
      `neo_events?select=id,at,level,source,message&user_id=eq.${encodeURIComponent(userId)}&order=at.desc&limit=${limit}`,
    );
    return rows.map((row) => ({
      id: row.id,
      at: row.at,
      level: row.level,
      source: row.source,
      message: row.message,
    }));
  }
}

/** Rows come from trusted agents, but one bad row must not take the fleet view down. */
function hydrateRow(row: { id: string; last_seen: string; payload: unknown }): NeoNode | null {
  const parsed = telemetryPayloadSchema.safeParse(row.payload);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    lastSeen: row.last_seen,
    health: deriveHealth(parsed.data, row.last_seen),
  };
}
