import { readSse, safeJsonParse } from '@/lib/ai/sse';

export class StreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'StreamError';
  }
}

/**
 * POSTs a JSON body and yields the decoded SSE events.
 *
 * EventSource cannot send a request body, so Neo's streaming endpoints are
 * plain POSTs that emit `text/event-stream` and are read with fetch here.
 */
export async function* postStream<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new StreamError(
      payload?.message ?? `Request failed with status ${response.status}.`,
      response.status,
    );
  }
  if (!response.body) throw new StreamError('The server returned no stream.', 500);

  for await (const message of readSse(response.body)) {
    if (message.data === '[DONE]') return;
    const event = safeJsonParse<T>(message.data);
    if (event) yield event;
  }
}
