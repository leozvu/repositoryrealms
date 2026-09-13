import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseSearchRequest, searchRecords } from '@/lib/global-search';

export const dynamic = 'force-dynamic';
export async function GET(req) {
  try {
    const user = await currentUser();
    const params = new URL(req.url).searchParams;
    parseSearchRequest(params, user); // Validate auth and limits before any DB read.
    const setting = await prisma.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    let modules = null;
    try { const stored = JSON.parse(setting?.json || '{}').modules; if (Array.isArray(stored)) modules = stored; } catch { /* legacy defaults */ }
    const result = await searchRecords(prisma, user, params, modules);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error?.status ? error.message : 'Không thể tải kết quả tìm kiếm.', code: error?.status ? error.code : 'search_failed' }, { status: error?.status || 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
