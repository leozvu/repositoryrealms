import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isFreelancer } from '@/lib/perm';
import { canIssue, lotRemaining } from '@/lib/inventory';

// v3.24: Xuất kho một lô → cập nhật qtyOut + ghi StockMove (out), gắn refId = shipmentId để
// TRUY XUẤT NGUỒN GỐC (lô hàng xuất đi từ lô tồn nào → ra vùng trồng). Nguyên tử 1 $transaction.
// qtyOut KHÔNG cho sửa tay qua CRUD (filterUpdate loại bỏ) — chỉ đi qua đây để không lệch với StockMove.
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user) || !hasAny(user, ['ACCOUNTANT', 'PM'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { qty, shipmentId, date, note } = await req.json().catch(() => ({}));
  const lot = await prisma.stockLot.findUnique({ where: { id: params.id } });
  if (!lot) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const check = canIssue(lot, qty);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const q = +qty;
  const moveDate = date || new Date().toISOString().slice(0, 10);
  const newOut = (lot.qtyOut || 0) + q;
  const depleted = newOut >= (lot.qtyIn || 0);

  const [updated] = await prisma.$transaction([
    prisma.stockLot.update({ where: { id: lot.id }, data: { qtyOut: newOut, ...(depleted ? { status: 'depleted' } : {}) } }),
    prisma.stockMove.create({
      data: {
        lotId: lot.id, type: 'out', qty: q, date: moveDate,
        refType: shipmentId ? 'shipment' : 'manual', refId: shipmentId || null,
        note: note || null,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id, userName: user.name, action: 'stock_issue', entity: 'stocklots', refId: lot.id,
        detail: `Xuất ${q} kg lô ${lot.code}${shipmentId ? ` cho lô hàng ${shipmentId}` : ''} (còn ${lotRemaining({ ...lot, qtyOut: newOut })} kg)`,
      },
    }),
  ]);
  return NextResponse.json(updated);
}
