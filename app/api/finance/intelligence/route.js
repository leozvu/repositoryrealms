import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { loadFinancialOperatingIntelligence } from '@/lib/financial-operating-intelligence-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await currentUser();
    const result = await loadFinancialOperatingIntelligence(prisma, user);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({
      error: error?.message || 'Không thể tải Financial Intelligence.',
      code: error?.code || 'financial_intelligence_error',
    }, { status: error?.status || 500 });
  }
}
