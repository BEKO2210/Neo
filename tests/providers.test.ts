import { describe, expect, it } from 'vitest';
import { toAnthropicMessages } from '@/lib/ai/anthropic';
import { toOpenAiMessages } from '@/lib/ai/openai';
import { toGoogleContents } from '@/lib/ai/google';
import { describeUpstreamError, type ChatMessage } from '@/lib/ai/types';

const conversation: ChatMessage[] = [
  { role: 'user', parts: [{ type: 'text', text: 'how is core-01?' }] },
  {
    role: 'assistant',
    parts: [
      { type: 'text', text: 'checking' },
      { type: 'tool_call', id: 'call_1', name: 'node_detail', input: { id: 'core-01' } },
    ],
  },
  {
    role: 'user',
    parts: [
      { type: 'tool_result', toolCallId: 'call_1', name: 'node_detail', output: 'health=healthy' },
    ],
  },
];

describe('toAnthropicMessages', () => {
  it('maps tool calls and results onto Anthropic content blocks', () => {
    const mapped = toAnthropicMessages(conversation);
    expect(mapped[1]?.content[1]).toEqual({
      type: 'tool_use',
      id: 'call_1',
      name: 'node_detail',
      input: { id: 'core-01' },
    });
    expect(mapped[2]?.content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'call_1',
      content: 'health=healthy',
      is_error: false,
    });
  });
});

describe('toOpenAiMessages', () => {
  it('flattens tool results into standalone tool messages', () => {
    const mapped = toOpenAiMessages(conversation);
    expect(mapped[0]).toEqual({ role: 'user', content: 'how is core-01?' });
    expect(mapped[1]?.role).toBe('assistant');
    expect(mapped[1]?.tool_calls?.[0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: { name: 'node_detail', arguments: '{"id":"core-01"}' },
    });
    expect(mapped[2]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: 'health=healthy',
    });
  });

  it('places the tool result before any user text in the same turn', () => {
    const mixed: ChatMessage[] = [
      {
        role: 'user',
        parts: [
          { type: 'tool_result', toolCallId: 'c1', name: 't', output: 'ok' },
          { type: 'text', text: 'and now?' },
        ],
      },
    ];
    const mapped = toOpenAiMessages(mixed);
    expect(mapped.map((message) => message.role)).toEqual(['tool', 'user']);
  });

  it('drops assistant turns that carry neither text nor tool calls', () => {
    expect(toOpenAiMessages([{ role: 'assistant', parts: [] }])).toEqual([]);
  });
});

describe('toGoogleContents', () => {
  it('renames assistant to model and drops empty turns', () => {
    const mapped = toGoogleContents(conversation);
    expect(mapped).toEqual([
      { role: 'user', parts: [{ text: 'how is core-01?' }] },
      { role: 'model', parts: [{ text: 'checking' }] },
    ]);
  });
});

describe('describeUpstreamError', () => {
  it('explains an auth failure in terms of the missing key', () => {
    const message = describeUpstreamError('openai', 401, '{"error":{"message":"Invalid key"}}');
    expect(message).toContain('authentication failed');
    expect(message).toContain('Invalid key');
  });

  it('points at the model id on a 404', () => {
    expect(describeUpstreamError('anthropic', 404, 'no such model')).toContain('model or endpoint not found');
  });

  it('survives a non-JSON body', () => {
    expect(describeUpstreamError('google', 500, '<html>gateway</html>')).toContain('500');
  });
});
