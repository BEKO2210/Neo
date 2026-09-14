import { GitHubClient } from '@/lib/github/client';
import { getStore } from '@/lib/store';
import { summarizeFleet, usagePercent } from '@/lib/telemetry/health';
import { formatBytes } from '@/lib/utils';
import type { ToolDefinition } from './types';

export interface NeoTool {
  definition: ToolDefinition;
  /** Returns a compact, model-readable string. Must never throw. */
  execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function count(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : fallback;
}

const fleetStatus: NeoTool = {
  definition: {
    name: 'fleet_status',
    description:
      'List every machine reporting telemetry to Neo with its health, CPU, memory and disk usage. Use this before answering anything about servers, devices or infrastructure state.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  async execute() {
    const nodes = await getStore().listNodes();
    if (nodes.length === 0) {
      return 'No nodes are reporting. The telemetry agent (agent/neo_agent.py) is not running anywhere yet.';
    }
    const summary = summarizeFleet(nodes);
    const lines = nodes.map((node) => {
      const memory = usagePercent(node.metrics.memoryUsedBytes, node.metrics.memoryTotalBytes);
      const disk = usagePercent(node.metrics.diskUsedBytes, node.metrics.diskTotalBytes);
      const down = node.services.filter((service) => service.state !== 'up').map((s) => s.name);
      return [
        `- ${node.name} (${node.id}, ${node.kind}) health=${node.health}`,
        `cpu=${node.metrics.cpuPercent ?? 'n/a'}%`,
        `mem=${memory ?? 'n/a'}%`,
        `disk=${disk ?? 'n/a'}%`,
        node.metrics.temperatureC !== null ? `temp=${node.metrics.temperatureC}C` : '',
        down.length > 0 ? `problem_services=${down.join(',')}` : '',
        `last_seen=${node.lastSeen}`,
      ]
        .filter(Boolean)
        .join(' ');
    });
    return `Fleet: ${summary.total} nodes (${summary.healthy} healthy, ${summary.warning} warning, ${summary.critical} critical, ${summary.stale} stale)\n${lines.join('\n')}`;
  },
};

const nodeDetail: NeoTool = {
  definition: {
    name: 'node_detail',
    description: 'Full metrics and service list for one node, addressed by its node id.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Node id as shown by fleet_status.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  async execute(input) {
    const id = text(input.id);
    if (!id) return 'Error: "id" is required.';
    const node = await getStore().getNode(id);
    if (!node) return `No node with id "${id}" is known to Neo.`;
    const m = node.metrics;
    const services =
      node.services.length > 0
        ? node.services.map((s) => `${s.name}=${s.state}${s.detail ? ` (${s.detail})` : ''}`).join(', ')
        : 'none reported';
    return [
      `node=${node.name} id=${node.id} kind=${node.kind} health=${node.health}`,
      `os=${node.os ?? 'unknown'} ip=${node.ip ?? 'unknown'} tags=${node.tags.join(',') || 'none'}`,
      `cpu=${m.cpuPercent ?? 'n/a'}% load=${m.loadAverage ? m.loadAverage.join('/') : 'n/a'} processes=${m.processCount ?? 'n/a'}`,
      `memory=${m.memoryUsedBytes !== null ? formatBytes(m.memoryUsedBytes) : 'n/a'} of ${m.memoryTotalBytes !== null ? formatBytes(m.memoryTotalBytes) : 'n/a'} (${usagePercent(m.memoryUsedBytes, m.memoryTotalBytes) ?? 'n/a'}%)`,
      `disk=${m.diskUsedBytes !== null ? formatBytes(m.diskUsedBytes) : 'n/a'} of ${m.diskTotalBytes !== null ? formatBytes(m.diskTotalBytes) : 'n/a'} (${usagePercent(m.diskUsedBytes, m.diskTotalBytes) ?? 'n/a'}%)`,
      `temperature=${m.temperatureC ?? 'n/a'}C uptime=${m.uptimeSeconds ?? 'n/a'}s last_seen=${node.lastSeen}`,
      `services: ${services}`,
    ].join('\n');
  },
};

const recentEvents: NeoTool = {
  definition: {
    name: 'recent_events',
    description: 'Recent Neo system events (telemetry arrivals, agent runs, errors).',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
  async execute(input) {
    const events = await getStore().listEvents(count(input.limit, 20));
    if (events.length === 0) return 'No events recorded yet.';
    return events.map((event) => `${event.at} [${event.level}] ${event.source}: ${event.message}`).join('\n');
  },
};

const listRepositories: NeoTool = {
  definition: {
    name: 'list_repositories',
    description: 'List GitHub repositories the configured token can see, most recently pushed first.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
  async execute(input, signal) {
    if (!GitHubClient.isConfigured()) return 'GitHub is not configured (GITHUB_TOKEN missing).';
    try {
      const repos = await GitHubClient.fromEnv().listRepos(count(input.limit, 20), signal);
      if (repos.length === 0) return 'The token can see no repositories.';
      return repos
        .map(
          (repo) =>
            `- ${repo.fullName}${repo.private ? ' (private)' : ''} lang=${repo.language ?? 'n/a'} open_issues=${repo.openIssues} pushed=${repo.pushedAt} :: ${repo.description ?? 'no description'}`,
        )
        .join('\n');
    } catch (error) {
      return `GitHub error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

const repoActivity: NeoTool = {
  definition: {
    name: 'repo_activity',
    description:
      'Recent commits, open pull requests, open issues and the latest CI runs for one repository.',
    parameters: {
      type: 'object',
      properties: { repo: { type: 'string', description: 'Repository as "owner/name".' } },
      required: ['repo'],
      additionalProperties: false,
    },
  },
  async execute(input, signal) {
    const repo = text(input.repo);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return 'Error: "repo" must look like "owner/name".';
    if (!GitHubClient.isConfigured()) return 'GitHub is not configured (GITHUB_TOKEN missing).';
    try {
      const client = GitHubClient.fromEnv();
      const [commits, pulls, issues, runs] = await Promise.all([
        client.listCommits(repo, 8, signal),
        client.listPulls(repo, 10, signal),
        client.listIssues(repo, 10, signal),
        client.listWorkflowRuns(repo, 5, signal),
      ]);
      return [
        `repo=${repo}`,
        'commits:',
        ...commits.map((c) => `  ${c.sha} ${c.author}: ${c.message}`),
        'open_pull_requests:',
        ...(pulls.length ? pulls.map((p) => `  #${p.number}${p.draft ? ' (draft)' : ''} ${p.title} — ${p.author}`) : ['  none']),
        'open_issues:',
        ...(issues.length ? issues.map((i) => `  #${i.number} ${i.title} [${i.labels.join(',')}]`) : ['  none']),
        'ci_runs:',
        ...(runs.length ? runs.map((r) => `  ${r.name} ${r.status}/${r.conclusion ?? 'pending'} on ${r.branch}`) : ['  none']),
      ].join('\n');
    } catch (error) {
      return `GitHub error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

const currentTime: NeoTool = {
  definition: {
    name: 'current_time',
    description: 'The current UTC timestamp. Use it whenever freshness or "how long ago" matters.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  async execute() {
    return new Date().toISOString();
  },
};

export const neoTools: NeoTool[] = [
  fleetStatus,
  nodeDetail,
  recentEvents,
  listRepositories,
  repoActivity,
  currentTime,
];

export const toolsByName = new Map(neoTools.map((tool) => [tool.definition.name, tool]));

export function toolDefinitions(names?: string[]): ToolDefinition[] {
  const selected = names ? neoTools.filter((tool) => names.includes(tool.definition.name)) : neoTools;
  return selected.map((tool) => tool.definition);
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ output: string; isError: boolean }> {
  const tool = toolsByName.get(name);
  if (!tool) return { output: `Unknown tool "${name}".`, isError: true };
  try {
    return { output: await tool.execute(input, signal), isError: false };
  } catch (error) {
    return {
      output: `Tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}
