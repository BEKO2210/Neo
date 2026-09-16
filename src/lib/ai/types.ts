export type ProviderId = 'anthropic' | 'openai' | 'google';

export type MessageRole = 'user' | 'assistant';

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; name: string; output: string; isError?: boolean };

/**
 * Provider-neutral message. Tool calls live inside assistant messages and tool
 * results inside the following user message, which is how Anthropic frames a
 * conversation; the OpenAI adapter flattens that into `role: "tool"` messages.
 */
export interface ChatMessage {
  role: MessageRole;
  parts: MessagePart[];
}

export function userText(text: string): ChatMessage {
  return { role: 'user', parts: [{ type: 'text', text }] };
}

export function assistantText(text: string): ChatMessage {
  return { role: 'assistant', parts: [{ type: 'text', text }] };
}

export function messageText(message: ChatMessage): string {
  return message.parts
    .filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object describing the tool input. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CompletionRequest {
  /** The key this single call runs on. Neo never reads credentials globally. */
  apiKey: string;
  model: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'usage'; usage: Usage }
  | { type: 'done'; stopReason: string | null }
  | { type: 'error'; message: string };

export interface ModelInfo {
  id: string;
  label: string;
  provider: ProviderId;
}

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly supportsTools: boolean;
  readonly defaultModel: string;
  /** Curated fallback list, used when the live model listing is unavailable. */
  knownModels(): ModelInfo[];
  listModels(apiKey: string, signal?: AbortSignal): Promise<ModelInfo[]>;
  stream(request: CompletionRequest): AsyncGenerator<StreamEvent>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Turns an upstream error body into something worth showing an operator. */
export function describeUpstreamError(provider: ProviderId, status: number, body: string): string {
  const trimmed = body.trim().slice(0, 600);
  let detail = trimmed;
  try {
    const parsed = JSON.parse(trimmed) as { error?: { message?: string } | string };
    if (typeof parsed.error === 'string') detail = parsed.error;
    else if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    // Keep the raw body; it is already truncated.
  }
  if (status === 401 || status === 403) {
    return `${provider}: authentication failed (${status}). Check the API key in your environment. ${detail}`;
  }
  if (status === 404) {
    return `${provider}: model or endpoint not found (404). Pick a different model id. ${detail}`;
  }
  if (status === 429) {
    return `${provider}: rate limited (429). ${detail}`;
  }
  return `${provider}: request failed (${status}). ${detail}`;
}
