import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isFreelancer } from '@/lib/perm';
import { toVND } from '@/lib/format';

// v3.21: Ghi nhận thanh toán lô hàng XNK → sinh phiếu THU vào sổ quỹ (quy về VNĐ) + đánh dấu
// lô 'paid'. Trước đây đổi trạng thái sang 'paid' KHÔNG sinh giao dịch nào — dòng tiền XNK
// không bao giờ chảy vào tài chính công ty. Đây là chỗ nối chuỗi tiền còn thiếu.
// Nguyên tử: 1 $transaction cho cả cập nhật lô + phiếu thu + audit.
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user) || !hasAny(user, ['ACCOUNTANT', 'PM'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { date } = await req.json().catch(() => ({}));
  const s = await prisma.shipment.findUnique({ where: { id: params.id } });
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (s.status === 'paid') return NextResponse.json({ error: 'Lô này đã ghi nhận thanh toán rồi' }, { status: 400 });

  const vnd = toVND(s.amount, s.fxRate); // giá trị lô quy về VNĐ
  if (vnd <= 0) return NextResponse.json({ error: 'Giá trị lô chưa hợp lệ (kiểm tra số tiền + tỷ giá)' }, { status: 400 });
  const payDate = date || new Date().toISOString().slice(0, 10);

  const [updated] = await prisma.$transaction([
    prisma.shipment.update({ where: { id: s.id }, data: { status: 'paid' } }),
    prisma.transaction.create({
      data: {
        type: 'income', category: 'Doanh thu xuất khẩu', amount: vnd,
        currency: 'VND', fxRate: 1, date: payDate,
        desc: `Thu lô ${s.code} — ${s.crop || ''} đi ${s.market} (${s.amount} ${s.currency} × ${s.fxRate})`,
        createdById: user.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id, userName: user.name, action: 'payment', entity: 'shipments', refId: s.id,
        detail: `${s.code}: +${vnd.toLocaleString('vi-VN')}đ (${s.amount} ${s.currency})`,
      },
    }),
  ]);
  return NextResponse.json(updated);
}
