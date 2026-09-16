import type { Credentials } from '@/lib/ai/credentials';
import { resolveModel } from '@/lib/ai/registry';
import { runConversation } from '@/lib/ai/runner';
import type { ToolContext } from '@/lib/ai/tools';
import { userText, type ChatMessage } from '@/lib/ai/types';
import { getAgent, pipelineOrder, type AgentId } from './roster';

export type MissionEvent =
  | { type: 'mission_start'; mission: string; agents: AgentId[]; model: string }
  | { type: 'agent_start'; agent: AgentId; name: string; color: string; role: string }
  | { type: 'agent_text'; agent: AgentId; delta: string }
  | { type: 'agent_tool_start'; agent: AgentId; tool: string; input: Record<string, unknown> }
  | { type: 'agent_tool_end'; agent: AgentId; tool: string; output: string; isError: boolean }
  | { type: 'agent_done'; agent: AgentId; text: string }
  | { type: 'mission_error'; message: string }
  | {
      type: 'mission_done';
      verdict: string | null;
      totals: { inputTokens: number; outputTokens: number };
    };

export interface MissionOptions {
  mission: string;
  modelReference?: string | null;
  agents?: AgentId[];
  credentials: Credentials;
  toolContext: ToolContext;
  signal?: AbortSignal;
}

function briefFor(agent: AgentId, mission: string, transcript: Array<{ agent: AgentId; text: string }>): ChatMessage[] {
  if (transcript.length === 0) return [userText(`MISSION: ${mission}`)];
  const context = transcript
    .map((entry) => `--- ${getAgent(entry.agent).name} ---\n${entry.text.trim() || '(no output)'}`)
    .join('\n\n');
  return [userText(`MISSION: ${mission}\n\nWork produced so far:\n\n${context}`)];
}

/** Extracts the reviewer's verdict line so the UI can show a single clear outcome. */
export function extractVerdict(text: string): string | null {
  const match = text.match(/^VERDICT:\s*(.+)$/im);
  return match?.[1]?.trim() ?? null;
}

/**
 * Runs the agent pipeline sequentially. Each agent sees the mission plus every
 * previous agent's output, which keeps the hand-off explicit and auditable
 * instead of hiding it in shared memory.
 */
export async function* runMission(options: MissionOptions): AsyncGenerator<MissionEvent> {
  const totals = { inputTokens: 0, outputTokens: 0 };
  const resolved = resolveModel(options.modelReference, options.credentials);
  if (!resolved) {
    yield {
      type: 'mission_error',
      message:
        'No model key is available for this account. Add one in the Account panel, or ask the operator to enable shared keys.',
    };
    yield { type: 'mission_done', verdict: null, totals };
    return;
  }

  const agents = options.agents?.length ? options.agents : pipelineOrder;
  yield {
    type: 'mission_start',
    mission: options.mission,
    agents,
    model: `${resolved.provider.id}:${resolved.model}`,
  };

  const transcript: Array<{ agent: AgentId; text: string }> = [];
  let verdict: string | null = null;

  for (const agentId of agents) {
    const spec = getAgent(agentId);
    yield {
      type: 'agent_start',
      agent: agentId,
      name: spec.name,
      color: spec.color,
      role: spec.role,
    };

    let finalText = '';
    for await (const event of runConversation({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      system: spec.system,
      toolContext: options.toolContext,
      messages: briefFor(agentId, options.mission, transcript),
      toolNames: spec.tools,
      maxTokens: spec.maxTokens,
      temperature: spec.temperature,
      signal: options.signal,
    })) {
      switch (event.type) {
        case 'text':
          yield { type: 'agent_text', agent: agentId, delta: event.delta };
          break;
        case 'tool_start':
          yield {
            type: 'agent_tool_start',
            agent: agentId,
            tool: event.call.name,
            input: event.call.input,
          };
          break;
        case 'tool_end':
          yield {
            type: 'agent_tool_end',
            agent: agentId,
            tool: event.name,
            output: event.output.slice(0, 2000),
            isError: event.isError,
          };
          break;
        case 'error':
          yield { type: 'mission_error', message: event.message };
          break;
        case 'final':
          finalText = event.text;
          totals.inputTokens += event.totals.inputTokens;
          totals.outputTokens += event.totals.outputTokens;
          break;
        default:
          break;
      }
      if (options.signal?.aborted) break;
    }

    transcript.push({ agent: agentId, text: finalText });
    yield { type: 'agent_done', agent: agentId, text: finalText };

    const found = extractVerdict(finalText);
    if (found) verdict = found;
    if (options.signal?.aborted) break;
  }

  yield { type: 'mission_done', verdict, totals };
}
