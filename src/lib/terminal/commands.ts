import type { AppId } from '@/components/os/types';
import { postStream } from '@/lib/client/stream';
import type { RunEvent } from '@/lib/ai/runner';
import type { NeoEvent, NeoNode } from '@/lib/telemetry/types';
import { usagePercent } from '@/lib/telemetry/health';
import { formatRelativeTime } from '@/lib/utils';

export interface TerminalContext {
  nodes: NeoNode[];
  events: NeoEvent[];
  operator: string;
  store: string;
  model: string | null;
  openApp(id: AppId): void;
  selectNode(id: string | null): void;
  /** Streams a line into the terminal as output arrives. */
  write(line: string): void;
  /** Replaces the last written line; used for streaming answers. */
  update(line: string): void;
  clear(): void;
}

export interface CommandSpec {
  name: string;
  usage: string;
  summary: string;
  run(args: string[], context: TerminalContext): Promise<string[]> | string[];
}

const APP_IDS: AppId[] = ['chat', 'agents', 'nodes', 'github', 'terminal', 'system'];

function isAppId(value: string): value is AppId {
  return (APP_IDS as string[]).includes(value);
}

const commands: CommandSpec[] = [
  {
    name: 'help',
    usage: 'help',
    summary: 'List available commands.',
    run: () => [
      'Available commands:',
      ...commands.map((command) => `  ${command.usage.padEnd(26)} ${command.summary}`),
      '',
      'Tip: "ask" talks to the model with tools; "run" starts the agent pipeline.',
    ],
  },
  {
    name: 'status',
    usage: 'status',
    summary: 'Fleet and configuration summary.',
    run: (_args, context) => {
      const counts = context.nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.health] = (acc[node.health] ?? 0) + 1;
        return acc;
      }, {});
      return [
        `operator : ${context.operator}`,
        `store    : ${context.store}`,
        `model    : ${context.model ?? 'server default'}`,
        `nodes    : ${context.nodes.length} (${Object.entries(counts)
          .map(([key, value]) => `${value} ${key}`)
          .join(', ') || 'none'})`,
        `events   : ${context.events.length} recorded`,
      ];
    },
  },
  {
    name: 'nodes',
    usage: 'nodes',
    summary: 'List every reporting machine.',
    run: (_args, context) => {
      if (context.nodes.length === 0) return ['No nodes are reporting.'];
      return context.nodes.map((node) => {
        const memory = usagePercent(node.metrics.memoryUsedBytes, node.metrics.memoryTotalBytes);
        return `${node.id.padEnd(18)} ${node.health.padEnd(9)} cpu ${String(node.metrics.cpuPercent ?? '—').padStart(3)}%  mem ${String(memory ?? '—').padStart(5)}%  ${formatRelativeTime(node.lastSeen)}`;
      });
    },
  },
  {
    name: 'node',
    usage: 'node <id>',
    summary: 'Inspect one machine and select it in the 3D view.',
    run: (args, context) => {
      const id = args[0];
      if (!id) return ['Usage: node <id>'];
      const node = context.nodes.find((entry) => entry.id === id || entry.name === id);
      if (!node) return [`No node matches "${id}".`];
      context.selectNode(node.id);
      const m = node.metrics;
      return [
        `${node.name} (${node.id})`,
        `  kind    : ${node.kind}`,
        `  os      : ${node.os ?? 'unknown'}`,
        `  health  : ${node.health}`,
        `  cpu     : ${m.cpuPercent ?? '—'}%`,
        `  memory  : ${usagePercent(m.memoryUsedBytes, m.memoryTotalBytes) ?? '—'}%`,
        `  disk    : ${usagePercent(m.diskUsedBytes, m.diskTotalBytes) ?? '—'}%`,
        `  temp    : ${m.temperatureC ?? '—'}`,
        `  services: ${node.services.map((service) => `${service.name}=${service.state}`).join(' ') || 'none'}`,
      ];
    },
  },
  {
    name: 'events',
    usage: 'events [n]',
    summary: 'Show the most recent system events.',
    run: (args, context) => {
      const limit = Math.min(Number.parseInt(args[0] ?? '15', 10) || 15, 50);
      if (context.events.length === 0) return ['No events recorded.'];
      return context.events
        .slice(0, limit)
        .map((event) => `${formatRelativeTime(event.at).padEnd(9)} [${event.level}] ${event.source}: ${event.message}`);
    },
  },
  {
    name: 'repos',
    usage: 'repos',
    summary: 'List repositories visible to the configured token.',
    run: async () => {
      const response = await fetch('/api/github?action=repos');
      const body = (await response.json()) as {
        repos?: Array<{ fullName: string; language: string | null; pushedAt: string }>;
        message?: string;
      };
      if (!response.ok) return [body.message ?? `GitHub request failed (${response.status}).`];
      if (!body.repos?.length) return ['No repositories visible.'];
      return body.repos.map(
        (repo) => `${repo.fullName.padEnd(40)} ${(repo.language ?? '—').padEnd(12)} ${formatRelativeTime(repo.pushedAt)}`,
      );
    },
  },
  {
    name: 'ask',
    usage: 'ask <question>',
    summary: 'Ask Neo directly, with tools, streaming into the terminal.',
    run: async (args, context) => {
      const question = args.join(' ').trim();
      if (!question) return ['Usage: ask <question>'];
      context.write('');
      let answer = '';
      try {
        for await (const event of postStream<RunEvent | { type: 'meta'; model: string }>(
          '/api/chat',
          { model: context.model, messages: [{ role: 'user', content: question }] },
        )) {
          if (event.type === 'tool_start') {
            answer += `[tool ${event.call.name}]\n`;
            context.update(answer);
          } else if (event.type === 'text') {
            answer += event.delta;
            context.update(answer);
          } else if (event.type === 'error') {
            answer += `\n[error] ${event.message}`;
            context.update(answer);
          }
        }
      } catch (error) {
        context.update(`${answer}\n[error] ${error instanceof Error ? error.message : String(error)}`);
      }
      return [];
    },
  },
  {
    name: 'run',
    usage: 'run <mission>',
    summary: 'Hand a mission to the agent pipeline and open it.',
    run: (args, context) => {
      const mission = args.join(' ').trim();
      if (!mission) return ['Usage: run <mission>'];
      context.openApp('agents');
      window.dispatchEvent(new CustomEvent('neo:mission', { detail: mission }));
      return [`Mission dispatched to the pipeline: ${mission}`];
    },
  },
  {
    name: 'open',
    usage: 'open <app>',
    summary: `Open a window (${APP_IDS.join(', ')}); "system" is your account.`,
    run: (args, context) => {
      const target = args[0] ?? '';
      if (!isAppId(target)) return [`Unknown app "${target}". Try: ${APP_IDS.join(', ')}`];
      context.openApp(target);
      return [`Opened ${target}.`];
    },
  },
  {
    name: 'whoami',
    usage: 'whoami',
    summary: 'Show the signed-in operator.',
    run: (_args, context) => [context.operator],
  },
  {
    name: 'clear',
    usage: 'clear',
    summary: 'Clear the terminal.',
    run: (_args, context) => {
      context.clear();
      return [];
    },
  },
];

export const commandRegistry = commands;
export const commandNames = commands.map((command) => command.name);

export function parseCommand(line: string): { name: string; args: string[] } {
  const parts = line.trim().split(/\s+/);
  const [name = '', ...args] = parts;
  return { name: name.toLowerCase(), args };
}

export async function executeCommand(line: string, context: TerminalContext): Promise<string[]> {
  const { name, args } = parseCommand(line);
  if (!name) return [];
  const command = commands.find((entry) => entry.name === name);
  if (!command) return [`neo: command not found: ${name}. Type "help".`];
  try {
    return await command.run(args, context);
  } catch (error) {
    return [`neo: ${name} failed: ${error instanceof Error ? error.message : String(error)}`];
  }
}
