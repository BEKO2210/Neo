import type { NeoEvent, NeoNode, TelemetryPayload } from '@/lib/telemetry/types';

export interface NeoStore {
  readonly kind: 'memory' | 'supabase';
  upsertNode(payload: TelemetryPayload, lastSeen: string): Promise<NeoNode>;
  listNodes(): Promise<NeoNode[]>;
  getNode(id: string): Promise<NeoNode | null>;
  deleteNode(id: string): Promise<boolean>;
  appendEvent(event: NeoEvent): Promise<void>;
  listEvents(limit?: number): Promise<NeoEvent[]>;
}
