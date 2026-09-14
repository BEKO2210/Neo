import { env } from '@/lib/env';
import { MemoryStore } from './memory';
import { SupabaseStore } from './supabase';
import type { NeoStore } from './types';

declare global {
  var __neoStore: NeoStore | undefined;
}

/**
 * Returns the active store. Cached on globalThis so Next.js hot reloads and
 * repeated route invocations inside one instance keep the same in-memory fleet.
 */
export function getStore(): NeoStore {
  if (globalThis.__neoStore) return globalThis.__neoStore;

  const store: NeoStore =
    env.supabaseUrl && env.supabaseServiceKey
      ? new SupabaseStore(env.supabaseUrl, env.supabaseServiceKey)
      : new MemoryStore();

  globalThis.__neoStore = store;
  return store;
}

export type { NeoStore };
