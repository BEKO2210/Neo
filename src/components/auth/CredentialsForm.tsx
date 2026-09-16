'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface CredentialsFormProps {
  mode: 'login' | 'signup';
}

/** Sign-in and sign-up share one form; signup additionally asks for the invite code. */
export function CredentialsForm({ mode }: CredentialsFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(isSignup ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(isSignup ? { email, password, inviteCode } : { email, password }),
      });
      if (response.ok) {
        router.replace('/command');
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? `Request failed (${response.status}).`);
    } catch {
      setError('Network error. Is the server reachable?');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && (!isSignup || inviteCode.trim().length > 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="neo-label mb-2 block">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-edge bg-abyss px-3 py-2.5 font-mono text-sm text-chrome placeholder:text-mist/50"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="neo-label mb-2 block">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-edge bg-abyss px-3 py-2.5 font-mono text-sm text-chrome placeholder:text-mist/50"
          placeholder="••••••••••••"
        />
        {isSignup ? (
          <p className="mt-1.5 text-[11px] text-mist">
            At least 10 characters, with a letter and a digit.
          </p>
        ) : null}
      </div>

      {isSignup ? (
        <div>
          <label htmlFor="invite" className="neo-label mb-2 block">
            Invite code
          </label>
          <input
            id="invite"
            type="text"
            required
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            className="w-full rounded-lg border border-edge bg-abyss px-3 py-2.5 font-mono text-sm text-chrome placeholder:text-mist/50"
            placeholder="from the operator"
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-alert/40 bg-alert/10 p-2.5 text-xs text-alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !canSubmit}
        className="w-full rounded-lg border border-neo/50 bg-neo/10 px-4 py-2.5 font-mono text-sm tracking-[0.2em] text-neo transition hover:bg-neo/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'WORKING' : isSignup ? 'CREATE ACCOUNT' : 'CONNECT'}
      </button>
    </form>
  );
}
