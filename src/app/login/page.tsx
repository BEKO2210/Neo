import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';
import { AuthShell } from '@/components/auth/AuthShell';
import { CredentialsForm } from '@/components/auth/CredentialsForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/command');

  const configured = Boolean(env.sessionSecret && env.sessionSecret.length >= 32);
  const signupOpen = Boolean(env.signupCode);
  const durable = getStore().kind === 'supabase';

  return (
    <AuthShell title="Sign in" subtitle="Command Center">
      {configured ? (
        <>
          <CredentialsForm mode="login" />
          <p className="mt-6 text-center text-xs text-mist">
            {signupOpen ? (
              <>
                No account yet?{' '}
                <Link href="/signup" className="text-neo hover:underline">
                  Create one
                </Link>
              </>
            ) : (
              'Signup is closed on this deployment.'
            )}
          </p>
          {!durable ? (
            <p className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-[11px] leading-relaxed text-warn">
              No database is configured. Accounts live in memory and disappear when the server
              restarts — fine for a local try-out, not for anything real.
            </p>
          ) : null}
        </>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-warn">
            Neo is not configured yet. Set this environment variable, then redeploy.
          </p>
          <p className="font-mono text-xs text-mist">
            <span className="text-chrome">NEO_SESSION_SECRET</span> — 32+ random characters.
            Generate one with <span className="text-neo">openssl rand -base64 48</span>.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
