import { runTool, toolDefinitions } from './tools';
import type { Provider } from './types';
import type { ChatMessage, MessagePart, ToolCall, Usage } from './types';

export type RunEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; call: ToolCall }
  | { type: 'tool_end'; callId: string; name: string; output: string; isError: boolean }
  | { type: 'usage'; usage: Usage }
  | { type: 'error'; message: string }
  | { type: 'final'; text: string; messages: ChatMessage[] };

export interface RunOptions {
  provider: Provider;
  model: string;
  system: string;
  messages: ChatMessage[];
  toolNames?: string[];
  /** Hard stop on tool round-trips so a confused model cannot loop forever. */
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Drives one model turn to completion, executing any tools it asks for and
 * feeding the results back until the model answers in plain text.
 *
 * Providers that do not support tool calling simply never emit tool events, so
 * the same loop works for all of them.
 */
export async function* runConversation(options: RunOptions): AsyncGenerator<RunEvent> {
  const {
    provider,
    model,
    system,
    toolNames,
    maxSteps = 6,
    maxTokens,
    temperature,
    signal,
  } = options;

  const messages: ChatMessage[] = options.messages.map((message) => ({
    role: message.role,
    parts: [...message.parts],
  }));
  const tools = provider.supportsTools ? toolDefinitions(toolNames) : undefined;

  let lastText = '';

  for (let step = 0; step < maxSteps; step += 1) {
    const assistantParts: MessagePart[] = [];
    const calls: ToolCall[] = [];
    let stepText = '';
    let failed = false;

    try {
      for await (const event of provider.stream({
        model,
        system,
        // Snapshot: the loop keeps appending to `messages` between steps and a
        // provider must never observe a turn that arrived after its request.
        messages: [...messages],
        tools,
        maxTokens,
        temperature,
        signal,
      })) {
        if (event.type === 'text') {
          stepText += event.delta;
          yield { type: 'text', delta: event.delta };
        } else if (event.type === 'tool_call') {
          calls.push(event.call);
        } else if (event.type === 'usage') {
          yield { type: 'usage', usage: event.usage };
        } else if (event.type === 'error') {
          failed = true;
          yield { type: 'error', message: event.message };
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield { type: 'error', message };
      yield { type: 'final', text: lastText, messages };
      return;
    }

    if (stepText) {
      assistantParts.push({ type: 'text', text: stepText });
      lastText = stepText;
    }
    for (const call of calls) {
      assistantParts.push({ type: 'tool_call', id: call.id, name: call.name, input: call.input });
    }
    if (assistantParts.length > 0) {
      messages.push({ role: 'assistant', parts: assistantParts });
    }

    if (failed || calls.length === 0) break;

    const resultParts: MessagePart[] = [];
    for (const call of calls) {
      yield { type: 'tool_start', call };
      const result = await runTool(call.name, call.input, signal);
      yield {
        type: 'tool_end',
        callId: call.id,
        name: call.name,
        output: result.output,
        isError: result.isError,
      };
      resultParts.push({
        type: 'tool_result',
        toolCallId: call.id,
        name: call.name,
        output: result.output,
        isError: result.isError,
      });
    }
    messages.push({ role: 'user', parts: resultParts });
  }

  yield { type: 'final', text: lastText, messages };
}
