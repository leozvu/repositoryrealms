import { NextResponse } from 'next/server';
import { isCeoPortalDeployment, isCeoPortalOnlyPath } from './lib/deployment-profile.js';

export function middleware(request) {
  if (!isCeoPortalOnlyPath(request.nextUrl.pathname) || isCeoPortalDeployment()) {
    return NextResponse.next();
  }

  return new NextResponse('Not Found', {
    status: 404,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const config = {
  matcher: [
    '/ceo-overview/:path*',
    '/ceo-world/:path*',
    '/ceo-commands/:path*',
    '/ceo-workforce/:path*',
    '/ceo-inbox/:path*',
    '/ceo-registry/:path*',
    '/ceo-security/:path*',
    '/ceo-rollout/:path*',
    '/ceo-decisions/:path*',
    '/ceo-briefing/:path*',
    '/realm-v2/:path*',
    '/api/ceo/v1/:path*',
  ],
};
