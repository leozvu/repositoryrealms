import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';
import { computeLine } from '@/lib/payroll';
import { parseItems } from '@/lib/format';
import { goldBonusFor, goldPayoutSettings } from '@/lib/gold-payout';

const canManage = user => hasAny(user, ['HR', 'ACCOUNTANT']);

// v3.13: đọc Cài đặt để lấy hệ số OT + giờ vào ca chuẩn (dùng chung quy tắc đi muộn
// với trang Chấm công: checkIn > workStart là muộn)
async function shiftCfg() {
  const row = await prisma.setting.findUnique({ where: { id: 1 } });
  let s = {};
  try { s = row ? JSON.parse(row.json) : {}; } catch { s = {}; }
  return { otMultiplier: +s.otMultiplier || 1.5, workStart: s.workStart || '09:00' };
}

// v3.13: tổng hợp chấm công tháng theo từng người → giờ OT, số lần muộn, số ngày nghỉ
async function attendanceOf(month) {
  // v3.13: so sánh khoảng, KHÔNG dùng startsWith. startsWith dịch ra LIKE '2026-07%' mà
  // btree thường không phục vụ được LIKE (đã thử: planner vẫn Seq Scan dù có index).
  // Cột date là chuỗi 'YYYY-MM-DD' nên so sánh chuỗi = so sánh ngày, dùng được index.
  const rows = await prisma.attendance.findMany({
    where: { date: { gte: `${month}-01`, lte: `${month}-31` } },
  });
  const { workStart } = await shiftCfg();
  const by = {};
  for (const r of rows) {
    const a = (by[r.userId] ||= { otHours: 0, lateCount: 0, offDays: 0 });
    a.otHours += +r.otHours || 0;
    if (r.checkIn && r.checkIn > workStart) a.lateCount++;
    if (r.status === 'off') a.offDays++;
  }
  return by;
}

/* v3.41 (Chương 3): thưởng Gold tháng theo từng người.
   Trả {} khi công tắc goldPayoutEnabled tắt → bảng lương y hệt như trước, không rủi ro. */
async function goldBonusOf(month) {
  const row = await prisma.setting.findUnique({ where: { id: 1 } });
  let settings = {};
  try { settings = row ? JSON.parse(row.json) : {}; } catch { settings = {}; }
  if (!goldPayoutSettings(settings).enabled) return {};
  // chỉ tính Gold KIẾM ĐƯỢC trong tháng; Gold tiêu ở Tavern không trừ vào thưởng
  const entries = await prisma.realmGoldEntry.findMany({
    where: {
      amount: { gt: 0 },
      createdAt: { gte: new Date(`${month}-01T00:00:00.000Z`), lt: new Date(`${month}-31T23:59:59.999Z`) },
    },
    select: { userId: true, amount: true },
  });
  const earned = {};
  for (const entry of entries) earned[entry.userId] = (earned[entry.userId] || 0) + entry.amount;
  const result = {};
  for (const [userId, gold] of Object.entries(earned)) result[userId] = goldBonusFor(gold, settings);
  return result;
}

// GET: HR/Kế toán/GĐ thấy toàn bộ; nhân viên chỉ nhận phiếu lương của mình
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const rows = await prisma.payroll.findMany({ orderBy: { month: 'desc' } });
  if (canManage(user)) return NextResponse.json({ manage: true, payrolls: rows });
  const mine = rows
    .map(p => ({ id: p.id, month: p.month, status: p.status, line: parseItems(p.lines).find(l => l.userId === user.id) }))
    .filter(p => p.line);
  return NextResponse.json({ manage: false, payslips: mine });
}

