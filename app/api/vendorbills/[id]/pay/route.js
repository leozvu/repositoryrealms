import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isDirector } from '@/lib/perm';
import { payVendorBill, createApproval, getSettings } from '@/lib/approvals';

// Thanh toán hóa đơn NCC.
// Dưới ngưỡng (hoặc người trả là Kế toán/GĐ đủ quyền) → trả ngay + ghi sổ.
// Từ ngưỡng trở lên → đi qua chuỗi duyệt Kế toán (→ Giám đốc nếu rất lớn).
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!hasAny(user, ['ACCOUNTANT', 'PM'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { date } = await req.json();
  const bill = await prisma.vendorBill.findUnique({ where: { id: params.id }, include: { vendor: true } });
  if (!bill) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (bill.status === 'paid') return NextResponse.json({ error: 'Hóa đơn này đã thanh toán rồi' }, { status: 400 });

  const s = await getSettings();
  const needApproval = bill.amount >= s.approveExpenseOver && !isDirector(user);
  if (needApproval) {
    const dup = await prisma.approval.findFirst({ where: { type: 'vendorbill', refId: bill.id, status: 'pending' } });
    if (dup) return NextResponse.json({ _blocked: true, _notice: 'Hóa đơn này đang chờ duyệt thanh toán' });
    const steps = [{ role: 'ACCOUNTANT', label: 'Kế toán' }];
    if (bill.amount >= s.approveExpenseDirectorOver) steps.push({ role: 'DIRECTOR', label: 'Giám đốc' });
    const { autoApproved } = await createApproval({
      type: 'vendorbill', refId: bill.id,
      title: `Duyệt trả ${bill.vendor.name} — ${bill.code} (${bill.amount.toLocaleString('vi-VN')}đ)`,
      amount: bill.amount, payload: { date }, steps, user,
    });
    return NextResponse.json(autoApproved
      ? { ok: true, _notice: 'Đã tự duyệt (bạn giữ vai trò duyệt) và thanh toán, ghi vào sổ quỹ' }
      : { _blocked: true, _notice: 'Đã tạo yêu cầu phê duyệt thanh toán — xử lý trong mục Phê duyệt' });
  }
  const updated = await payVendorBill(bill.id, date, user);
  return NextResponse.json({ ...updated, _notice: 'Đã thanh toán và ghi khoản chi vào sổ quỹ' });
}
