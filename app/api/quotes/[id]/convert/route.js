import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isFreelancer } from '@/lib/perm';
import { todayISO, daysFromNow, docGrand, nextCode } from '@/lib/format';

// v3.15: Chuyển báo giá đã chốt thành hóa đơn / dự án.
//
// Vì sao cần route riêng: trang Báo giá vẫn hiện 2 nút này cho AM (đúng — AM là người chốt
// deal), nhưng chúng gọi CRUD chung /api/data/invoices và /api/data/projects, mà
// invoices.write = ['ACCOUNTANT'] còn projects.write = ['PM'] → AM bấm là 403. Hai nút sinh ra
// cho AM nhưng chỉ Giám đốc dùng được, và không ai biết vì lỗi im lặng.
//
// Cách chữa: KHÔNG mở quyền ghi hóa đơn/dự án cho AM (làm vậy là AM tự xuất hóa đơn bất kỳ
// không qua Kế toán, tự mở dự án không qua PM). Chỉ mở đúng hành động "chuyển từ báo giá",
// đi qua cổng gác riêng — giống cách /api/invoices/from-hours đang làm.

const canConvert = user => !isFreelancer(user) && hasAny(user, ['AM', 'ACCOUNTANT', 'PM']);

export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!canConvert(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { to } = await req.json(); // 'invoice' | 'project'
  const quote = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!quote) return NextResponse.json({ error: 'Không thấy báo giá' }, { status: 404 });

  const s = await prisma.setting.findUnique({ where: { id: 1 } });
  let cfg = {};
  try { cfg = JSON.parse(s?.json || '{}'); } catch { cfg = {}; }

  if (to === 'project') {
    if (quote.projectId) {
      const cu = await prisma.project.findUnique({ where: { id: quote.projectId } });
      if (cu) return NextResponse.json({ error: `Báo giá này đã tạo dự án "${cu.name}" rồi` }, { status: 400 });
    }
    const project = await prisma.project.create({
      data: {
        name: 'Dự án từ ' + quote.code, clientId: quote.clientId, service: 'Khác',
        budget: docGrand(quote), status: 'planning',
        startDate: todayISO(), deadline: daysFromNow(30), progress: 0,
      },
    });
    // Ghi ngược vào báo giá → hóa đơn xuất sau đó tự gắn đúng dự án (v3.13)
    await prisma.quote.update({ where: { id: quote.id }, data: { projectId: project.id } });
    await prisma.auditLog.create({
      data: {
        userId: user.id, userName: user.name, action: 'create', entity: 'projects', refId: project.id,
        detail: `Tạo dự án từ báo giá ${quote.code}`,
      },
    }).catch(() => {});
    return NextResponse.json(project);
  }

  if (to === 'invoice') {
    const all = await prisma.invoice.findMany({ select: { code: true } });
    const code = nextCode(cfg.invoicePrefix || 'INV', all);
    const invoice = await prisma.invoice.create({
      data: {
        code, clientId: quote.clientId,
        projectId: quote.projectId || null, // gắn đúng dự án nếu báo giá đã sinh ra dự án
        items: quote.items, vat: quote.vat, status: 'draft',
        date: todayISO(), dueDate: daysFromNow(15), payments: '[]', recurring: false,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id, userName: user.name, action: 'create', entity: 'invoices', refId: invoice.id,
        detail: `${code}: tạo từ báo giá ${quote.code}`,
      },
    }).catch(() => {});
    return NextResponse.json(invoice);
  }

  return NextResponse.json({ error: 'Chỉ chuyển được thành "invoice" hoặc "project"' }, { status: 400 });
}
