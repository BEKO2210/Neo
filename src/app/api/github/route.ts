import { requireSession } from '@/lib/auth/session';
import { GitHubClient } from '@/lib/github/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export async function GET(request: Request): Promise<Response> {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  if (!GitHubClient.isConfigured()) {
    return Response.json(
      {
        error: 'not_configured',
        message: 'Set GITHUB_TOKEN to let Neo read your repositories.',
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'repos';
  const repo = url.searchParams.get('repo') ?? '';
  const client = GitHubClient.fromEnv();

  try {
    if (action === 'repos') {
      const [viewer, repos] = await Promise.all([
        client.viewer(request.signal).catch(() => null),
        client.listRepos(30, request.signal),
      ]);
      return Response.json({ viewer, repos });
    }

    if (action === 'activity') {
      if (!REPO_PATTERN.test(repo)) {
        return Response.json(
          { error: 'bad_request', message: 'repo must look like "owner/name"' },
          { status: 400 },
        );
      }
      const [commits, pulls, issues, runs] = await Promise.all([
        client.listCommits(repo, 10, request.signal),
        client.listPulls(repo, 15, request.signal),
        client.listIssues(repo, 15, request.signal),
        client.listWorkflowRuns(repo, 10, request.signal),
      ]);
      return Response.json({ repo, commits, pulls, issues, runs });
    }

    return Response.json({ error: 'bad_request', message: `unknown action "${action}"` }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: 'github_error', message: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
