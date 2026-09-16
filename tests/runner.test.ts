import { describe, expect, it, vi } from 'vitest';
import { runConversation, type RunEvent } from '@/lib/ai/runner';
import * as tools from '@/lib/ai/tools';
import { userText, type CompletionRequest, type Provider, type StreamEvent } from '@/lib/ai/types';

/** A provider whose turns are scripted, so the loop itself is what is under test. */
function scriptedProvider(turns: StreamEvent[][], supportsTools = true): Provider {
  let turn = 0;
  const seen: CompletionRequest[] = [];
  const provider: Provider & { seen: CompletionRequest[] } = {
    id: 'anthropic',
    label: 'scripted',
    supportsTools,
    defaultModel: 'scripted',
    seen,
    knownModels: () => [],
    listModels: async () => [],
    async *stream(request) {
      seen.push(request);
      const script = turns[turn] ?? [{ type: 'done', stopReason: 'end' }];
      turn += 1;
      for (const event of script) yield event;
    },
  };
  return provider;
}

async function drain(source: AsyncGenerator<RunEvent>): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}

const base = {
  apiKey: 'test-key',
  model: 'scripted',
  system: 'you are a test',
  messages: [userText('how is the fleet?')],
  toolContext: { userId: 'alice', credentials: {} },
};

describe('runConversation', () => {
  it('executes a requested tool and feeds the result back for a second turn', async () => {
    const runTool = vi
      .spyOn(tools, 'runTool')
      .mockResolvedValue({ output: 'Fleet: 1 node, healthy', isError: false });

    const provider = scriptedProvider([
      [
        { type: 'text', delta: 'Let me look.' },
        { type: 'tool_call', call: { id: 'c1', name: 'fleet_status', input: {} } },
        { type: 'done', stopReason: 'tool_use' },
      ],
      [{ type: 'text', delta: 'One node, healthy.' }, { type: 'done', stopReason: 'end' }],
    ]);

    const events = await drain(runConversation({ provider, ...base }));

    expect(runTool).toHaveBeenCalledWith('fleet_status', {}, base.toolContext);
    expect(events.map((event) => event.type)).toEqual([
      'text',
      'tool_start',
      'tool_end',
      'text',
      'final',
    ]);

    const final = events.at(-1);
    expect(final?.type === 'final' && final.text).toBe('One node, healthy.');

    // The tool result must be handed back as a user turn on the follow-up call.
    const secondRequest = (provider as unknown as { seen: CompletionRequest[] }).seen[1];
    expect(secondRequest?.messages.at(-1)).toEqual({
      role: 'user',
      parts: [
        {
          type: 'tool_result',
          toolCallId: 'c1',
          name: 'fleet_status',
          output: 'Fleet: 1 node, healthy',
          isError: false,
        },
      ],
    });
  });

  it('stops after maxSteps so a model that only ever calls tools cannot loop forever', async () => {
    vi.spyOn(tools, 'runTool').mockResolvedValue({ output: 'again', isError: false });
    const loop: StreamEvent[] = [
      { type: 'tool_call', call: { id: 'c', name: 'fleet_status', input: {} } },
      { type: 'done', stopReason: 'tool_use' },
    ];
    const provider = scriptedProvider([loop, loop, loop, loop, loop, loop, loop, loop]);

    const events = await drain(runConversation({ provider, ...base, maxSteps: 3 }));

    expect(events.filter((event) => event.type === 'tool_start')).toHaveLength(3);
    expect(events.at(-1)?.type).toBe('final');
  });

  it('surfaces a provider failure as an error event and still finishes cleanly', async () => {
    const provider: Provider = {
      id: 'anthropic',
      label: 'broken',
      supportsTools: true,
      defaultModel: 'scripted',
      knownModels: () => [],
      listModels: async () => [],
      async *stream() {
        throw new Error('upstream exploded');
      },
    };

    const events = await drain(runConversation({ provider, ...base }));
    expect(events[0]).toEqual({ type: 'error', message: 'upstream exploded' });
    expect(events.at(-1)?.type).toBe('final');
  });

  it('never sends tool definitions to a provider that cannot use them', async () => {
    const provider = scriptedProvider(
      [[{ type: 'text', delta: 'plain answer' }, { type: 'done', stopReason: 'end' }]],
      false,
    );
    await drain(runConversation({ provider, ...base }));
    expect((provider as unknown as { seen: CompletionRequest[] }).seen[0]?.tools).toBeUndefined();
  });
});
