import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exportCeoInbox } from '@/lib/ceo-messaging-admin';
import { ceoMessagingContext, ceoMessagingDirector, ceoMessagingErrorResponse, ceoMessagingToken } from '@/lib/ceo-messaging-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  const auth = await ceoMessagingDirector(); if (auth.response) return auth.response;
  try {
    const body = await exportCeoInbox(prisma, auth.user, ceoMessagingToken(request), ceoMessagingContext(request));
    return new NextResponse(JSON.stringify(body, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="repositoryrealms-ceo-inbox-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return ceoMessagingErrorResponse(error, 'ceo_messaging_export_failed'); }
}
