import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { loadProjectExecutionHealth } from '@/lib/project-execution-health-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const user = await currentUser();
    const result = await loadProjectExecutionHealth(prisma, user, params.id);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return NextResponse.json({
      error: error?.message || 'Không thể tải Project Execution Health.',
      code: error?.code || 'project_execution_error',
    }, { status: error?.status || 500 });
  }
}
