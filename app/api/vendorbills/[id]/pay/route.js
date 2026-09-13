import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';
import { notify, usersWithRole } from '@/lib/events';
import { notificationRecordRoute } from '@/lib/notification-inbox';
import { requestVendorPayment, financialPaymentResponse } from '@/lib/financial-payment-command';

export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!hasAny(user, ['ACCOUNTANT', 'PM'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { date } = await req.json();
    const result = await requestVendorPayment(prisma, user, {
      recordId: params.id, date, idempotencyKey: req.headers.get('idempotency-key'),
    });
    if (result.pending) {
      if (!result.replayed) {
        try {
          const step = JSON.parse(result.approval.steps).find(item => item.status === 'pending');
          const targets = step.userId ? [step.userId] : (await usersWithRole(step.role)).map(person => person.id);
          await notify(targets.filter(id => id !== user.id), 'Chờ bạn duyệt: ' + result.approval.title, notificationRecordRoute('approvals', result.approval.id));
        } catch { /* A committed approval remains recoverable in the approval inbox. */ }
      }
      return NextResponse.json({ _blocked: true, approvalId: result.approval.id, _notice: 'Hóa đơn đang chờ phê duyệt thanh toán.' });
    }
    return NextResponse.json({
      ...result.payment.record,
      _payment: { ...result.payment.receipt, replayed: result.payment.replayed },
      _notice: result.payment.replayed ? 'Thanh toán đã được xác nhận trong sổ quỹ.' : 'Đã thanh toán và ghi khoản chi vào sổ quỹ.',
    });
  } catch (error) {
    const response = financialPaymentResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
