/**
 * Wraps an async generator of JSON-serialisable events into an SSE response.
 *
 * Heartbeat comments keep proxies from closing an idle stream while a slow tool
 * call is in flight, and the generator is always returned so upstream fetches
 * are aborted when the client disconnects.
 */
export function sseResponse<T>(
  source: AsyncGenerator<T>,
  options: { heartbeatMs?: number } = {},
): Response {
  const encoder = new TextEncoder();
  const heartbeatMs = options.heartbeatMs ?? 15_000;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          closed = true;
        }
      }, heartbeatMs);

      try {
        for await (const event of source) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`),
        );
      } finally {
        closed = true;
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
    async cancel() {
      await source.return?.(undefined as never);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
