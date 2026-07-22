import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  loadCollaborationContacts,
  requestCollaborationContact,
  respondCollaborationContact,
} from '@/lib/collaboration-admin';
import { collaborationError, collaborationJson } from '@/lib/collaboration-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return collaborationJson({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  try {
    return collaborationJson(await loadCollaborationContacts(prisma, user));
  } catch (error) {
    return collaborationError(error, 'Không thể tải lời mời cộng tác.');
  }
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return collaborationJson({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const result = await requestCollaborationContact(prisma, user, {
      ...body,
      idempotencyKey: request.headers.get('Idempotency-Key') || body.idempotencyKey,
    });
    return collaborationJson(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return collaborationError(error, 'Không thể gửi lời mời cộng tác.');
  }
}

export async function PATCH(request) {
  const user = await currentUser();
  if (!user) return collaborationJson({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  try {
    return collaborationJson(await respondCollaborationContact(prisma, user, await request.json()));
  } catch (error) {
    return collaborationError(error, 'Không thể phản hồi lời mời cộng tác.');
  }
}
