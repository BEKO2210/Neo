'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        router.replace('/command');
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setError(
        response.status === 401
          ? 'Wrong password.'
          : (body.message ?? `Sign-in failed (${response.status}).`),
      );
    } catch {
      setError('Network error. Is the server reachable?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="neo-label mb-2 block">
          Access key
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-edge bg-abyss px-3 py-2.5 font-mono text-sm text-chrome placeholder:text-mist/50"
          placeholder="••••••••••••"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-alert/40 bg-alert/10 p-2.5 text-xs text-alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="relative w-full overflow-hidden rounded-lg border border-neo/50 bg-neo/10 px-4 py-2.5 font-mono text-sm tracking-[0.2em] text-neo transition hover:bg-neo/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'AUTHENTICATING' : 'CONNECT'}
      </button>
    </form>
  );
}
