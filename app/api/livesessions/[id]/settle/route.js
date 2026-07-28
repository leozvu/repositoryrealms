import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isFreelancer } from '@/lib/perm';
import { reconcile } from '@/lib/livestream';

// v3.33: Đánh dấu tiền sàn ĐÃ VỀ ví cho một ca đã đối soát → ghi phiếu THU vào sổ quỹ.
// Trước đây đối soát chỉ tạo phiếu công host, KHÔNG ghi doanh thu → tiền livestream không bao
// giờ chảy vào tài chính công ty. Đây là chỗ nối chuỗi tiền còn thiếu (giống lô hàng XNK).
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user) || !hasAny(user, ['ACCOUNTANT', 'LEAD', 'PM'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { date } = await req.json().catch(() => ({}));
  const s = await prisma.liveSession.findUnique({ where: { id: params.id } });
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (s.status !== 'reconciled') return NextResponse.json({ error: 'Cần đối soát ca trước khi ghi nhận tiền về.' }, { status: 400 });
  if (s.settledDate) return NextResponse.json({ error: 'Ca này đã ghi nhận tiền về rồi.' }, { status: 400 });

  const rec = reconcile(s);
  const net = rec.netReceived;
  if (net <= 0) return NextResponse.json({ error: 'Tiền thực nhận chưa hợp lệ (đối soát lại).' }, { status: 400 });
  const settleDate = date || new Date().toISOString().slice(0, 10);
  const tag = `[live:${s.id}]`;

  const [updated] = await prisma.$transaction([
    prisma.liveSession.update({ where: { id: s.id }, data: { settledDate: settleDate } }),
    prisma.transaction.create({
      data: {
        type: 'income', category: 'Doanh thu livestream', amount: net, currency: 'VND', fxRate: 1, date: settleDate,
        desc: `Tiền sàn về ca live ${s.date} (${s.platform === 'shopee' ? 'Shopee' : 'TikTok'}) — thực nhận sau phí/thuế ${tag}`,
        createdById: user.id,
      },
    }),
    prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'payment', entity: 'livesessions', refId: s.id, detail: `Tiền về ca ${s.date}: +${net.toLocaleString('vi-VN')}đ` } }),
  ]);
  return NextResponse.json(updated);
}
