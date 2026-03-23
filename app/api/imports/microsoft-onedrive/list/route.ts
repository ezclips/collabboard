// GET /api/imports/microsoft-onedrive/list?parentId=root
// Lists files and folders in a OneDrive folder.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';
import { listOneDriveItems } from '@/lib/imports/oneDrive';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getValidAccessToken(auth.userId, 'microsoft-onedrive');
  if (!token) {
    return NextResponse.json({ error: 'Not connected', reconnect: true }, { status: 401 });
  }

  const parentId = req.nextUrl.searchParams.get('parentId') || 'root';

  try {
    const items = await listOneDriveItems(token, parentId);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list files';
    if (/:\s*(401|403)/.test(message)) {
      return NextResponse.json({ error: 'Access token rejected. Please reconnect OneDrive.', reconnect: true }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
