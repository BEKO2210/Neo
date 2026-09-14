import { getSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = await getSession();
  return Response.json({ authenticated: Boolean(session), operator: session?.operator ?? null });
}
