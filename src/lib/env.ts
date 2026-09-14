/**
 * Central environment access.
 *
 * Every integration in Neo is optional. Reading configuration through this
 * module means a missing key degrades a single feature instead of crashing the
 * whole app, and the UI can show the operator exactly what is still unset.
 */

export type FeatureId =
  | 'auth'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'github'
  | 'telemetry'
  | 'persistence';

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

export const env = {
  get sessionSecret(): string | undefined {
    return read('NEO_SESSION_SECRET');
  },
  get accessPassword(): string | undefined {
    return read('NEO_ACCESS_PASSWORD');
  },
  get operatorName(): string {
    return read('NEO_OPERATOR_NAME') ?? 'Operator';
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
  get agentToken(): string | undefined {
    return read('NEO_AGENT_TOKEN');
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

export function featureMatrix(): FeatureStatus[] {
  return [
    {
      id: 'auth',
      label: 'Access control',
      enabled: Boolean(env.accessPassword && env.sessionSecret),
      envVars: ['NEO_ACCESS_PASSWORD', 'NEO_SESSION_SECRET'],
      hint: 'Without both values Neo refuses every request. Set them before deploying.',
    },
    {
      id: 'anthropic',
      label: 'Anthropic models',
      enabled: Boolean(env.anthropicKey),
      envVars: ['ANTHROPIC_API_KEY'],
      hint: 'Enables Claude models for chat and agent roles.',
    },
    {
      id: 'openai',
      label: 'OpenAI models',
      enabled: Boolean(env.openaiKey),
      envVars: ['OPENAI_API_KEY'],
      hint: 'Enables GPT models for chat and agent roles.',
    },
    {
      id: 'google',
      label: 'Google models',
      enabled: Boolean(env.googleKey),
      envVars: ['GOOGLE_GENERATIVE_AI_API_KEY'],
      hint: 'Enables Gemini models for chat (text only, no tool calling).',
    },
    {
      id: 'github',
      label: 'GitHub control',
      enabled: Boolean(env.githubToken),
      envVars: ['GITHUB_TOKEN'],
      hint: 'A fine-grained token with read access to the repositories you want to watch.',
    },
    {
      id: 'telemetry',
      label: 'Device telemetry',
      enabled: Boolean(env.agentToken),
      envVars: ['NEO_AGENT_TOKEN'],
      hint: 'Shared secret used by agent/neo_agent.py to push machine metrics.',
    },
    {
      id: 'persistence',
      label: 'Durable storage',
      enabled: Boolean(env.supabaseUrl && env.supabaseServiceKey),
      envVars: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      hint: 'Optional. Without it Neo keeps state in memory and loses it on restart.',
    },
  ];
}
