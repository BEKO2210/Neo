import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inferProvider, resolveModel } from '@/lib/ai/registry';

const KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('inferProvider', () => {
  it('recognises each vendor by model id prefix', () => {
    expect(inferProvider('claude-sonnet-5')).toBe('anthropic');
    expect(inferProvider('gpt-4.1-mini')).toBe('openai');
    expect(inferProvider('gemini-2.5-flash')).toBe('google');
    expect(inferProvider('llama-3')).toBeNull();
  });
});

describe('resolveModel', () => {
  it('returns null when no provider key is configured', () => {
    expect(resolveModel('anthropic:claude-sonnet-5')).toBeNull();
  });

  it('falls back to the first configured provider and its default model', () => {
    process.env.OPENAI_API_KEY = 'test';
    const resolved = resolveModel(null);
    expect(resolved?.provider.id).toBe('openai');
    expect(resolved?.model).toBe('gpt-4.1-mini');
  });

  it('parses an explicit provider:model reference', () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const resolved = resolveModel('anthropic:claude-opus-5');
    expect(resolved?.provider.id).toBe('anthropic');
    expect(resolved?.model).toBe('claude-opus-5');
  });

  it('uses the provider default when only the provider is named', () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    expect(resolveModel('anthropic')?.model).toBe('claude-sonnet-5');
  });

  it('refuses a provider whose key is missing rather than silently switching vendor', () => {
    process.env.OPENAI_API_KEY = 'test';
    expect(resolveModel('anthropic:claude-opus-5')).toBeNull();
  });

  it('infers the provider from a bare model id', () => {
    process.env.OPENAI_API_KEY = 'test';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test';
    const resolved = resolveModel('gemini-2.5-pro');
    expect(resolved?.provider.id).toBe('google');
    expect(resolved?.model).toBe('gemini-2.5-pro');
  });
});
