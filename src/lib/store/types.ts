import type { AgentTokenSummary, NeoUserRecord, ProviderKeyId, StoredKey, UsageTotals, UserRole } from '@/lib/account/types';
import type { SealedSecret } from '@/lib/crypto/secrets';
import type { UsageRecord } from '@/lib/usage/pricing';
import type { NeoEvent, NeoNode, TelemetryPayload } from '@/lib/telemetry/types';

export interface SealedKeyRow {
  provider: ProviderKeyId;
  sealed: SealedSecret;
  hint: string;
  updatedAt: string;
}

/**
 * Everything Neo persists, behind one interface.
 *
 * Every method that touches user data takes a userId: isolation is enforced
 * here rather than remembered at each call site.
 */
export interface NeoStore {
  readonly kind: 'memory' | 'supabase';

  // --- accounts ---
  countUsers(): Promise<number>;
  createUser(user: NeoUserRecord): Promise<void>;
  findUserByEmail(email: string): Promise<NeoUserRecord | null>;
  findUserById(id: string): Promise<NeoUserRecord | null>;

  // --- per-user API keys ---
  putKey(userId: string, row: SealedKeyRow): Promise<void>;
  deleteKey(userId: string, provider: ProviderKeyId): Promise<void>;
  listKeys(userId: string): Promise<SealedKeyRow[]>;

  // --- usage ---
  recordUsage(record: UsageRecord): Promise<void>;
  usageTotals(userId: string, period: string): Promise<UsageTotals>;

  // --- agent tokens ---
  createAgentToken(row: {
    id: string;
    userId: string;
    hash: string;
    label: string;
    hint: string;
    createdAt: string;
  }): Promise<void>;
  listAgentTokens(userId: string): Promise<AgentTokenSummary[]>;
  deleteAgentToken(userId: string, id: string): Promise<boolean>;
  /** Resolves an ingest token to its owner, and stamps last use. */
  resolveAgentToken(hash: string): Promise<{ userId: string } | null>;

  // --- fleet, scoped to one account ---
  upsertNode(userId: string, payload: TelemetryPayload, lastSeen: string): Promise<NeoNode>;
  listNodes(userId: string): Promise<NeoNode[]>;
  getNode(userId: string, id: string): Promise<NeoNode | null>;
  deleteNode(userId: string, id: string): Promise<boolean>;
  appendEvent(userId: string, event: NeoEvent): Promise<void>;
  listEvents(userId: string, limit?: number): Promise<NeoEvent[]>;
}

export type { StoredKey, UserRole };