// POST {month}: tạo bảng lương nháp từ danh sách nhân sự đang hoạt động
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!canManage(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { month } = await req.json();
  if (!/^\d{4}-\d{2}$/.test(month || '')) return NextResponse.json({ error: 'Tháng không hợp lệ' }, { status: 400 });
  const exists = await prisma.payroll.findUnique({ where: { month } });
  if (exists) return NextResponse.json({ error: `Bảng lương tháng ${month.slice(5)}/${month.slice(0, 4)} đã tồn tại` }, { status: 400 });
  // v3.13: chỉ nhân viên — freelancer trả theo phiếu payout riêng, không nằm trong bảng lương
  const staff = await prisma.user.findMany({
    where: { status: 'active', userType: { not: 'freelancer' } },
    orderBy: { name: 'asc' },
  });
  const { otMultiplier } = await shiftCfg();
  const att = await attendanceOf(month); // v3.13: giờ OT/đi muộn/nghỉ lấy thẳng từ chấm công
  const goldBonus = await goldBonusOf(month); // v3.41: thưởng Gold (rỗng khi công tắc tắt)
  const lines = staff.map(s => {
    const gold = goldBonus[s.id] || { gold: 0, amount: 0 };
    return computeLine({
      userId: s.id, name: s.name, base: s.salary || 0, allowance: 0, bonus: gold.amount,
      goldEarned: gold.gold, goldBonus: gold.amount, // hiện trên phiếu để nhân sự đối chiếu
      ...(att[s.id] || { otHours: 0, lateCount: 0, offDays: 0 }),
    }, otMultiplier);
  });
  const row = await prisma.payroll.create({ data: { month, lines: JSON.stringify(lines) } });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'create', entity: 'payroll', refId: row.id, detail: 'Bảng lương ' + month } });
  return NextResponse.json(row);
}

// PUT {id, lines}: sửa phụ cấp/thưởng khi còn nháp — server tính lại toàn bộ
export async function PUT(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!canManage(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id, lines, regenerate } = await req.json();
  const p = await prisma.payroll.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (p.status === 'final') return NextResponse.json({ error: 'Bảng lương đã chốt — không sửa được' }, { status: 400 });
  const { otMultiplier } = await shiftCfg();

  // v3.13: "Tính lại từ chấm công". Từ khi lương ăn theo chấm công, bảng tạo giữa tháng
  // sẽ thiếu OT của những ngày sau đó — mà tạo lại thì báo "đã tồn tại" và không có nút xóa.
  // Nút này nạp lại giờ OT/đi muộn từ chấm công nhưng GIỮ NGUYÊN phụ cấp/thưởng HR đã nhập.
  if (regenerate) {
    const att = await attendanceOf(p.month);
    const gold = await goldBonusOf(p.month); // v3.41: nạp lại thưởng Gold cùng lúc với OT
    const old = parseItems(p.lines);
    const staff = await prisma.user.findMany({
      where: { status: 'active', userType: { not: 'freelancer' } }, orderBy: { name: 'asc' },
    });
    const fresh = staff.map(s => {
      const prev = old.find(l => l.userId === s.id) || {};
      const g = gold[s.id] || { gold: 0, amount: 0 };
      // thưởng tay HR nhập thêm = bonus cũ trừ phần Gold lần trước → cộng lại Gold mới
      const manualBonus = Math.max(0, (prev.bonus || 0) - (prev.goldBonus || 0));
      return computeLine({
        userId: s.id, name: s.name, base: s.salary || 0,
        allowance: prev.allowance || 0, bonus: manualBonus + g.amount,
        goldEarned: g.gold, goldBonus: g.amount,
        ...(att[s.id] || { otHours: 0, lateCount: 0, offDays: 0 }),
      }, otMultiplier);
    });
    const row = await prisma.payroll.update({ where: { id }, data: { lines: JSON.stringify(fresh) } });
    await prisma.auditLog.create({
      data: { userId: user.id, userName: user.name, action: 'update', entity: 'payroll', refId: id, detail: `Tính lại bảng lương ${p.month} từ chấm công` },
    }).catch(() => {});
    return NextResponse.json(row);
  }

  // v3.13: HR sửa được giờ OT nếu chấm công sai. Giữ nguyên otRate đã chốt lúc tạo bảng
  // (computeLine ưu tiên l.otRate) để đổi hệ số trong Cài đặt không âm thầm sửa bảng cũ.
  const computed = (lines || []).map(l => computeLine(l, otMultiplier));
  const row = await prisma.payroll.update({ where: { id }, data: { lines: JSON.stringify(computed) } });
  return NextResponse.json(row);
}
