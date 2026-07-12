import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { isDirector } from '@/lib/perm';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isDirector(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const rows = await prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: 300 });
  return NextResponse.json(rows);
}
