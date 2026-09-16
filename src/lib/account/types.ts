import { z } from 'zod';

export const providerKeyIds = ['anthropic', 'openai', 'google', 'github'] as const;
export type ProviderKeyId = (typeof providerKeyIds)[number];

export type UserRole = 'owner' | 'member';

export interface NeoUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

/** A user row including the hash. Never leaves the server. */
export interface NeoUserRecord extends NeoUser {
  passwordHash: string;
}

export interface StoredKey {
  provider: ProviderKeyId;
  /** Masked tail, e.g. "••••x9fA". The key itself is never sent to a client. */
  hint: string;
  updatedAt: string;
}

export interface AgentTokenSummary {
  id: string;
  label: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface UsageTotals {
  /** Calendar month the totals cover, as YYYY-MM. */
  period: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  calls: number;
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .regex(/^[^@\s]+@[^@\s.]+\.[^@\s]+$/, 'Enter a valid email address.');

export const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
  inviteCode: z.string().min(1).max(200),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const keySchema = z.object({
  provider: z.enum(providerKeyIds),
  // A cleared field removes the stored key.
  value: z.string().max(400),
});
