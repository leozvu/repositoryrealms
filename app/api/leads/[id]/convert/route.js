import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { resourceEnabled } from '@/lib/module-guard';
import { convertLeadToClient, requireLeadConversionActor } from '@/lib/lead-conversion';

export async function POST(_req, { params }) {
  try {
    const user = await currentUser();
    requireLeadConversionActor(user);
    if (!(await resourceEnabled('leads')) || !(await resourceEnabled('clients'))) {
      return NextResponse.json({ error: 'Phân hệ CRM đang tắt.', code: 'module_disabled' }, { status: 403 });
    }
    const { id } = await params;
    const result = await convertLeadToClient(prisma, user, id);
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error?.status ? error.message : 'Không thể chuyển Lead. Hãy thử lại.', code: error?.code || 'lead_conversion_failed' }, { status: error?.status || 500 });
  }
}
