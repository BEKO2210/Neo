import type { AgentTokenSummary, NeoUserRecord, ProviderKeyId, UsageTotals } from '@/lib/account/types';
import { deriveHealth } from '@/lib/telemetry/health';
import type { NeoEvent, NeoNode, TelemetryPayload } from '@/lib/telemetry/types';
import type { UsageRecord } from '@/lib/usage/pricing';
import type { NeoStore, SealedKeyRow } from './types';

const MAX_EVENTS_PER_USER = 500;

interface AgentTokenRow {
  id: string;
  userId: string;
  hash: string;
  label: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Process-local store. Correct for local development and a single always-on
 * container; on serverless it resets whenever the instance is recycled, which
 * is why Neo shows the active store kind in the UI and refuses to pretend
 * accounts are durable without a database.
 */
export class MemoryStore implements NeoStore {
  readonly kind = 'memory' as const;

  private users = new Map<string, NeoUserRecord>();
  private usersByEmail = new Map<string, string>();
  private keys = new Map<string, Map<ProviderKeyId, SealedKeyRow>>();
  private usage: UsageRecord[] = [];
  private agentTokens = new Map<string, AgentTokenRow>();
  private nodes = new Map<string, Map<string, { payload: TelemetryPayload; lastSeen: string }>>();
  private events = new Map<string, NeoEvent[]>();

  // --- accounts ---

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async createUser(user: NeoUserRecord): Promise<void> {
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user.id);
  }

  async findUserByEmail(email: string): Promise<NeoUserRecord | null> {
    const id = this.usersByEmail.get(email);
    return id ? (this.users.get(id) ?? null) : null;
  }

  async findUserById(id: string): Promise<NeoUserRecord | null> {
    return this.users.get(id) ?? null;
  }

  // --- keys ---

  async putKey(userId: string, row: SealedKeyRow): Promise<void> {
    const forUser = this.keys.get(userId) ?? new Map<ProviderKeyId, SealedKeyRow>();
    forUser.set(row.provider, row);
    this.keys.set(userId, forUser);
  }

  async deleteKey(userId: string, provider: ProviderKeyId): Promise<void> {
    this.keys.get(userId)?.delete(provider);
  }

  async listKeys(userId: string): Promise<SealedKeyRow[]> {
    return [...(this.keys.get(userId)?.values() ?? [])];
  }

  // --- usage ---

  async recordUsage(record: UsageRecord): Promise<void> {
    this.usage.push(record);
  }

  async usageTotals(userId: string, period: string): Promise<UsageTotals> {
    const rows = this.usage.filter(
      (row) => row.userId === userId && row.at.startsWith(period),
    );
    return aggregate(period, rows);
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
    this.agentTokens.set(row.hash, { ...row, lastUsedAt: null });
  }

  async listAgentTokens(userId: string): Promise<AgentTokenSummary[]> {
    return [...this.agentTokens.values()]
      .filter((row) => row.userId === userId)
      .map(({ id, label, hint, createdAt, lastUsedAt }) => ({ id, label, hint, createdAt, lastUsedAt }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async deleteAgentToken(userId: string, id: string): Promise<boolean> {
    for (const [hash, row] of this.agentTokens) {
      if (row.userId === userId && row.id === id) {
        this.agentTokens.delete(hash);
        return true;
      }
    }
    return false;
  }

  async resolveAgentToken(hash: string): Promise<{ userId: string } | null> {
    const row = this.agentTokens.get(hash);
    if (!row) return null;
    row.lastUsedAt = new Date().toISOString();
    return { userId: row.userId };
  }

  // --- fleet ---

  async upsertNode(userId: string, payload: TelemetryPayload, lastSeen: string): Promise<NeoNode> {
    const forUser = this.nodes.get(userId) ?? new Map();
    forUser.set(payload.id, { payload, lastSeen });
    this.nodes.set(userId, forUser);
    return hydrate(payload, lastSeen);
  }

  async listNodes(userId: string): Promise<NeoNode[]> {
    return [...(this.nodes.get(userId)?.values() ?? [])]
      .map((entry) => hydrate(entry.payload, entry.lastSeen))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getNode(userId: string, id: string): Promise<NeoNode | null> {
    const entry = this.nodes.get(userId)?.get(id);
    return entry ? hydrate(entry.payload, entry.lastSeen) : null;
  }

  async deleteNode(userId: string, id: string): Promise<boolean> {
    return this.nodes.get(userId)?.delete(id) ?? false;
  }

  async appendEvent(userId: string, event: NeoEvent): Promise<void> {
    const list = this.events.get(userId) ?? [];
    list.unshift(event);
    if (list.length > MAX_EVENTS_PER_USER) list.length = MAX_EVENTS_PER_USER;
    this.events.set(userId, list);
  }

  async listEvents(userId: string, limit = 100): Promise<NeoEvent[]> {
    return (this.events.get(userId) ?? []).slice(0, limit);
  }
}

function hydrate(payload: TelemetryPayload, lastSeen: string): NeoNode {
  return { ...payload, lastSeen, health: deriveHealth(payload, lastSeen) };
}

export function aggregate(period: string, rows: UsageRecord[]): UsageTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let priced = true;

  for (const row of rows) {
    inputTokens += row.inputTokens;
    outputTokens += row.outputTokens;
    if (row.costUsd === null) priced = false;
    else costUsd += row.costUsd;
  }

  return {
    period,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    // A single unpriced model makes the total a floor, not a figure — report null.
    costUsd: rows.length > 0 && priced ? Math.round(costUsd * 1_000_000) / 1_000_000 : null,
    calls: rows.length,
  };
}
