import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isFreelancer } from '@/lib/perm';
import { todayISO, daysFromNow, nextCode } from '@/lib/format';

// v3.13: Xuất hóa đơn từ giờ công đã log.
// Trước đây TimeLog.billable được ghi nhận và hiển thị ở Bảng chấm giờ nhưng KHÔNG chỗ nào
// đọc — muốn xuất hóa đơn theo giờ thì phải gõ tay lại từng dòng. Đây là chỗ đứt của chuỗi
// báo giá → dự án → việc → giờ công → hóa đơn → tiền.
//
// GET  ?projectId=...  → xem trước: giờ chưa xuất, gộp theo người
// POST {projectId, rate, dueDays, note} → tạo hóa đơn + đánh dấu giờ đã xuất (nguyên tử)

const canBill = user => !isFreelancer(user) && hasAny(user, ['ACCOUNTANT', 'AM']);

// Giờ đủ điều kiện xuất: đúng dự án, có tính phí, và CHƯA nằm trong hóa đơn nào
const unbilledWhere = projectId => ({ projectId, billable: true, invoiceId: null });

async function preview(projectId) {
  const logs = await prisma.timeLog.findMany({
    where: unbilledWhere(projectId),
    include: { user: { select: { id: true, name: true } } },
  });
  const by = {};
  for (const l of logs) {
    const k = l.userId;
    (by[k] ||= { userId: k, name: l.user?.name || 'Không rõ', hours: 0 }).hours += l.hours || 0;
  }
  const lines = Object.values(by)
    .map(x => ({ ...x, hours: Math.round(x.hours * 10) / 10 }))
    .filter(x => x.hours > 0)
    .sort((a, b) => b.hours - a.hours);
  return { lines, totalHours: Math.round(lines.reduce((s, x) => s + x.hours, 0) * 10) / 10, logCount: logs.length };
}

export async function GET(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!canBill(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const projectId = new URL(req.url).searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Thiếu projectId' }, { status: 400 });
  return NextResponse.json(await preview(projectId));
}

export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!canBill(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { projectId, rate, dueDays, note } = await req.json();
  const price = Math.round(+rate || 0);
  if (!projectId) return NextResponse.json({ error: 'Chưa chọn dự án' }, { status: 400 });
  if (price <= 0) return NextResponse.json({ error: 'Đơn giá giờ phải lớn hơn 0' }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: 'Không thấy dự án' }, { status: 404 });

  const { lines, totalHours } = await preview(projectId);
  if (!lines.length) {
    return NextResponse.json({ error: 'Dự án này không còn giờ nào chưa xuất hóa đơn' }, { status: 400 });
  }

  // Khóa chính xác những dòng giờ sắp xuất, để giữa lúc này và lúc ghi không ai log thêm
  // rồi bị đánh dấu oan là "đã xuất".
  const logIds = (await prisma.timeLog.findMany({ where: unbilledWhere(projectId), select: { id: true } })).map(l => l.id);

  const s = await prisma.setting.findUnique({ where: { id: 1 } });
  let vat = 8;
  try { vat = +JSON.parse(s?.json || '{}').vat ?? 8; } catch { vat = 8; }

  // Dùng chung nextCode với giao diện: lấy MAX số đuôi trên toàn bộ hóa đơn.
  // (Sort chuỗi theo code là sai — dữ liệu thật còn mã "INV-CU-003" nhập từ bản cũ,
  // "CU" > "2026" nên sẽ sinh trùng mã đã tồn tại.)
  const all = await prisma.invoice.findMany({ select: { code: true } });
  let prefix = 'INV';
  try { prefix = JSON.parse(s?.json || '{}').invoicePrefix || 'INV'; } catch { prefix = 'INV'; }
  const code = nextCode(prefix, all);

  const items = lines.map(l => ({
    desc: `Giờ công ${l.name} — ${project.name}`,
    qty: l.hours,
    price,
  }));

  const [invoice] = await prisma.$transaction([
    prisma.invoice.create({
      data: {
        code, clientId: project.clientId, projectId,
        items: JSON.stringify(items), vat, status: 'draft',
        date: todayISO(), dueDate: daysFromNow(+dueDays || 15),
        payments: '[]', recurring: false,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id, userName: user.name, action: 'create', entity: 'invoices',
        detail: `${code}: xuất từ ${totalHours}h giờ công dự án "${project.name}"${note ? ' — ' + note : ''}`,
      },
    }),
  ]);
  // Đánh dấu sau khi có id hóa đơn — nếu bước này hỏng thì hóa đơn vẫn còn nhưng giờ chưa
  // bị khóa, an toàn hơn là ngược lại (giờ bị khóa mà không có hóa đơn nào để đối chiếu).
  await prisma.timeLog.updateMany({ where: { id: { in: logIds } }, data: { invoiceId: invoice.id } });

  return NextResponse.json({ ...invoice, _hours: totalHours, _people: lines.length });
}
