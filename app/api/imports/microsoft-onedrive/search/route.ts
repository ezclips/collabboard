// GET /api/imports/microsoft-onedrive/search?q=lesson+plans

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';
import { searchOneDriveItems } from '@/lib/imports/oneDrive';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getValidAccessToken(auth.userId, 'microsoft-onedrive');
  if (!token) {
    return NextResponse.json({ error: 'Not connected', reconnect: true }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q') || '';
  if (!q.trim()) return NextResponse.json({ items: [] });

  try {
    const items = await searchOneDriveItems(token, q);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    if (/:\s*(401|403)/.test(message)) {
      return NextResponse.json({ error: 'Access token rejected. Please reconnect OneDrive.', reconnect: true }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
