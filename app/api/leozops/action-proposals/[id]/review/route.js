import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleProposalReviewDecision } from '@/lib/leozops/review-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

async function run(req, { params }) {
  if (process.env.LEOZOPS_REVIEW_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const user = await currentUser();
  const { status, headers, body } = await handleProposalReviewDecision(req, {
    env: process.env,
    db: prisma,
    getUser: async () => user,
    loadLeads,
    proposalId: params.id,
  });
  return NextResponse.json(body, { status, headers });
}

export async function POST(req, context) { return run(req, context); }
export async function GET(req, context) { return run(req, context); }
export async function PUT(req, context) { return run(req, context); }
export async function PATCH(req, context) { return run(req, context); }
export async function DELETE(req, context) { return run(req, context); }
export async function HEAD(req, context) { return run(req, context); }
export async function OPTIONS(req, context) { return run(req, context); }
