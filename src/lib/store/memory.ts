import { deriveHealth } from '@/lib/telemetry/health';
import type { NeoEvent, NeoNode, TelemetryPayload } from '@/lib/telemetry/types';
import type { NeoStore } from './types';

const MAX_EVENTS = 500;

/**
 * Process-local store. Perfect for a single container or local development;
 * on serverless platforms it resets whenever the instance is recycled, which is
 * why Neo surfaces the active store kind in the UI.
 */
export class MemoryStore implements NeoStore {
  readonly kind = 'memory' as const;

  private nodes = new Map<string, { payload: TelemetryPayload; lastSeen: string }>();
  private events: NeoEvent[] = [];

  async upsertNode(payload: TelemetryPayload, lastSeen: string): Promise<NeoNode> {
    this.nodes.set(payload.id, { payload, lastSeen });
    return this.hydrate(payload, lastSeen);
  }

  async listNodes(): Promise<NeoNode[]> {
    return [...this.nodes.values()]
      .map((entry) => this.hydrate(entry.payload, entry.lastSeen))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getNode(id: string): Promise<NeoNode | null> {
    const entry = this.nodes.get(id);
    return entry ? this.hydrate(entry.payload, entry.lastSeen) : null;
  }

  async deleteNode(id: string): Promise<boolean> {
    return this.nodes.delete(id);
  }

  async appendEvent(event: NeoEvent): Promise<void> {
    this.events.unshift(event);
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
  }

  async listEvents(limit = 100): Promise<NeoEvent[]> {
    return this.events.slice(0, limit);
  }

  private hydrate(payload: TelemetryPayload, lastSeen: string): NeoNode {
    return { ...payload, lastSeen, health: deriveHealth(payload, lastSeen) };
  }
}
