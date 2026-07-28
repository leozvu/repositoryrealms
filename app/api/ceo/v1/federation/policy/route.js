import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { CEO_FEDERATION_VERSION, CeoFederationError } from '@/lib/ceo-federation';
import { readLocalCeoFederationPolicy, updateLocalCeoFederationPolicy } from '@/lib/ceo-federation-target-admin';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Cookie', 'X-CEO-Federation-Version': String(CEO_FEDERATION_VERSION), 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status = 200) => NextResponse.json(body, { status, headers });

async function actor() {
  const user = await currentUser();
  return user ? { user } : { response: reply({ error: 'unauthorized', code: 'unauthorized' }, 401) };
}

function failure(error) {
  const known = error instanceof CeoFederationError;
  if (!known) console.error('ceo_federation_policy_failed', { name: error?.name, code: error?.code });
  return reply({ error: known ? error.message : 'Federation policy is unavailable.', code: known ? error.code : 'ceo_federation_policy_unavailable' }, known ? error.status : 503);
}

export async function GET() {
  const auth = await actor(); if (auth.response) return auth.response;
  try { return reply({ policy: await readLocalCeoFederationPolicy(prisma, auth.user) }); }
  catch (error) { return failure(error); }
}

export async function PUT(request) {
  const auth = await actor(); if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return reply({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 2_048) return reply({ error: 'payload too large', code: 'ceo_federation_payload_too_large' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid JSON', code: 'ceo_federation_json_invalid' }, 400); }
    return reply({ policy: await updateLocalCeoFederationPolicy(prisma, auth.user, body) });
  } catch (error) { return failure(error); }
}
