import { notFound } from 'next/navigation';
import RealmV2ApplicationShell from '@/components/realm-v2/RealmV2ApplicationShell';
import CanonicalRealmCommunicationScreen from '@/components/realm-v2/CanonicalRealmCommunicationScreens';

export const dynamic = 'force-dynamic';

export default async function RealmV2Phase4QaPage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const query = await searchParams;
  const slug = query?.screen === 'collaboration' ? 'collaboration' : 'inbox';
  const user = { id: 'phase-4-user', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', role: 'DIRECTOR', roles: ['DIRECTOR'], userType: 'employee' };
  const pilot = { allowed: true, config: { features: { office: true, tavern: true, feedback: false } } };
  return <RealmV2ApplicationShell user={user} company="Realm Phase 4 QA" slug={slug} pilot={pilot}><CanonicalRealmCommunicationScreen slug={slug} user={user}/></RealmV2ApplicationShell>;
}
