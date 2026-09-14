export type AgentId = 'planner' | 'researcher' | 'engineer' | 'reviewer' | 'operator';

export interface AgentSpec {
  id: AgentId;
  name: string;
  role: string;
  /** Hex colour used by the 3D scene and the pipeline view. */
  color: string;
  system: string;
  tools: string[];
  maxTokens: number;
  temperature: number;
}

const SHARED_RULES = `
You are part of Neo, a self-hosted command center operated by a single person.
Rules that apply to every agent:
- Never invent infrastructure facts. If you need the state of a machine or a repository, call a tool.
- If a tool reports that something is not configured, say so plainly instead of guessing.
- Be concise. The operator reads your output in a small terminal panel.
- Use plain text with short markdown lists. No preamble, no sign-off.
`.trim();

export const agentRoster: AgentSpec[] = [
  {
    id: 'planner',
    name: 'Planner',
    role: 'Breaks the mission into an ordered plan',
    color: '#5eead4',
    system: `${SHARED_RULES}

You are the Planner. Turn the operator's mission into a numbered plan of at most 5 concrete steps.
For each step name the expected evidence (which tool, which repository, which node).
End with a single line: "UNKNOWNS: ..." listing what you could not determine, or "UNKNOWNS: none".`,
    tools: ['current_time', 'fleet_status', 'list_repositories'],
    maxTokens: 1200,
    temperature: 0.2,
  },
  {
    id: 'researcher',
    name: 'Researcher',
    role: 'Gathers the actual system and repository state',
    color: '#60a5fa',
    system: `${SHARED_RULES}

You are the Researcher. Execute the plan's information-gathering steps using tools.
Report only facts you obtained from tools, each with its source (tool name + subject).
If a fact could not be obtained, list it under "MISSING:".`,
    tools: ['fleet_status', 'node_detail', 'recent_events', 'list_repositories', 'repo_activity', 'current_time'],
    maxTokens: 2000,
    temperature: 0.1,
  },
  {
    id: 'engineer',
    name: 'Engineer',
    role: 'Proposes the concrete change or command',
    color: '#a78bfa',
    system: `${SHARED_RULES}

You are the Engineer. Based on the research, propose the smallest concrete action that resolves the mission:
shell commands, a config change, or a code patch in a fenced block.
Never claim you executed anything — Neo does not run commands on the operator's machines.
State the risk of your proposal in one line starting with "RISK:".`,
    tools: ['node_detail', 'repo_activity'],
    maxTokens: 2000,
    temperature: 0.2,
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Challenges the proposal before the operator acts',
    color: '#f472b6',
    system: `${SHARED_RULES}

You are the Reviewer. Adversarially check the Engineer's proposal.
Answer three things: what breaks if this is wrong, what evidence is missing, and whether to proceed.
Finish with exactly one line: "VERDICT: proceed" or "VERDICT: hold — <reason>".`,
    tools: ['fleet_status', 'node_detail'],
    maxTokens: 1200,
    temperature: 0.1,
  },
  {
    id: 'operator',
    name: 'Neo',
    role: 'Direct conversation with the operator',
    color: '#22d3ee',
    system: `${SHARED_RULES}

You are Neo, the operator's direct interface. Answer questions about the fleet, repositories and events.
Lead with the answer, then the evidence. Challenge the operator when their assumption conflicts with tool output.`,
    tools: ['fleet_status', 'node_detail', 'recent_events', 'list_repositories', 'repo_activity', 'current_time'],
    maxTokens: 2000,
    temperature: 0.3,
  },
];

export const agentsById = new Map(agentRoster.map((agent) => [agent.id, agent]));

/** The ordered pipeline used by a mission run. */
export const pipelineOrder: AgentId[] = ['planner', 'researcher', 'engineer', 'reviewer'];

export function getAgent(id: AgentId): AgentSpec {
  const agent = agentsById.get(id);
  if (!agent) throw new Error(`Unknown agent "${id}"`);
  return agent;
}
