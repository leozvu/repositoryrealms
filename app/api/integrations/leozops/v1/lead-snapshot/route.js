// Sprint 1A — T3/T4: read-only, feature-flagged Lead snapshot route for LeozOps.
//
// GET /api/integrations/leozops/v1/lead-snapshot
//
// DISABLED BY DEFAULT. With no env flag set the route returns 404 and no key
// validates. Activate per-deployment (never committed, never set by tooling) via:
//   LEOZOPS_SNAPSHOT_ENABLED=true
//   LEOZOPS_READ_KEY_HASH=<sha256-hex of the bearer key>
//
// This route serves de-identified data only (see lib/leozops/projector.js). It
// does NOT use next-auth or apiUser — the bearer key is scoped here alone.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleSnapshot } from '@/lib/leozops/handler';

export const dynamic = 'force-dynamic';

// Read-only query against THIS deployment's own DB. We select ONLY the columns
// the projector needs — PII columns (name, company, email, phone, note) are
// never even fetched. Defense in depth on top of the allowlist projection.
const loadLeads = () =>
  prisma.lead.findMany({
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
  const { status, headers, body } = await handleSnapshot(req, { env: process.env, loadLeads });
  // 304 / empty-body responses carry a null body.
  if (body === null) return new NextResponse(null, { status, headers });
  return NextResponse.json(body, { status, headers });
}

export const GET = run;
// Non-GET methods are answered by the handler (405 when the flag is on, 404 when
// off) rather than Next's default, so the route behaves consistently.
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
