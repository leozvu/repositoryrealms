import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  heartbeatCollaborationPresence,
  leaveCollaborationPresence,
  loadCollaborationDirectory,
} from '@/lib/collaboration-admin';
import { collaborationError, collaborationJson } from '@/lib/collaboration-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return collaborationJson({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  try {
    return collaborationJson(await loadCollaborationDirectory(prisma, user));
  } catch (error) {
    return collaborationError(error, 'Không thể tải trạng thái đồng nghiệp.');
  }
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return collaborationJson({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    return collaborationJson(await heartbeatCollaborationPresence(prisma, user, body));
  } catch (error) {
    return collaborationError(error, 'Không thể cập nhật trạng thái hiện diện.');
  }
}

export async function DELETE(request) {
  const user = await currentUser();
  if (!user) return collaborationJson({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    return collaborationJson(await leaveCollaborationPresence(prisma, user, body));
  } catch (error) {
    return collaborationError(error, 'Không thể đóng phiên hiện diện.');
  }
}
