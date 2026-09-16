/**
 * Central environment access.
 *
 * Every integration in Neo is optional. Reading configuration through this
 * module means a missing key degrades a single feature instead of crashing the
 * whole app, and the UI can show the operator exactly what is still unset.
 */

export type FeatureId =
  | 'core'
  | 'persistence'
  | 'signup'
  | 'sharedKeys'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'github';

export interface FeatureStatus {
  id: FeatureId;
  label: string;
  enabled: boolean;
  /** Env vars that switch this feature on. */
  envVars: string[];
  hint: string;
}

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readInt(name: string, fallback: number): number {
  const raw = read(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const env = {
  get sessionSecret(): string | undefined {
    return read('NEO_SESSION_SECRET');
  },

  /** Invite code required to create an account. Without it, signup is closed. */
  get signupCode(): string | undefined {
    return read('NEO_SIGNUP_CODE');
  },

  /**
   * When true, accounts without their own API key fall back to the
   * deployment's keys — the operator pays, so the monthly token quota applies.
   * When false (the default), every account must supply its own key.
   */
  get sharedKeys(): boolean {
    return read('NEO_SHARED_KEYS') === 'true';
  },

  /** Monthly token allowance per account while running on the shared keys. */
  get monthlyTokenLimit(): number {
    return readInt('NEO_MONTHLY_TOKEN_LIMIT', 200_000);
  },

  get anthropicKey(): string | undefined {
    return read('ANTHROPIC_API_KEY');
  },
  get openaiKey(): string | undefined {
    return read('OPENAI_API_KEY');
  },
  get googleKey(): string | undefined {
    return read('GOOGLE_GENERATIVE_AI_API_KEY');
  },
  get githubToken(): string | undefined {
    return read('GITHUB_TOKEN');
  },
  get githubOwner(): string | undefined {
    return read('GITHUB_OWNER');
  },

  get supabaseUrl(): string | undefined {
    return read('SUPABASE_URL');
  },
  get supabaseServiceKey(): string | undefined {
    return read('SUPABASE_SERVICE_ROLE_KEY');
  },

  get demoMode(): boolean {
    return read('NEO_DEMO_MODE') === 'true';
  },
} as const;

export function hasSharedKey(): boolean {
  return Boolean(env.anthropicKey || env.openaiKey || env.googleKey);
}

export function featureMatrix(): FeatureStatus[] {
  return [
    {
      id: 'core',
      label: 'Session signing',
      enabled: Boolean(env.sessionSecret && env.sessionSecret.length >= 32),
      envVars: ['NEO_SESSION_SECRET'],
      hint: 'At least 32 random characters. Also encrypts the API keys accounts store.',
    },
    {
      id: 'persistence',
      label: 'Database',
      enabled: Boolean(env.supabaseUrl && env.supabaseServiceKey),
      envVars: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      hint: 'Required for accounts to survive a restart. Apply supabase/schema.sql first.',
    },
    {
      id: 'signup',
      label: 'Account signup',
      enabled: Boolean(env.signupCode),
      envVars: ['NEO_SIGNUP_CODE'],
      hint: 'Invite code new accounts must present. Unset means nobody can sign up.',
    },
    {
      id: 'sharedKeys',
      label: 'Shared model keys',
      enabled: env.sharedKeys && hasSharedKey(),
      envVars: ['NEO_SHARED_KEYS', 'ANTHROPIC_API_KEY'],
      hint: 'On: accounts may use the deployment keys and you pay, capped by NEO_MONTHLY_TOKEN_LIMIT. Off: every account brings its own key.',
    },
    {
      id: 'anthropic',
      label: 'Anthropic (deployment key)',
      enabled: Boolean(env.anthropicKey),
      envVars: ['ANTHROPIC_API_KEY'],
      hint: 'Only used when shared keys are on, or by accounts with no key of their own.',
    },
    {
      id: 'openai',
      label: 'OpenAI (deployment key)',
      enabled: Boolean(env.openaiKey),
      envVars: ['OPENAI_API_KEY'],
      hint: 'Optional. Accounts can always supply their own instead.',
    },
    {
      id: 'google',
      label: 'Google Gemini (deployment key)',
      enabled: Boolean(env.googleKey),
      envVars: ['GOOGLE_GENERATIVE_AI_API_KEY'],
      hint: 'Optional, chat only — Gemini is not wired for tool calling.',
    },
    {
      id: 'github',
      label: 'GitHub (deployment token)',
      enabled: Boolean(env.githubToken),
      envVars: ['GITHUB_TOKEN'],
      hint: 'Optional fallback. Accounts can store their own token instead.',
    },
  ];
}
