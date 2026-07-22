import { NextResponse } from 'next/server';
import { ceoServiceAuthError, requireCeoService } from './ceo-service-auth.js';

export async function ceoServiceGuard(request, scope, baseHeaders = {}) {
  try {
    const authenticated = await requireCeoService(request, scope);
    return { ...authenticated, responseHeaders: { ...baseHeaders, ...authenticated.headers } };
  } catch (error) {
    const failure = ceoServiceAuthError(error);
    return {
      response: NextResponse.json(failure.body, {
        status: failure.status,
        headers: { ...baseHeaders, ...failure.headers },
      }),
    };
  }
}
