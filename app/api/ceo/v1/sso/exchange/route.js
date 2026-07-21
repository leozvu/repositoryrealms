import { prisma } from '@/lib/prisma';
import { ceoIdentityHashSecret } from '@/lib/ceo-identity';
import { exchangeCeoAuthorizationCode } from '@/lib/ceo-identity-admin';
import { ceoIdentityErrorResponse, ceoIdentityJson } from '@/lib/ceo-identity-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    return ceoIdentityJson(await exchangeCeoAuthorizationCode(prisma, request, body, {
      hashSecret: ceoIdentityHashSecret(),
      secretResolver: (name) => process.env[name],
    }));
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_sso_exchange_failed');
  }
}
