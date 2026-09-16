import { describe, expect, it } from 'vitest';
import type { Credentials } from '@/lib/ai/credentials';
import { availableProviders, inferProvider, resolveModel } from '@/lib/ai/registry';

describe('inferProvider', () => {
  it('recognises each vendor by model id prefix', () => {
    expect(inferProvider('claude-sonnet-5')).toBe('anthropic');
    expect(inferProvider('gpt-4.1-mini')).toBe('openai');
    expect(inferProvider('gemini-2.5-flash')).toBe('google');
    expect(inferProvider('llama-3')).toBeNull();
  });
});

describe('availableProviders', () => {
  it('lists only providers the caller holds a key for', () => {
    const credentials: Credentials = { openai: 'sk-test', github: 'ghp-test' };
    expect(availableProviders(credentials).map((provider) => provider.id)).toEqual(['openai']);
  });
});

describe('resolveModel', () => {
  it('returns null when the account has no model key at all', () => {
    expect(resolveModel('anthropic:claude-sonnet-5', {})).toBeNull();
    expect(resolveModel(null, { github: 'ghp-test' })).toBeNull();
  });

  it('falls back to the first available provider and its default model', () => {
    const resolved = resolveModel(null, { openai: 'sk-test' });
    expect(resolved?.provider.id).toBe('openai');
    expect(resolved?.model).toBe('gpt-4.1-mini');
    expect(resolved?.apiKey).toBe('sk-test');
  });

  it('parses an explicit provider:model reference and carries its key', () => {
    const resolved = resolveModel('anthropic:claude-opus-5', { anthropic: 'sk-ant-test' });
    expect(resolved?.provider.id).toBe('anthropic');
    expect(resolved?.model).toBe('claude-opus-5');
    expect(resolved?.apiKey).toBe('sk-ant-test');
  });

  it('uses the provider default when only the provider is named', () => {
    expect(resolveModel('anthropic', { anthropic: 'k' })?.model).toBe('claude-sonnet-5');
  });

  it('refuses a provider the account has no key for rather than switching vendor silently', () => {
    expect(resolveModel('anthropic:claude-opus-5', { openai: 'sk-test' })).toBeNull();
  });

  it('infers the provider from a bare model id', () => {
    const resolved = resolveModel('gemini-2.5-pro', { openai: 'a', google: 'b' });
    expect(resolved?.provider.id).toBe('google');
    expect(resolved?.model).toBe('gemini-2.5-pro');
    expect(resolved?.apiKey).toBe('b');
  });
});
