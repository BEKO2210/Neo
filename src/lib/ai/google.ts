import { readSse, safeJsonParse } from './sse';
import {
  ProviderError,
  describeUpstreamError,
  messageText,
  type ChatMessage,
  type CompletionRequest,
  type ModelInfo,
  type Provider,
  type StreamEvent,
} from './types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function toGoogleContents(messages: ChatMessage[]): Array<{
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}> {
  return messages
    .map((message) => ({
      role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: messageText(message) }],
    }))
    .filter((content) => content.parts[0]!.text.length > 0);
}

/**
 * Gemini adapter, text only.
 *
 * Neo drives tool calling through Anthropic and OpenAI; adding Gemini's
 * function-calling dialect would be a third code path for no extra capability,
 * so this provider is intentionally chat-only and says so in the UI.
 */
export class GoogleProvider implements Provider {
  readonly id = 'google' as const;
  readonly label = 'Google Gemini';
  readonly supportsTools = false;
  readonly defaultModel = 'gemini-2.5-flash';


  knownModels(): ModelInfo[] {
    return [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: this.id },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: this.id },
    ];
  }

  async listModels(apiKey: string, signal?: AbortSignal): Promise<ModelInfo[]> {
    const key = apiKey;
    if (!key) return [];
    const response = await fetch(`${API_BASE}/models?key=${encodeURIComponent(key)}&pageSize=200`, {
      signal,
      cache: 'no-store',
    });
    if (!response.ok) return this.knownModels();
    const body = (await response.json()) as {
      models?: Array<{
        name: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const models = (body.models ?? [])
      .filter((entry) => entry.supportedGenerationMethods?.includes('generateContent') ?? true)
      .map((entry) => {
        const id = entry.name.replace(/^models\//, '');
        return { id, label: entry.displayName ?? id, provider: this.id };
      })
      .filter((entry) => entry.id.startsWith('gemini'));
    return models.length > 0 ? models : this.knownModels();
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    const key = request.apiKey;
    if (!key) throw new ProviderError('No google key was supplied for this request.', this.id);

    const url = `${API_BASE}/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({
        contents: toGoogleContents(request.messages),
        ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
        generationConfig: {
          ...(request.maxTokens ? { maxOutputTokens: request.maxTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        },
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

    let stopReason: string | null = null;

    for await (const message of readSse(response.body)) {
      const payload = safeJsonParse<{
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      }>(message.data);
      if (!payload) continue;

      const candidate = payload.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        if (part.text) yield { type: 'text', delta: part.text };
      }
      if (candidate?.finishReason) stopReason = candidate.finishReason;
      if (payload.usageMetadata) {
        yield {
          type: 'usage',
          usage: {
            inputTokens: payload.usageMetadata.promptTokenCount ?? null,
            outputTokens: payload.usageMetadata.candidatesTokenCount ?? null,
          },
        };
      }
    }

    yield { type: 'done', stopReason };
  }
}
