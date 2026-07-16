import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isFreelancer } from '@/lib/perm';
import { reconcile, hostPay } from '@/lib/livestream';

// v3.21: Đối soát ca live → chốt tiền thực nhận + sinh phiếu công host (Payout) theo GMV RÒNG.
// Trước đây đối soát chỉ cập nhật số trên LiveSession, còn "công host" chỉ hiển thị chứ không
// thành phiếu chi thật — Kế toán không có gì để trả. Đây là chỗ nối chuỗi tiền còn thiếu.
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user) || !hasAny(user, ['LEAD', 'ACCOUNTANT', 'PM'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { netGmv, platformFee, taxWithheld } = await req.json();
  const s = await prisma.liveSession.findUnique({ where: { id: params.id } });
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const rec = reconcile({ gmv: s.gmv, netGmv, platformFee, taxWithheld });
  const hp = hostPay({ ...s, netGmv: rec.netGmv });

  const ops = [
    prisma.liveSession.update({
      where: { id: s.id },
      data: {
        netGmv: rec.netGmv, platformFee: rec.platformFee, taxWithheld: rec.taxWithheld,
        netReceived: rec.netReceived, hostAdvance: hp.advance, hostSettled: hp.settled, status: 'reconciled',
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id, userName: user.name, action: 'reconcile', entity: 'livesessions', refId: s.id,
        detail: `Đối soát ca ${s.date}: GMV ${s.gmv.toLocaleString('vi-VN')} → thực nhận ${rec.netReceived.toLocaleString('vi-VN')}đ`,
      },
    }),
  ];

  // Sinh phiếu công host nếu có host + có tiền công. Chỉ tạo khi CHƯA có phiếu cho ca này
  // (tránh trùng khi đối soát lại). Đánh dấu qua note chứa mã ca.
  let payoutCreated = false;
  if (s.hostId && hp.settled > 0) {
    const tag = `livesession:${s.id}`;
    const existing = await prisma.payout.findFirst({ where: { userId: s.hostId, note: { contains: tag } } });
    if (!existing) {
      ops.push(prisma.payout.create({
        data: {
          userId: s.hostId, kind: 'fixed', amount: hp.settled, status: 'pending',
          note: `Công host ca live ${s.date} (GMV ròng) [${tag}]`,
        },
      }));
      payoutCreated = true;
    }
  }

  await prisma.$transaction(ops);
  return NextResponse.json({ ...rec, hostSettled: hp.settled, payoutCreated });
}
