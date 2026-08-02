import { notFound } from 'next/navigation';
import RealmV2ApplicationShell from '@/components/realm-v2/RealmV2ApplicationShell';
import CanonicalRealmExecutiveScreen from '@/components/realm-v2/CanonicalRealmExecutiveScreens';

export const dynamic = 'force-dynamic';

export default async function RealmV2Phase6QaPage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const query = await searchParams;
  const slug = query?.screen === 'ceo-terminal' ? 'ceo-terminal' : 'world-map';
  const user = { id: 'phase-6-director', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', role: 'DIRECTOR', roles: ['DIRECTOR'], userType: 'employee' };
  const pilot = { allowed: true, config: { features: { office: true, tavern: true, feedback: false } } };
  return <RealmV2ApplicationShell user={user} company="Realm Phase 6 QA" slug={slug} pilot={pilot}><CanonicalRealmExecutiveScreen slug={slug}/></RealmV2ApplicationShell>;
}
