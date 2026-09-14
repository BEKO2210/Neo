'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/hud/Icon';
import type { MissionEvent } from '@/lib/agents/orchestrator';
import { postStream } from '@/lib/client/stream';
import type { AgentSummary } from '@/hooks/useConfig';
import { cn } from '@/lib/utils';

type Status = 'pending' | 'running' | 'done';

interface AgentRun {
  id: string;
  name: string;
  role: string;
  color: string;
  status: Status;
  text: string;
  tools: Array<{ tool: string; status: 'running' | 'ok' | 'error' }>;
}

interface AgentsAppProps {
  model: string | null;
  agents: AgentSummary[];
  pipeline: string[];
  onActivity(color: string | null): void;
}

const SUGGESTIONS = [
  'Audit the fleet and tell me what needs attention first.',
  'Summarise what changed across my repositories this week.',
  'A node is running hot. Diagnose it and propose a fix.',
];

export function AgentsApp({ model, agents, pipeline, onActivity }: AgentsAppProps) {
  const [mission, setMission] = useState('');
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [runs]);

  const launch = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 3 || busy) return;

      const seeded: AgentRun[] = pipeline.map((id) => {
        const spec = agents.find((agent) => agent.id === id);
        return {
          id,
          name: spec?.name ?? id,
          role: spec?.role ?? '',
          color: spec?.color ?? '#22d3ee',
          status: 'pending',
          text: '',
          tools: [],
        };
      });

      setRuns(seeded);
      setVerdict(null);
      setError(null);
      setExpanded(seeded[0]?.id ?? null);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const patch = (id: string, update: (run: AgentRun) => AgentRun) =>
        setRuns((current) => current.map((run) => (run.id === id ? update(run) : run)));

      try {
        for await (const event of postStream<MissionEvent>(
          '/api/agents/run',
          { mission: trimmed, model },
          controller.signal,
        )) {
          switch (event.type) {
            case 'agent_start':
              patch(event.agent, (run) => ({ ...run, status: 'running', color: event.color }));
              setExpanded(event.agent);
              onActivity(event.color);
              break;
            case 'agent_text':
              patch(event.agent, (run) => ({ ...run, text: run.text + event.delta }));
              break;
            case 'agent_tool_start':
              patch(event.agent, (run) => ({
                ...run,
                tools: [...run.tools, { tool: event.tool, status: 'running' }],
              }));
              break;
            case 'agent_tool_end':
              patch(event.agent, (run) => ({
                ...run,
                tools: run.tools.map((tool) =>
                  tool.tool === event.tool && tool.status === 'running'
                    ? { tool: tool.tool, status: event.isError ? 'error' : 'ok' }
                    : tool,
                ),
              }));
              break;
            case 'agent_done':
              patch(event.agent, (run) => ({ ...run, status: 'done' }));
              break;
            case 'mission_error':
              setError(event.message);
              break;
            case 'mission_done':
              setVerdict(event.verdict);
              break;
            default:
              break;
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'The mission failed to start.');
        }
      } finally {
        setBusy(false);
        onActivity(null);
        abortRef.current = null;
      }
    },
    [agents, busy, model, onActivity, pipeline],
  );

  // The terminal's `run <mission>` command dispatches into this window.
  useEffect(() => {
    function handleExternalMission(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail !== 'string') return;
      setMission(detail);
      void launch(detail);
    }
    window.addEventListener('neo:mission', handleExternalMission);
    return () => window.removeEventListener('neo:mission', handleExternalMission);
  }, [launch]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void launch(mission);
  }

  const proceed = verdict?.toLowerCase().startsWith('proceed') ?? false;

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={handleSubmit} className="shrink-0 border-b border-edge/70 bg-abyss/60 p-3">
        <label htmlFor="mission" className="neo-label mb-2 block">
          Mission
        </label>
        <div className="flex gap-2">
          <input
            id="mission"
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            placeholder="What should the pipeline work on?"
            className="flex-1 rounded-lg border border-edge bg-panel px-2.5 py-2 text-sm text-chrome placeholder:text-mist/50"
          />
          <button
            type={busy ? 'button' : 'submit'}
            onClick={busy ? () => abortRef.current?.abort() : undefined}
            disabled={!busy && mission.trim().length < 3}
            className={cn(
              'rounded-lg border px-3 py-2 font-mono text-[11px] tracking-[0.18em] transition disabled:opacity-30',
              busy
                ? 'border-alert/50 bg-alert/15 text-alert'
                : 'border-plasma/50 bg-plasma/10 text-plasma hover:bg-plasma/20',
            )}
          >
            {busy ? 'ABORT' : 'RUN'}
          </button>
        </div>

        {runs.length === 0 ? (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => setMission(suggestion)}
                  className="rounded border border-edge px-2 py-1 text-left text-[11px] text-mist transition hover:border-plasma/40 hover:text-chrome"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <div ref={logRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {runs.length === 0 ? (
          <div className="pt-6 text-center">
            <p className="neo-label">Pipeline idle</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-mist">
              Four agents run in sequence — Planner, Researcher, Engineer, Reviewer. Each one sees
              the previous output, calls tools for real state, and the Reviewer ends with a verdict.
            </p>
          </div>
        ) : null}

        {runs.map((run, index) => {
          const open = expanded === run.id;
          return (
            <article
              key={run.id}
              className={cn(
                'neo-rise overflow-hidden rounded-lg border transition',
                run.status === 'running' ? 'border-edge bg-abyss/70' : 'border-edge/60 bg-abyss/40',
              )}
              style={run.status === 'running' ? { borderColor: `${run.color}66` } : undefined}
            >
              <button
                type="button"
                onClick={() => setExpanded(open ? null : run.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
                aria-expanded={open}
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    run.status === 'running' && 'neo-pulse',
                    run.status === 'pending' && 'opacity-30',
                  )}
                  style={{
                    background: run.color,
                    boxShadow: run.status === 'running' ? `0 0 10px ${run.color}` : undefined,
                  }}
                  aria-hidden
                />
                <span className="font-mono text-[11px] tracking-widest text-mist">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-sm text-chrome">{run.name}</span>
                <span className="hidden truncate text-[11px] text-mist sm:inline">{run.role}</span>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-mist">
                  {run.status}
                </span>
              </button>

              {open ? (
                <div className="border-t border-edge/60 px-3 py-2">
                  {run.tools.length > 0 ? (
                    <ul className="mb-2 flex flex-wrap gap-1.5">
                      {run.tools.map((tool, toolIndex) => (
                        <li
                          key={`${tool.tool}-${toolIndex}`}
                          className={cn(
                            'rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider',
                            tool.status === 'running' && 'neo-pulse border-neo/40 text-neo',
                            tool.status === 'ok' && 'border-signal/40 text-signal',
                            tool.status === 'error' && 'border-alert/40 text-alert',
                          )}
                        >
                          {tool.tool}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-chrome/85">
                    {run.text || (run.status === 'running' ? '▍' : 'No output.')}
                  </p>
                </div>
              ) : null}
            </article>
          );
        })}

        {error ? (
          <p className="rounded-lg border border-alert/40 bg-alert/10 p-2.5 text-xs text-alert">
            {error}
          </p>
        ) : null}

        {verdict ? (
          <p
            className={cn(
              'flex items-center gap-2 rounded-lg border p-2.5 text-xs',
              proceed
                ? 'border-signal/40 bg-signal/10 text-signal'
                : 'border-warn/40 bg-warn/10 text-warn',
            )}
          >
            <Icon name="agents" size={14} />
            <span className="font-mono tracking-wider">VERDICT</span>
            <span className="text-chrome/90">{verdict}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
