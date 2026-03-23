// GET /api/imports/google-drive/resolve?fileId=abc
// Resolves a single file by ID into the normalised ImportBrowserItem shape.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';
import { resolveGoogleDriveItem } from '@/lib/imports/googleDrive';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getValidAccessToken(auth.userId, 'google-drive');
  if (!token) {
    return NextResponse.json({ error: 'Not connected', reconnect: true }, { status: 401 });
  }

  const fileId = req.nextUrl.searchParams.get('fileId');
  if (!fileId) return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });

  try {
    const item = await resolveGoogleDriveItem(token, fileId);
    if (!item) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Resolve failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
