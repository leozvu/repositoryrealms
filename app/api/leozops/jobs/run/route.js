import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleLeozOpsManualJobRun } from '@/lib/leozops/command-handler';
import { runDueLeozOpsJobs } from '@/lib/leozops/job-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function cronAuthorized(req) {
  const secret = String(process.env.LEOZOPS_CRON_SECRET || '');
  const authorization = String(req.headers.get('authorization') || '');
  if (secret.length < 32 || !authorization.startsWith('Bearer ')) return false;
  const supplied = authorization.slice(7);
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function GET(req) {
  if (process.env.LEOZOPS_COMMAND_ENABLED !== 'true') return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized', code: 'unauthorized', reason_code: 'leozops_cron_unauthorized' }, { status: 401 });
  }
  const body = await runDueLeozOpsJobs(prisma, { env: process.env, now: new Date(), maxJobs: 25 });
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function run(req) {
  if (process.env.LEOZOPS_COMMAND_ENABLED !== 'true') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const user = await currentUser();
  const result = await handleLeozOpsManualJobRun(req, { env: process.env, db: prisma, getUser: async () => user });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export async function POST(req) { return run(req); }
export async function PUT(req) { return run(req); }
export async function PATCH(req) { return run(req); }
export async function DELETE(req) { return run(req); }
export async function HEAD(req) { return run(req); }
export async function OPTIONS(req) { return run(req); }
