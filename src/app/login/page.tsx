import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { featureMatrix } from '@/lib/env';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/command');

  const features = featureMatrix();
  const auth = features.find((feature) => feature.id === 'auth');
  const configured = auth?.enabled ?? false;
  const missing = features.filter((feature) => !feature.enabled);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="neo-grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[44rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-45 blur-[110px]"
        style={{ background: 'radial-gradient(circle, #22d3ee 0%, #0e7490 35%, transparent 70%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[-10rem] left-[-6rem] h-[28rem] w-[28rem] rounded-full opacity-30 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)' }}
        aria-hidden
      />

      <div className="neo-panel neo-rise relative z-10 w-full max-w-md rounded-2xl p-8">
        <div className="mb-8 flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl border border-neo/40 bg-neo/10 font-mono text-lg font-bold text-neo"
            aria-hidden
          >
            N
          </span>
          <div>
            <h1 className="font-mono text-xl tracking-[0.3em] text-chrome">NEO</h1>
            <p className="neo-label mt-0.5">Command Center</p>
          </div>
        </div>

        {configured ? (
          <LoginForm />
        ) : (
          <div className="space-y-4 text-sm">
            <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-warn">
              Neo is not configured yet. Set these environment variables, then restart or redeploy.
            </p>
            <ol className="space-y-2 font-mono text-xs text-mist">
              <li>
                <span className="text-chrome">NEO_ACCESS_PASSWORD</span> — the password you will sign
                in with.
              </li>
              <li>
                <span className="text-chrome">NEO_SESSION_SECRET</span> — 32+ random characters.
                Generate one with <span className="text-neo">openssl rand -base64 48</span>.
              </li>
            </ol>
            <p className="text-xs text-mist">
              Everything else is optional. Neo starts with whatever you give it and shows the rest as
              offline.
            </p>
          </div>
        )}

        {missing.length > 0 && configured ? (
          <details className="mt-6 text-xs text-mist">
            <summary className="cursor-pointer select-none font-mono tracking-wider hover:text-chrome">
              {missing.length} optional integration{missing.length === 1 ? '' : 's'} not configured
            </summary>
            <ul className="mt-3 space-y-2">
              {missing.map((feature) => (
                <li key={feature.id}>
                  <span className="text-chrome">{feature.label}</span>
                  <span className="ml-2 font-mono text-[11px] text-neo">
                    {feature.envVars.join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </main>
  );
}
