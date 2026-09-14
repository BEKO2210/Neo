import { env } from '@/lib/env';
import { readSse, safeJsonParse } from './sse';
import {
  ProviderError,
  describeUpstreamError,
  type ChatMessage,
  type CompletionRequest,
  type ModelInfo,
  type Provider,
  type StreamEvent,
} from './types';

const API_BASE = 'https://api.openai.com/v1';

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

/**
 * Flattens Neo's block messages into the OpenAI chat shape: tool results become
 * standalone `role: "tool"` messages that must directly follow the assistant
 * message that requested them.
 */
export function toOpenAiMessages(messages: ChatMessage[]): OpenAiMessage[] {
  const result: OpenAiMessage[] = [];

  for (const message of messages) {
    const text = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n');
    const toolCalls = message.parts.filter((part) => part.type === 'tool_call');
    const toolResults = message.parts.filter((part) => part.type === 'tool_result');

    if (message.role === 'assistant') {
      if (text || toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length > 0
            ? {
                tool_calls: toolCalls.map((part) =>
                  part.type === 'tool_call'
                    ? {
                        id: part.id,
                        type: 'function' as const,
                        function: { name: part.name, arguments: JSON.stringify(part.input) },
                      }
                    : { id: '', type: 'function' as const, function: { name: '', arguments: '{}' } },
                ),
              }
            : {}),
        });
      }
      continue;
    }

    for (const part of toolResults) {
      if (part.type !== 'tool_result') continue;
      result.push({ role: 'tool', tool_call_id: part.toolCallId, content: part.output });
    }
    if (text) result.push({ role: 'user', content: text });
  }

  return result;
}

export class OpenAiProvider implements Provider {
  readonly id = 'openai' as const;
  readonly label = 'OpenAI';
  readonly supportsTools = true;
  readonly defaultModel = 'gpt-4.1-mini';

  isConfigured(): boolean {
    return Boolean(env.openaiKey);
  }

  knownModels(): ModelInfo[] {
    return [
      { id: 'gpt-4.1', label: 'GPT-4.1', provider: this.id },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', provider: this.id },
      { id: 'gpt-4o', label: 'GPT-4o', provider: this.id },
    ];
  }

  /**
   * OpenAI ships new model ids often, so Neo asks the account which models it
   * can actually use instead of shipping a list that goes stale.
   */
  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const key = env.openaiKey;
    if (!key) return [];
    const response = await fetch(`${API_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal,
      cache: 'no-store',
    });
    if (!response.ok) return this.knownModels();
    const body = (await response.json()) as { data?: Array<{ id: string }> };
    const models = (body.data ?? [])
      .map((entry) => entry.id)
      .filter((id) => /^(gpt|o[1-9]|chatgpt)/i.test(id))
      .filter((id) => !/(audio|realtime|transcribe|tts|image|search|embedding|moderation)/i.test(id))
      .sort()
      .map((id) => ({ id, label: id, provider: this.id }));
    return models.length > 0 ? models : this.knownModels();
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    const key = env.openaiKey;
    if (!key) throw new ProviderError('OPENAI_API_KEY is not set.', this.id);

    const messages = toOpenAiMessages(request.messages);
    if (request.system) messages.unshift({ role: 'system', content: request.system });

    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({
        model: request.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(request.maxTokens ? { max_completion_tokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              })),
            }
          : {}),
      }),
    });

    if (!response.ok || !response.body) {
      const body = await response.text();
      throw new ProviderError(
        describeUpstreamError(this.id, response.status, body),
        this.id,
        response.status,
      );
    }

    // Tool calls arrive as indexed fragments across many chunks.
    const pending = new Map<number, { id: string; name: string; args: string }>();
    let stopReason: string | null = null;

    for await (const message of readSse(response.body)) {
      if (message.data === '[DONE]') break;
      const payload = safeJsonParse<{
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>(message.data);
      if (!payload) continue;

      if (payload.usage) {
        yield {
          type: 'usage',
          usage: {
            inputTokens: payload.usage.prompt_tokens ?? null,
            outputTokens: payload.usage.completion_tokens ?? null,
          },
        };
      }

      const choice = payload.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) stopReason = choice.finish_reason;

      const content = choice.delta?.content;
      if (content) yield { type: 'text', delta: content };

      for (const fragment of choice.delta?.tool_calls ?? []) {
        const existing = pending.get(fragment.index) ?? { id: '', name: '', args: '' };
        if (fragment.id) existing.id = fragment.id;
        if (fragment.function?.name) existing.name = fragment.function.name;
        if (fragment.function?.arguments) existing.args += fragment.function.arguments;
        pending.set(fragment.index, existing);
      }
    }

    for (const call of pending.values()) {
      if (!call.name) continue;
      yield {
        type: 'tool_call',
        call: {
          id: call.id || `call_${call.name}`,
          name: call.name,
          input: safeJsonParse<Record<string, unknown>>(call.args || '{}') ?? {},
        },
      };
    }

    yield { type: 'done', stopReason };
  }
}
