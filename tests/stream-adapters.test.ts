import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '@/lib/ai/anthropic';
import { OpenAiProvider } from '@/lib/ai/openai';
import { GoogleProvider } from '@/lib/ai/google';
import { userText, type StreamEvent } from '@/lib/ai/types';

const realFetch = globalThis.fetch;

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // Split mid-frame to prove the parser survives arbitrary chunking.
      const raw = frames.join('');
      for (let i = 0; i < raw.length; i += 17) {
        controller.enqueue(encoder.encode(raw.slice(i, i + 17)));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function stubFetch(response: Response) {
  const spy = vi.fn(async () => response);
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

async function drain(source: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.OPENAI_API_KEY = 'test';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  vi.restoreAllMocks();
});

describe('AnthropicProvider.stream', () => {
  it('emits text deltas and assembles a tool call from partial JSON fragments', async () => {
    stubFetch(
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"m1"}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Checking "}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"the fleet."}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"node_detail"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"id\\":"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"core-01\\"}"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":42}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    );

    const events = await drain(
      new AnthropicProvider().stream({ model: 'claude-sonnet-5', messages: [userText('hi')] }),
    );

    const text = events
      .filter((event) => event.type === 'text')
      .map((event) => (event.type === 'text' ? event.delta : ''))
      .join('');
    expect(text).toBe('Checking the fleet.');

    const call = events.find((event) => event.type === 'tool_call');
    expect(call).toEqual({
      type: 'tool_call',
      call: { id: 'toolu_1', name: 'node_detail', input: { id: 'core-01' } },
    });

    expect(events.find((event) => event.type === 'usage')).toEqual({
      type: 'usage',
      usage: { inputTokens: null, outputTokens: 42 },
    });
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: null });
  });

  it('turns a non-200 response into a ProviderError that names the cause', async () => {
    stubFetch(new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 }));
    await expect(
      drain(new AnthropicProvider().stream({ model: 'claude-sonnet-5', messages: [userText('hi')] })),
    ).rejects.toThrow(/authentication failed/i);
  });
});

describe('OpenAiProvider.stream', () => {
  it('reassembles tool calls spread across indexed fragments', async () => {
    stubFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Looking"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{"content":" it up."},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"fleet_status","arguments":"{"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":5}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const events = await drain(
      new OpenAiProvider().stream({ model: 'gpt-4.1-mini', messages: [userText('hi')] }),
    );

    expect(
      events
        .filter((event) => event.type === 'text')
        .map((event) => (event.type === 'text' ? event.delta : ''))
        .join(''),
    ).toBe('Looking it up.');
    expect(events.find((event) => event.type === 'tool_call')).toEqual({
      type: 'tool_call',
      call: { id: 'call_a', name: 'fleet_status', input: {} },
    });
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'tool_calls' });
  });
});

describe('GoogleProvider.stream', () => {
  it('reads text parts and the finish reason', async () => {
    stubFetch(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"All "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"quiet."}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":3}}\n\n',
      ]),
    );

    const events = await drain(
      new GoogleProvider().stream({ model: 'gemini-2.5-flash', messages: [userText('hi')] }),
    );

    expect(
      events
        .filter((event) => event.type === 'text')
        .map((event) => (event.type === 'text' ? event.delta : ''))
        .join(''),
    ).toBe('All quiet.');
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'STOP' });
  });
});
