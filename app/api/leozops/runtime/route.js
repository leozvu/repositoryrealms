import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleLeozOpsRuntime } from '@/lib/leozops/command-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function run(req) {
  if (process.env.LEOZOPS_COMMAND_ENABLED !== 'true') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const user = await currentUser();
  const result = await handleLeozOpsRuntime(req, { env: process.env, db: prisma, getUser: async () => user });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export async function GET(req) { return run(req); }
export async function POST(req) { return run(req); }
export async function PUT(req) { return run(req); }
export async function PATCH(req) { return run(req); }
export async function DELETE(req) { return run(req); }
export async function HEAD(req) { return run(req); }
export async function OPTIONS(req) { return run(req); }
