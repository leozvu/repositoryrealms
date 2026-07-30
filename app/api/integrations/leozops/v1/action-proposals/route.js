// Sprint 1C — proposal submission and same-credential proposal listing.
// This route persists review metadata only. It has no Lead or ERP writer.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleLeadActionProposals } from '@/lib/leozops/proposal-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rebuild the current brief from the same de-identified allowlist before every
// submission, so stale or fabricated evidence cannot be persisted.
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
  const { status, headers, body } = await handleLeadActionProposals(req, {
    env: process.env,
    db: prisma,
    loadLeads,
  });
  return NextResponse.json(body, { status, headers });
}

export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
export const HEAD = run;
export const OPTIONS = run;
