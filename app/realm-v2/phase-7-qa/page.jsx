import { notFound } from 'next/navigation';
import RealmV2ApplicationShell from '@/components/realm-v2/RealmV2ApplicationShell';
import CanonicalRealmPeopleRecognitionScreen from '@/components/realm-v2/CanonicalRealmPeopleRecognitionScreens';

export const dynamic = 'force-dynamic';

export default async function RealmV2Phase7QaPage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const query = await searchParams;
  const slug = query?.screen === 'recognition' ? 'recognition' : 'employee-profile';
  const user = { id: 'phase-7-user', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', role: 'DIRECTOR', roles: ['DIRECTOR'], userType: 'employee' };
  const pilot = { allowed: true, config: { features: { office: true, tavern: true, feedback: false } } };
  return <RealmV2ApplicationShell user={user} company="Realm Phase 7 QA" slug={slug} pilot={pilot}><CanonicalRealmPeopleRecognitionScreen slug={slug}/></RealmV2ApplicationShell>;
}
