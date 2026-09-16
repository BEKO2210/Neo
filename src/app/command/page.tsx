import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { CommandCenter } from './command-center';

export const dynamic = 'force-dynamic';

export default async function CommandPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <CommandCenter email={session.email} />;
}
