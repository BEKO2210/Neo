import type { ReactNode } from 'react';

/** Shared frame for the sign-in and sign-up pages. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
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
        <div className="mb-7 flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl border border-neo/40 bg-neo/10 font-mono text-lg font-bold text-neo"
            aria-hidden
          >
            N
          </span>
          <div>
            <h1 className="font-mono text-xl tracking-[0.3em] text-chrome">NEO</h1>
            <p className="neo-label mt-0.5">{subtitle}</p>
          </div>
          <span className="neo-label ml-auto">{title}</span>
        </div>
        {children}
      </div>
    </main>
  );
}
