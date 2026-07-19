import RealmOffice from '@/components/realm/RealmOffice';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { loadRealmCompanyModules } from '@/lib/realm-access';
import { createRealmErpBridge } from '@/lib/realm-business-bridge';
import { loadRealmPilotDecision } from '@/lib/realm-pilot';

export const metadata = {
  title: 'Realm Office · CRMegoric ERP',
  description: 'Không gian làm việc medieval dùng chung tài khoản, dữ liệu và phân quyền với CRMegoric ERP · CRM.',
};

export default async function RealmPage() {
  const user = await currentUser();
  // App Router có thể render layout và page song song. Không chạm Prisma từ
  // page con khi layout sắp redirect anonymous request về /login.
  if (!user) return null;
  const [modules, pilot] = await Promise.all([
    loadRealmCompanyModules(prisma),
    loadRealmPilotDecision(prisma, user),
  ]);
  if (!pilot.allowed) redirect(`/dashboard?realm=${encodeURIComponent(pilot.code)}`);
  const initialBridge = createRealmErpBridge({
    user,
    modules,
    tasks: [],
    sourceOfTruth: 'erp-session',
  });
  return (
    <RealmOffice
      erpHref="/dashboard"
      workspaceLabel="ERP · CRM companion"
      initialBridge={initialBridge}
    />
  );
}
