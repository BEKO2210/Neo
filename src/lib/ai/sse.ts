/**
 * Minimal Server-Sent-Events reader.
 *
 * All three upstream providers speak SSE but frame it slightly differently
 * (OpenAI sends a `[DONE]` sentinel, Anthropic sends named events, Google sends
 * bare data lines), so the parser yields raw `{ event, data }` pairs and lets
 * each adapter decide what they mean.
 */
export interface SseMessage {
  event: string | null;
  data: string;
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator = findSeparator(buffer);
      while (separator) {
        const chunk = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator.length);
        const message = parseChunk(chunk);
        if (message) yield message;
        separator = findSeparator(buffer);
      }
    }
    const tail = parseChunk(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function findSeparator(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1 && crlf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
  return { index: lf, length: 2 };
}

export function parseChunk(chunk: string): SseMessage | null {
  const lines = chunk.split(/\r?\n/);
  let event: string | null = null;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':') || line.trim() === '') continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const rawValue = colon === -1 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/** Parses JSON without throwing; malformed frames are skipped rather than fatal. */
export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
