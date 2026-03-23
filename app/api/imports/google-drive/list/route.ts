// GET /api/imports/google-drive/list?parentId=root
// Lists files and folders in a Google Drive folder.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';
import { listGoogleDriveItems } from '@/lib/imports/googleDrive';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getValidAccessToken(auth.userId, 'google-drive');
  if (!token) {
    return NextResponse.json({ error: 'Not connected', reconnect: true }, { status: 401 });
  }

  const parentId = req.nextUrl.searchParams.get('parentId') || 'root';

  try {
    const items = await listGoogleDriveItems(token, parentId);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list files';
    // Google returning 401/403 means the stored token is invalid — tell the browser to reconnect
    if (/:\s*(401|403)/.test(message)) {
      return NextResponse.json({ error: 'Access token rejected. Please reconnect Google Drive.', reconnect: true }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
