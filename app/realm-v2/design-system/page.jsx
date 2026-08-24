import { notFound } from 'next/navigation';
import RealmV2Shell from '@/components/realm-v2/RealmV2Shell';
import DesignSystemGallery from '@/components/realm-v2/DesignSystemGallery';
import { realmV2PreviewEnabled } from '@/lib/realm-v2-contracts';

export const dynamic = 'force-dynamic';

export default function RealmV2DesignSystemPage() {
  if (!realmV2PreviewEnabled()) notFound();
  return <RealmV2Shell slug="design-system"><DesignSystemGallery/></RealmV2Shell>;
}
