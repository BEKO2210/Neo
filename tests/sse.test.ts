import { describe, expect, it } from 'vitest';
import { parseChunk, readSse, safeJsonParse } from '@/lib/ai/sse';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const messages = [];
  for await (const message of readSse(stream)) messages.push(message);
  return messages;
}

describe('parseChunk', () => {
  it('reads the event name and data', () => {
    expect(parseChunk('event: ping\ndata: {"a":1}')).toEqual({ event: 'ping', data: '{"a":1}' });
  });

  it('joins multi-line data fields', () => {
    expect(parseChunk('data: one\ndata: two')?.data).toBe('one\ntwo');
  });

  it('ignores comment lines', () => {
    expect(parseChunk(': keep-alive')).toBeNull();
  });

  it('keeps a data value that itself contains a colon', () => {
    expect(parseChunk('data: http://example.com')?.data).toBe('http://example.com');
  });
});

describe('readSse', () => {
  it('splits messages on blank lines', async () => {
    const messages = await collect(streamOf('data: a\n\ndata: b\n\n'));
    expect(messages.map((message) => message.data)).toEqual(['a', 'b']);
  });

  it('reassembles a message split across network chunks', async () => {
    const messages = await collect(streamOf('data: {"hel', 'lo":true}\n\n'));
    expect(messages[0]?.data).toBe('{"hello":true}');
  });

  it('handles CRLF framing', async () => {
    const messages = await collect(streamOf('data: a\r\n\r\ndata: b\r\n\r\n'));
    expect(messages.map((message) => message.data)).toEqual(['a', 'b']);
  });

  it('emits a trailing message that never got its blank line', async () => {
    const messages = await collect(streamOf('data: last'));
    expect(messages[0]?.data).toBe('last');
  });
});

describe('safeJsonParse', () => {
  it('returns null instead of throwing on malformed JSON', () => {
    expect(safeJsonParse('{oops')).toBeNull();
    expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
});
