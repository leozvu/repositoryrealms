import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleLeozOpsCommandConfirmation } from '@/lib/leozops/command-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function run(req, { params }) {
  if (process.env.LEOZOPS_COMMAND_ENABLED !== 'true') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const user = await currentUser();
  const { id } = await params;
  const result = await handleLeozOpsCommandConfirmation(req, {
    env: process.env, db: prisma, getUser: async () => user, intentId: id,
  });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export async function POST(req, context) { return run(req, context); }
export async function GET(req, context) { return run(req, context); }
export async function PUT(req, context) { return run(req, context); }
export async function PATCH(req, context) { return run(req, context); }
export async function DELETE(req, context) { return run(req, context); }
export async function HEAD(req, context) { return run(req, context); }
export async function OPTIONS(req, context) { return run(req, context); }
