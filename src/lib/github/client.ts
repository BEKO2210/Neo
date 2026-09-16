import { env } from '@/lib/env';

const API_BASE = 'https://api.github.com';

export interface RepoSummary {
  fullName: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stars: number;
  openIssues: number;
  defaultBranch: string;
  pushedAt: string;
  url: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface PullSummary {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  author: string;
  url: string;
  updatedAt: string;
}

export interface IssueSummary {
  number: number;
  title: string;
  state: string;
  author: string;
  labels: string[];
  url: string;
  updatedAt: string;
}

export interface WorkflowRunSummary {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  branch: string;
  event: string;
  url: string;
  createdAt: string;
}

export class GitHubNotConfiguredError extends Error {
  constructor() {
    super('No GitHub token is available. Store one in the Account panel, or set GITHUB_TOKEN.');
    this.name = 'GitHubNotConfiguredError';
  }
}

export class GitHubClient {
  constructor(private readonly token: string) {}

  /** Builds a client from a caller-supplied token; the account's, or the deployment's. */
  static from(token: string | undefined): GitHubClient {
    if (!token) throw new GitHubNotConfiguredError();
    return new GitHubClient(token);
  }

  private async request<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'neo-command-center',
      },
      signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub ${response.status} on ${path}: ${body.slice(0, 240)}`);
    }
    return (await response.json()) as T;
  }

  async viewer(signal?: AbortSignal): Promise<{ login: string; name: string | null }> {
    const user = await this.request<{ login: string; name: string | null }>('/user', signal);
    return { login: user.login, name: user.name };
  }

  async listRepos(limit = 30, signal?: AbortSignal): Promise<RepoSummary[]> {
    const owner = env.githubOwner;
    const path = owner
      ? `/users/${encodeURIComponent(owner)}/repos?per_page=${limit}&sort=pushed`
      : `/user/repos?per_page=${limit}&sort=pushed&affiliation=owner,collaborator,organization_member`;
    const repos = await this.request<
      Array<{
        full_name: string;
        description: string | null;
        private: boolean;
        language: string | null;
        stargazers_count: number;
        open_issues_count: number;
        default_branch: string;
        pushed_at: string;
        html_url: string;
      }>
    >(path, signal);
    return repos.map((repo) => ({
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      language: repo.language,
      stars: repo.stargazers_count,
      openIssues: repo.open_issues_count,
      defaultBranch: repo.default_branch,
      pushedAt: repo.pushed_at,
      url: repo.html_url,
    }));
  }

  async listCommits(repo: string, limit = 10, signal?: AbortSignal): Promise<CommitSummary[]> {
    const commits = await this.request<
      Array<{
        sha: string;
        html_url: string;
        commit: { message: string; author: { name: string; date: string } | null };
        author: { login: string } | null;
      }>
    >(`/repos/${repo}/commits?per_page=${limit}`, signal);
    return commits.map((commit) => ({
      sha: commit.sha.slice(0, 7),
      message: commit.commit.message.split('\n')[0] ?? '',
      author: commit.author?.login ?? commit.commit.author?.name ?? 'unknown',
      date: commit.commit.author?.date ?? '',
      url: commit.html_url,
    }));
  }

  async listPulls(repo: string, limit = 20, signal?: AbortSignal): Promise<PullSummary[]> {
    const pulls = await this.request<
      Array<{
        number: number;
        title: string;
        state: string;
        draft: boolean;
        user: { login: string } | null;
        html_url: string;
        updated_at: string;
      }>
    >(`/repos/${repo}/pulls?state=open&per_page=${limit}`, signal);
    return pulls.map((pull) => ({
      number: pull.number,
      title: pull.title,
      state: pull.state,
      draft: pull.draft,
      author: pull.user?.login ?? 'unknown',
      url: pull.html_url,
      updatedAt: pull.updated_at,
    }));
  }

  async listIssues(repo: string, limit = 20, signal?: AbortSignal): Promise<IssueSummary[]> {
    const issues = await this.request<
      Array<{
        number: number;
        title: string;
        state: string;
        user: { login: string } | null;
        labels: Array<{ name: string } | string>;
        html_url: string;
        updated_at: string;
        pull_request?: unknown;
      }>
    >(`/repos/${repo}/issues?state=open&per_page=${limit}`, signal);
    return issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login ?? 'unknown',
        labels: issue.labels.map((label) => (typeof label === 'string' ? label : label.name)),
        url: issue.html_url,
        updatedAt: issue.updated_at,
      }));
  }

  async listWorkflowRuns(
    repo: string,
    limit = 10,
    signal?: AbortSignal,
  ): Promise<WorkflowRunSummary[]> {
    const body = await this.request<{
      workflow_runs?: Array<{
        id: number;
        name: string | null;
        status: string;
        conclusion: string | null;
        head_branch: string | null;
        event: string;
        html_url: string;
        created_at: string;
      }>;
    }>(`/repos/${repo}/actions/runs?per_page=${limit}`, signal);
    return (body.workflow_runs ?? []).map((run) => ({
      id: run.id,
      name: run.name ?? 'workflow',
      status: run.status,
      conclusion: run.conclusion,
      branch: run.head_branch ?? '',
      event: run.event,
      url: run.html_url,
      createdAt: run.created_at,
    }));
  }
}
