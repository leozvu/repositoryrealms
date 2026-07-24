// v3.40 — PORTAL: CEO quản lý liên kết "một người ↔ nhiều công ty".
// GET danh sách · POST thêm/cập nhật · DELETE gỡ (chỉ Giám đốc trên portal).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { isDirector } from '@/lib/perm';
import { CeoStaffError, normalizePersonKey } from '@/lib/ceo-staff-bridge';
import { listStaffLinks, upsertStaffLink } from '@/lib/ceo-staff-bridge-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

async function director() {
  const user = await currentUser();
  if (!user) return { response: NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers }) };
  if (!isDirector(user)) return { response: NextResponse.json({ error: 'forbidden', code: 'ceo_staff_director_required' }, { status: 403, headers }) };
  return { user };
}

const fail = (error) => NextResponse.json(
  { error: error instanceof CeoStaffError ? error.message : 'Không thao tác được liên kết nhân sự.', code: error?.code || 'ceo_staff_link_failed' },
  { status: error instanceof CeoStaffError ? error.status : 503, headers },
);

export async function GET(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  const person = request.nextUrl.searchParams.get('person');
  try {
    return NextResponse.json({ links: await listStaffLinks(prisma, person || null) }, { headers });
  } catch (error) { return fail(error); }
}

export async function POST(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const link = await upsertStaffLink(prisma, {
      personEmail: body.personEmail,
      entityId: String(body.entityId || '').trim().toLowerCase(),
      localUserEmail: body.localUserEmail,
      localRole: String(body.localRole || 'STAFF').toUpperCase().slice(0, 20),
    });
    await prisma.auditLog.create({ data: {
      userId: auth.user.id, userName: auth.user.name, action: 'ceo_staff_link_upserted',
      entity: 'ceo_staff_link', refId: link.id, detail: `${link.personKey} @ ${link.entityId}`,
    } }).catch(() => {});
    return NextResponse.json({ link }, { headers });
  } catch (error) { return fail(error); }
}

export async function DELETE(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  try {
    const personKey = normalizePersonKey(request.nextUrl.searchParams.get('person'));
    const entityId = String(request.nextUrl.searchParams.get('entity') || '').trim().toLowerCase();
    await prisma.ceoStaffLink.deleteMany({ where: { personKey, entityId } });
    await prisma.auditLog.create({ data: {
      userId: auth.user.id, userName: auth.user.name, action: 'ceo_staff_link_removed',
      entity: 'ceo_staff_link', refId: `${personKey}@${entityId}`, detail: 'Gỡ liên kết nhân sự',
    } }).catch(() => {});
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return fail(error); }
}
