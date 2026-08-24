import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import RealmV2ApplicationShell from '@/components/realm-v2/RealmV2ApplicationShell';
import CanonicalRealmScreen from '@/components/realm-v2/CanonicalRealmScreens';
import CanonicalRealmOperationsScreen from '@/components/realm-v2/CanonicalRealmOperationsScreens';
import CanonicalRealmGovernanceScreen from '@/components/realm-v2/CanonicalRealmGovernanceScreens';
import CanonicalRealmCommunicationScreen from '@/components/realm-v2/CanonicalRealmCommunicationScreens';
import CanonicalRealmProjectChronicleScreen from '@/components/realm-v2/CanonicalRealmProjectChronicleScreens';
import CanonicalRealmExecutiveScreen from '@/components/realm-v2/CanonicalRealmExecutiveScreens';
import CanonicalRealmPeopleRecognitionScreen from '@/components/realm-v2/CanonicalRealmPeopleRecognitionScreens';
import CanonicalRealmExperienceScreen from '@/components/realm-v2/CanonicalRealmExperienceScreens';
import { REALM_V2_AREAS, realmV2PreviewEnabled } from '@/lib/realm-v2-contracts';
import { parseRealmPilotConfig, realmPilotDecision } from '@/lib/realm-pilot';
import { isDirector } from '@/lib/perm';

export const dynamic = 'force-dynamic';

export default async function RealmV2Page({ params }) {
  if (!realmV2PreviewEnabled()) notFound();
  const resolved = await params;
  const segments = resolved?.area || [];
  if (!segments.length) redirect('/realm-v2/home');
  const slug = segments[0];
  if (segments.length > 1 || !REALM_V2_AREAS.some(area => area.slug === slug)) notFound();
  if (REALM_V2_AREAS.some(area => area.slug === slug)) {
    const user = await currentUser();
    if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/realm-v2/${slug}`)}`);
    let company = 'Agency ERP';
    let pilot = realmPilotDecision(user, null);
    try {
      const row = await prisma.setting.findUnique({ where: { id: 1 } });
      const setting = row?.json ? JSON.parse(row.json) : {};
      company = setting.company || company;
      pilot = realmPilotDecision(user, parseRealmPilotConfig(row?.json), user.workspacePreference);
    } catch {}
    if (!pilot.allowed) redirect('/dashboard');
    if (['world-map', 'ceo-terminal'].includes(slug) && !isDirector(user)) redirect('/dashboard');
    const screen = ['notifications', 'search', 'settings', 'mobile'].includes(slug)
      ? <CanonicalRealmExperienceScreen slug={slug} user={user}/>
      : ['employee-profile', 'recognition'].includes(slug)
      ? <CanonicalRealmPeopleRecognitionScreen slug={slug}/>
      : ['world-map', 'ceo-terminal'].includes(slug)
      ? <CanonicalRealmExecutiveScreen slug={slug}/>
      : ['projects', 'chronicle'].includes(slug)
      ? <CanonicalRealmProjectChronicleScreen slug={slug} user={user}/>
      : ['inbox', 'collaboration'].includes(slug)
        ? <CanonicalRealmCommunicationScreen slug={slug} user={user}/>
        : ['command-center', 'approvals'].includes(slug)
          ? <CanonicalRealmGovernanceScreen slug={slug} user={user}/>
          : ['work-management', 'action-center'].includes(slug)
            ? <CanonicalRealmOperationsScreen slug={slug}/>
            : <CanonicalRealmScreen slug={slug}/>;
    return <RealmV2ApplicationShell user={user} company={company} slug={slug} pilot={pilot}>{screen}</RealmV2ApplicationShell>;
  }
  notFound();
}
