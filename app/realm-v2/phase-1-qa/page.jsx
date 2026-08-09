import { notFound } from 'next/navigation';
import RealmV2ApplicationShell from '@/components/realm-v2/RealmV2ApplicationShell';
import CanonicalRealmScreen from '@/components/realm-v2/CanonicalRealmScreens';

export const dynamic = 'force-dynamic';

export default async function RealmV2Phase1QaPage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const query = await searchParams;
  const slug = query?.screen === 'my-work' ? 'my-work' : 'home';
  const user = { id: 'phase-1-qa', name: 'Realm QA', email: 'qa@example.invalid', role: 'STAFF', roles: ['STAFF'], userType: 'employee' };
  const pilot = { allowed: true, config: { features: { office: true, tavern: true, feedback: false } } };
  return <RealmV2ApplicationShell user={user} company="Realm Phase 1 QA" slug={slug} pilot={pilot}><CanonicalRealmScreen slug={slug}/></RealmV2ApplicationShell>;
}
