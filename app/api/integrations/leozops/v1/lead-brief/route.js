// Sprint 1B — read-only, de-identified Lead Operations Brief.
//
// GET /api/integrations/leozops/v1/lead-brief
// Default-off and scoped to its own bearer key:
//   LEOZOPS_BRIEF_ENABLED=true
//   LEOZOPS_BRIEF_READ_KEY_HASH=<sha256-hex>

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleLeadBrief } from '@/lib/leozops/brief-handler';

export const dynamic = 'force-dynamic';

// Same strict, de-identified source boundary as Sprint 1A. No PII column is
// selected, even though the projector also uses an explicit allowlist.
const loadLeads = () => prisma.lead.findMany({
  select: {
    id: true,
    source: true,
    value: true,
    stage: true,
    ownerId: true,
    createdAt: true,
    expectedClose: true,
  },
});

async function run(req) {
  const { status, headers, body } = await handleLeadBrief(req, { env: process.env, loadLeads });
  if (body === null) return new NextResponse(null, { status, headers });
  return NextResponse.json(body, { status, headers });
}

export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
export const HEAD = run;
export const OPTIONS = run;
