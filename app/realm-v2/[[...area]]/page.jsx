import { notFound, redirect } from 'next/navigation';
import { canonicalAreaHref, REALM_V2_AREAS, realmV2PreviewEnabled } from '@/lib/realm-v2-contracts';

export const dynamic = 'force-dynamic';

export default async function RealmV2Page({ params }) {
  if (!realmV2PreviewEnabled()) notFound();
  const resolved = await params;
  const segments = resolved?.area || [];
  if (!segments.length) redirect('/realm-v2/home');
  const slug = segments[0];
  if (segments.length > 1 || !REALM_V2_AREAS.some(area => area.slug === slug)) notFound();
  redirect(canonicalAreaHref(slug));
}
