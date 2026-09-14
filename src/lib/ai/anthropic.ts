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

const API_BASE = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export function toAnthropicMessages(messages: ChatMessage[]): Array<{
  role: 'user' | 'assistant';
  content: AnthropicBlock[];
}> {
  return messages.map((message) => ({
    role: message.role,
    content: message.parts.map((part): AnthropicBlock => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'tool_call') {
        return { type: 'tool_use', id: part.id, name: part.name, input: part.input };
      }
      return {
        type: 'tool_result',
        tool_use_id: part.toolCallId,
        content: part.output,
        is_error: part.isError ?? false,
      };
    }),
  }));
}

export class AnthropicProvider implements Provider {
  readonly id = 'anthropic' as const;
  readonly label = 'Anthropic';
  readonly supportsTools = true;
  readonly defaultModel = 'claude-sonnet-5';

  isConfigured(): boolean {
    return Boolean(env.anthropicKey);
  }

  knownModels(): ModelInfo[] {
    return [
      { id: 'claude-opus-5', label: 'Claude Opus 5', provider: this.id },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: this.id },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: this.id },
    ];
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const key = env.anthropicKey;
    if (!key) return [];
    const response = await fetch(`${API_BASE}/models?limit=100`, {
      headers: { 'x-api-key': key, 'anthropic-version': API_VERSION },
      signal,
      cache: 'no-store',
    });
    if (!response.ok) return this.knownModels();
    const body = (await response.json()) as { data?: Array<{ id: string; display_name?: string }> };
    const models = (body.data ?? []).map((entry) => ({
      id: entry.id,
      label: entry.display_name ?? entry.id,
      provider: this.id,
    }));
    return models.length > 0 ? models : this.knownModels();
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    const key = env.anthropicKey;
    if (!key) throw new ProviderError('ANTHROPIC_API_KEY is not set.', this.id);

    const response = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      signal: request.signal,
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature,
        stream: true,
        ...(request.system ? { system: request.system } : {}),
        messages: toAnthropicMessages(request.messages),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.parameters,
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

    // Tool inputs stream as partial JSON fragments and are only valid once the
    // matching content block closes, so buffer them per block index.
    const pendingTools = new Map<number, { id: string; name: string; json: string }>();

    for await (const message of readSse(response.body)) {
      const payload = safeJsonParse<Record<string, unknown>>(message.data);
      if (!payload) continue;
      const type = message.event ?? (payload.type as string | undefined);

      switch (type) {
        case 'content_block_start': {
          const index = payload.index as number;
          const block = payload.content_block as AnthropicBlock | undefined;
          if (block?.type === 'tool_use' && block.id && block.name) {
            pendingTools.set(index, { id: block.id, name: block.name, json: '' });
          }
          break;
        }
        case 'content_block_delta': {
          const index = payload.index as number;
          const delta = payload.delta as { type?: string; text?: string; partial_json?: string };
          if (delta?.type === 'text_delta' && delta.text) {
            yield { type: 'text', delta: delta.text };
          } else if (delta?.type === 'input_json_delta') {
            const pending = pendingTools.get(index);
            if (pending) pending.json += delta.partial_json ?? '';
          }
          break;
        }
        case 'content_block_stop': {
          const index = payload.index as number;
          const pending = pendingTools.get(index);
          if (pending) {
            pendingTools.delete(index);
            const input = safeJsonParse<Record<string, unknown>>(pending.json || '{}') ?? {};
            yield { type: 'tool_call', call: { id: pending.id, name: pending.name, input } };
          }
          break;
        }
        case 'message_delta': {
          const usage = payload.usage as { output_tokens?: number } | undefined;
          if (usage?.output_tokens !== undefined) {
            yield { type: 'usage', usage: { inputTokens: null, outputTokens: usage.output_tokens } };
          }
          break;
        }
        case 'message_stop': {
          yield { type: 'done', stopReason: null };
          break;
        }
        case 'error': {
          const error = payload.error as { message?: string } | undefined;
          yield { type: 'error', message: error?.message ?? 'Anthropic stream error' };
          break;
        }
        default:
          break;
      }
    }
  }
}
