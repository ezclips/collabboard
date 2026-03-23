// GET /api/imports/microsoft-onedrive/resolve?itemId=xyz

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';
import { resolveOneDriveItem } from '@/lib/imports/oneDrive';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getValidAccessToken(auth.userId, 'microsoft-onedrive');
  if (!token) {
    return NextResponse.json({ error: 'Not connected', reconnect: true }, { status: 401 });
  }

  const itemId = req.nextUrl.searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });

  try {
    const item = await resolveOneDriveItem(token, itemId);
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Resolve failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
