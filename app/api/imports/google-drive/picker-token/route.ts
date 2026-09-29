// GET /api/imports/google-drive/picker-token
// Returns the user's own short-lived Google access token and the Cloud project
// number (the Picker's `appId`), so the browser can open Google's Picker.
//
// PATCH-214. The BROWSER holding this token is how the Picker works: it is the
// user's own token for their own account, short-lived, and scoped to the files
// they pick (`drive.file`). It is NEVER logged.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';
import { googleAppIdFromClientId } from '@/lib/imports/googlePicker';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = await getValidAccessToken(auth.userId, 'google-drive');
  if (!accessToken) {
    return NextResponse.json({ error: 'Not connected', reconnect: true }, { status: 401 });
  }

  // `oauth.ts` derives the client id the same way (Drive id, then the shared one).
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const appId = googleAppIdFromClientId(clientId);
  if (!appId) {
    return NextResponse.json({ error: 'Google Drive is not configured' }, { status: 500 });
  }

  return NextResponse.json(
    { accessToken, appId },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
