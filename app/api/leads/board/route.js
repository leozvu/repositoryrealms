import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resourceEnabled } from '@/lib/module-guard';
import { assertLeadBoardAccess, readLeadBoard } from '@/lib/lead-board';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(req) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const user = await currentUser();
    assertLeadBoardAccess(user);
    if (!(await resourceEnabled('leads'))) return NextResponse.json({ error: 'Phân hệ này đang tắt cho công ty.' }, { status: 403, headers });
    const result = await readLeadBoard(prisma, user, new URL(req.url).searchParams);
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json({ error: error.status ? error.message : 'Không thể tải bảng Lead. Hãy thử lại.', code: error.code || 'lead_board_error' }, { status: error.status || 500, headers });
  }
}
