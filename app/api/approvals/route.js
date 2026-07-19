import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { currentStep, canDecide } from '@/lib/approvals';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const pending = await prisma.approval.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' } });
  const toApprove = pending.filter(ap => canDecide(currentStep(ap), user)
    && !(ap.type === 'realm_launch' && ap.requesterId === user.id));
  const mine = await prisma.approval.findMany({ where: { requesterId: user.id }, orderBy: { createdAt: 'desc' }, take: 30 });
  return NextResponse.json({ toApprove, mine, pendingCount: toApprove.length });
}
