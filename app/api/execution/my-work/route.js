import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { loadMyWork } from '@/lib/execution-engine-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await currentUser();
    const model = await loadMyWork(prisma, user);
    return NextResponse.json(model, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Không thể tải My Work.', code: error?.code || 'execution_my_work_error' }, { status: error?.status || 500 });
  }
}
