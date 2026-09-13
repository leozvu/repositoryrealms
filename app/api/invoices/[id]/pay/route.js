import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';
import { receiveInvoicePayment, financialPaymentResponse } from '@/lib/financial-payment-command';

export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!hasAny(user, ['ACCOUNTANT'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const input = await req.json();
    const result = await receiveInvoicePayment(prisma, user, { ...input, recordId: params.id, idempotencyKey: req.headers.get('idempotency-key') });
    return NextResponse.json({ ...result.record, _payment: { ...result.receipt, replayed: result.replayed } });
  } catch (error) {
    const response = financialPaymentResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
