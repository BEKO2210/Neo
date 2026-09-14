'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CommitSummary,
  IssueSummary,
  PullSummary,
  RepoSummary,
  WorkflowRunSummary,
} from '@/lib/github/client';
import { cn, formatRelativeTime } from '@/lib/utils';

interface Activity {
  repo: string;
  commits: CommitSummary[];
  pulls: PullSummary[];
  issues: IssueSummary[];
  runs: WorkflowRunSummary[];
}

type Tab = 'commits' | 'pulls' | 'issues' | 'runs';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'commits', label: 'Commits' },
  { id: 'pulls', label: 'Pull requests' },
  { id: 'issues', label: 'Issues' },
  { id: 'runs', label: 'CI' },
];

function conclusionTone(run: WorkflowRunSummary): string {
  if (run.status !== 'completed') return 'border-neo/40 text-neo';
  if (run.conclusion === 'success') return 'border-signal/40 text-signal';
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') return 'border-alert/40 text-alert';
  return 'border-mist/40 text-mist';
}

export function GithubApp() {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [viewer, setViewer] = useState<{ login: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [tab, setTab] = useState<Tab>('commits');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/github?action=repos', { signal: controller.signal });
        const body = (await response.json()) as {
          repos?: RepoSummary[];
          viewer?: { login: string } | null;
          message?: string;
        };
        if (!response.ok) throw new Error(body.message ?? `GitHub request failed (${response.status}).`);
        setRepos(body.repos ?? []);
        setViewer(body.viewer ?? null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'GitHub is unavailable.');
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const loadActivity = useCallback(async (repo: string) => {
    setSelected(repo);
    setActivity(null);
    setError(null);
    try {
      const response = await fetch(`/api/github?action=activity&repo=${encodeURIComponent(repo)}`);
      const body = (await response.json()) as Activity & { message?: string };
      if (!response.ok) throw new Error(body.message ?? `GitHub request failed (${response.status}).`);
      setActivity(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load repository activity.');
    }
  }, []);

  if (loading) {
    return <p className="p-4 font-mono text-xs text-mist">Loading repositories…</p>;
  }

  if (error && repos.length === 0) {
    return (
      <div className="space-y-2 p-4">
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">{error}</p>
        <p className="text-xs leading-relaxed text-mist">
          Create a fine-grained personal access token with read access to the repositories you want
          to watch and set it as <span className="font-mono text-chrome">GITHUB_TOKEN</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="w-2/5 min-w-[11rem] shrink-0 overflow-y-auto border-r border-edge/60">
        <p className="neo-label sticky top-0 z-10 border-b border-edge/60 bg-abyss/90 px-3 py-2 backdrop-blur">
          {viewer ? `@${viewer.login}` : 'Repositories'}
        </p>
        <ul className="divide-y divide-edge/40">
          {repos.map((repo) => (
            <li key={repo.fullName}>
              <button
                type="button"
                onClick={() => void loadActivity(repo.fullName)}
                className={cn(
                  'w-full px-3 py-2 text-left transition',
                  selected === repo.fullName ? 'bg-neo/10' : 'hover:bg-edge/25',
                )}
              >
                <p className="truncate text-xs text-chrome">{repo.fullName.split('/')[1]}</p>
                <p className="truncate font-mono text-[10px] text-mist">
                  {repo.private ? 'private · ' : ''}
                  {repo.language ?? 'text'} · {formatRelativeTime(repo.pushedAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <p className="p-4 text-xs text-mist">Pick a repository to see its live activity.</p>
        ) : (
          <>
            <div className="flex shrink-0 gap-1 border-b border-edge/60 bg-abyss/50 px-2 py-1.5">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={cn(
                    'rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition',
                    tab === entry.id ? 'bg-neo/15 text-neo' : 'text-mist hover:text-chrome',
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {error ? <p className="mb-2 text-xs text-alert">{error}</p> : null}
              {!activity ? (
                <p className="font-mono text-xs text-mist">Loading {selected}…</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {tab === 'commits' &&
                    activity.commits.map((commit) => (
                      <li key={commit.sha} className="flex gap-2">
                        <a
                          href={commit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 font-mono text-[11px] text-neo hover:underline"
                        >
                          {commit.sha}
                        </a>
                        <span className="truncate text-chrome/85">{commit.message}</span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-mist">
                          {commit.author}
                        </span>
                      </li>
                    ))}

                  {tab === 'pulls' &&
                    (activity.pulls.length === 0 ? (
                      <li className="text-mist">No open pull requests.</li>
                    ) : (
                      activity.pulls.map((pull) => (
                        <li key={pull.number} className="flex gap-2">
                          <a
                            href={pull.url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 font-mono text-[11px] text-neo hover:underline"
                          >
                            #{pull.number}
                          </a>
                          <span className="truncate text-chrome/85">{pull.title}</span>
                          {pull.draft ? (
                            <span className="shrink-0 rounded border border-mist/40 px-1 font-mono text-[9px] text-mist">
                              draft
                            </span>
                          ) : null}
                        </li>
                      ))
                    ))}

                  {tab === 'issues' &&
                    (activity.issues.length === 0 ? (
                      <li className="text-mist">No open issues.</li>
                    ) : (
                      activity.issues.map((issue) => (
                        <li key={issue.number} className="flex gap-2">
                          <a
                            href={issue.url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 font-mono text-[11px] text-neo hover:underline"
                          >
                            #{issue.number}
                          </a>
                          <span className="truncate text-chrome/85">{issue.title}</span>
                        </li>
                      ))
                    ))}

                  {tab === 'runs' &&
                    (activity.runs.length === 0 ? (
                      <li className="text-mist">No workflow runs.</li>
                    ) : (
                      activity.runs.map((run) => (
                        <li key={run.id} className="flex items-center gap-2">
                          <span
                            className={cn(
                              'shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase',
                              conclusionTone(run),
                            )}
                          >
                            {run.status === 'completed' ? (run.conclusion ?? 'done') : run.status}
                          </span>
                          <a
                            href={run.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-chrome/85 hover:underline"
                          >
                            {run.name}
                          </a>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-mist">
                            {run.branch}
                          </span>
                        </li>
                      ))
                    ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
