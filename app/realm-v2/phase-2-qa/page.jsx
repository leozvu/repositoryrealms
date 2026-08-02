import { notFound } from 'next/navigation';
import RealmV2ApplicationShell from '@/components/realm-v2/RealmV2ApplicationShell';
import CanonicalRealmOperationsScreen from '@/components/realm-v2/CanonicalRealmOperationsScreens';

export const dynamic = 'force-dynamic';

export default async function RealmV2Phase2QaPage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const query = await searchParams;
  const slug = query?.screen === 'action-center' ? 'action-center' : 'work-management';
  const user = { id: 'phase-2-qa', name: 'Realm Operations QA', email: 'qa@example.invalid', role: 'PM', roles: ['PM'], userType: 'employee' };
  const pilot = { allowed: true, config: { features: { office: true, tavern: true, feedback: false } } };
  return <RealmV2ApplicationShell user={user} company="Realm Phase 2 QA" slug={slug} pilot={pilot}><CanonicalRealmOperationsScreen slug={slug}/></RealmV2ApplicationShell>;
}
