import { notFound } from 'next/navigation';
import RealmV2ApplicationShell from '@/components/realm-v2/RealmV2ApplicationShell';
import CanonicalRealmExperienceScreen from '@/components/realm-v2/CanonicalRealmExperienceScreens';

export const dynamic = 'force-dynamic';

const SCREENS = new Set(['notifications', 'search', 'settings', 'mobile']);

export default async function RealmV2Phase8QaPage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const query = await searchParams;
  const slug = SCREENS.has(query?.screen) ? query.screen : 'notifications';
  const user = { id: 'phase-8-user', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', role: 'DIRECTOR', roles: ['DIRECTOR'], userType: 'employee' };
  const pilot = { allowed: true, preference: 'realm', config: { features: { office: true, tavern: true, feedback: false } } };
  return <RealmV2ApplicationShell user={user} company="Realm Phase 8 QA" slug={slug} pilot={pilot}><CanonicalRealmExperienceScreen slug={slug} user={user}/></RealmV2ApplicationShell>;
}
