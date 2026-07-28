import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { usersWithRole, notify } from '@/lib/events';
import { createRealmLaunchApproval, listRealmLaunchApprovals } from '@/lib/realm-launch-approval';
import { realmLaunchSecret } from '@/lib/realm-launch-token';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { notificationRecordRoute } from '@/lib/notification-inbox';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authenticatedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  return user;
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.launch.approvals', operation: 'launch.approvals.read' });
  try {
    const user = await authenticatedUser();
    const result = await listRealmLaunchApprovals(prisma, user, { secret: realmLaunchSecret() });
    return realmJsonResponse(trace, { source: 'erp', ...result }, { code: 'realm_launch_approvals_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải bàn duyệt phát hành Realm.',
      fallbackCode: 'realm_launch_approvals_error',
    });
  }
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.launch.approvals', operation: 'launch.approval.create' });
  try {
    const user = await authenticatedUser();
    const body = await request.json().catch(() => ({}));
    const approval = await createRealmLaunchApproval(prisma, user, body.policy, {
      token: body.launchPreviewToken,
      secret: realmLaunchSecret(),
    });
    const directors = await usersWithRole('DIRECTOR');
    await notify(
      directors.map((director) => director.id).filter((id) => id !== user.id),
      `${user.name || 'Một Director'} đề nghị mở rộng Realm. Cần Director thứ hai phê duyệt.`,
      notificationRecordRoute('approvals', approval.id),
    );
    await safelyPublishRealmChange(prisma, {
      resource: 'approvals', action: 'create', entityId: approval.id, actorId: user.id,
    });
    return realmJsonResponse(trace, { ok: true, approval }, { code: 'realm_launch_approval_created', status: 201 });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể gửi yêu cầu mở rộng Realm.',
      fallbackCode: 'realm_launch_approval_create_error',
    });
  }
}
