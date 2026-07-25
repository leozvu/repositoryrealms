// v3.41 (Chương 1) — Vào ca / Tan ca đi qua route riêng để ghi được BẰNG CHỨNG NGỮ CẢNH.
// API generic /api/data/attendance không thấy request nên không lấy được IP; hành vi chấm
// công vì thế tách ra đây. Quy tắc siết do công ty chọn trong Cài đặt (xem lib/attendance-context).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { clientIpFrom, evaluateAttendanceContext } from '@/lib/attendance-context';
import { awardGoldForAttendance } from '@/lib/gold-earning-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const hhmm = (date) => {
  const vn = new Date(date.getTime() + 7 * 3600_000); // giờ VN
  return `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`;
};
const todayVN = (date) => new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = body.action === 'out' ? 'out' : 'in';
  const status = ['present', 'remote', 'off'].includes(body.status) ? body.status : 'present';

  const settingRow = await prisma.setting.findUnique({ where: { id: 1 } });
  const settings = settingRow ? JSON.parse(settingRow.json) : {};
  const context = evaluateAttendanceContext({ ip: clientIpFrom(request), settings, status });
  if (!context.allowed) {
    return NextResponse.json({ error: context.note, code: 'attendance_outside_office_network' }, { status: 403 });
  }

  const now = new Date();
  const date = todayVN(now);
  const time = hhmm(now);
  const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId: user.id, date } } });

  const data = action === 'in'
    ? { checkIn: existing?.checkIn || time, checkInIp: context.ip || null, checkInPlace: context.place, status }
    : { checkOut: time, checkOutIp: context.ip || null, checkOutPlace: context.place };
  if (context.note) data.contextNote = context.note;

  const row = existing
    ? await prisma.attendance.update({ where: { id: existing.id }, data })
    : await prisma.attendance.create({ data: { userId: user.id, date, status, ...data } });

  await prisma.auditLog.create({ data: {
    userId: user.id, userName: user.name,
    action: action === 'in' ? 'attendance_check_in' : 'attendance_check_out',
    entity: 'attendance', refId: row.id,
    detail: `${time} · ${context.place}${context.note ? ` · ${context.note}` : ''}`,
  } }).catch(() => {});

  // v3.41 (Chương 2): tan ca đủ giờ → tự cộng Gold ngày công. Lỗi Gold không chặn chấm công.
  let gold = null;
  if (action === 'out') {
    try { gold = await awardGoldForAttendance(row); } catch (error) { console.error('gold_award_attendance_failed', error?.code); }
  }

  return NextResponse.json({ ok: true, attendance: row, place: context.place, note: context.note, gold: gold?.awarded || 0 });
}
