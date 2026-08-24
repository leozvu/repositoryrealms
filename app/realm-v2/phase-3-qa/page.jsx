import { notFound } from 'next/navigation';
import RealmV2ApplicationShell from '@/components/realm-v2/RealmV2ApplicationShell';
import CanonicalRealmGovernanceScreen from '@/components/realm-v2/CanonicalRealmGovernanceScreens';

export const dynamic = 'force-dynamic';

export default async function RealmV2Phase3QaPage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const query = await searchParams;
  const slug = query?.screen === 'approvals' ? 'approvals' : 'command-center';
  const user = { id: 'phase-3-director', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', role: 'DIRECTOR', roles: ['DIRECTOR'], userType: 'employee' };
  const pilot = { allowed: true, config: { features: { office: true, tavern: true, feedback: false } } };
  return <RealmV2ApplicationShell user={user} company="Realm Phase 3 QA" slug={slug} pilot={pilot}><CanonicalRealmGovernanceScreen slug={slug} user={user}/></RealmV2ApplicationShell>;
}
