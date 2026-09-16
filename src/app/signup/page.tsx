import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { AuthShell } from '@/components/auth/AuthShell';
import { CredentialsForm } from '@/components/auth/CredentialsForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (await getSession()) redirect('/command');

  const configured = Boolean(env.sessionSecret && env.sessionSecret.length >= 32);
  const open = Boolean(env.signupCode);

  return (
    <AuthShell title="Create account" subtitle="Command Center">
      {configured && open ? (
        <>
          <CredentialsForm mode="signup" />
          <p className="mt-6 text-center text-xs text-mist">
            Already have an account?{' '}
            <Link href="/login" className="text-neo hover:underline">
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-warn">
            {configured
              ? 'Signup is closed on this deployment.'
              : 'Neo is not configured yet.'}
          </p>
          <p className="text-xs leading-relaxed text-mist">
            {configured
              ? 'The operator opens signup by setting NEO_SIGNUP_CODE and sharing the invite code.'
              : 'Set NEO_SESSION_SECRET (32+ characters), then redeploy.'}
          </p>
          <p className="text-center">
            <Link href="/login" className="text-xs text-neo hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      )}
    </AuthShell>
  );
}
