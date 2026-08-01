import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Shell from '@/components/Shell';
import { parseRealmPilotConfig, realmPilotDecision } from '@/lib/realm-pilot';
import { realmV2PreviewEnabled } from '@/lib/realm-v2-contracts';
import { ceoPortalOrigin, deploymentBranding, isCeoPortalDeployment } from '@/lib/deployment-profile';

export default async function AppLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const ceoPortal = isCeoPortalDeployment();
  const deploymentBrand = deploymentBranding();
  const v2Enabled = ceoPortal || realmV2PreviewEnabled();
  let company = ceoPortal ? deploymentBrand.company : 'Agency ERP';
  let realmPilot = realmPilotDecision(user, null);
  try {
    const [row, profile] = await Promise.all([
      prisma.setting.findUnique({ where: { id: 1 } }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, role: true, roles: true, status: true, userType: true, workspacePreference: true },
      }),
    ]);
    if (row && !ceoPortal) company = JSON.parse(row.json).company || company;
    const policy = parseRealmPilotConfig(row?.json);
    realmPilot = profile?.status === 'active'
      ? realmPilotDecision(profile, policy, profile.workspacePreference)
      : { ...realmPilotDecision(null, policy), code: 'inactive_user', reason: 'Tài khoản không còn hoạt động.' };
  } catch {}
  return (
    <Shell
      user={user}
      company={company}
      realmPilot={realmPilot}
      realmV2Theme={v2Enabled}
      realmV2Available={!ceoPortal && realmV2PreviewEnabled()}
      ceoPortal={ceoPortal}
      ceoPortalOrigin={ceoPortalOrigin()}
    >
      {children}
    </Shell>
  );
}
