// GET /api/imports/google-drive/thumbnail?url=<encoded-thumbnail-url>
// Proxies a Google Drive thumbnailLink through the server using the user's access token.
// Required because Google Drive thumbnail URLs need an Authorization header
// which browsers cannot attach to <img src> requests.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) return new NextResponse('Unauthorized', { status: 401 });

  const token = await getValidAccessToken(auth.userId, 'google-drive');
  if (!token) return new NextResponse('Not connected', { status: 401 });

  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('Missing url param', { status: 400 });

  // Only proxy Google Drive / Google user-content URLs
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }
  const allowed = ['lh3.googleusercontent.com', 'drive.google.com', 'googleapis.com'];
  if (!allowed.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const upstream = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return new NextResponse('Upstream fetch failed', { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') || 'image/jpeg';
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
