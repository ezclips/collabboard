// GET /api/imports/download?provider=…&itemId=…
//
// PATCH-216. Fetches an imported file's BYTES so the browser can hand them to
// the existing Knowledge uploader, exactly as if the user had picked the file on
// their computer. This is the only new server work the feature needs: the whole
// upload, placement, processing and AI path is reused unchanged.
//
// SECURITY. The token is only ever sent to a provider host. A redirect (or
// OneDrive's pre-signed downloadUrl) is followed for ONE hop, only when the
// Location passes `isAllowedThumbnailUrl`, and always WITHOUT the Authorization
// header. The token and the file contents are never logged.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';
import { isAllowedThumbnailUrl, ITEM_ID_PATTERNS } from '@/lib/imports/providerUrls';
import { resolveGoogleDriveItem, googleDriveDownloadUrl } from '@/lib/imports/googleDrive';
import { resolveOneDriveItem, getOneDriveDownloadUrl } from '@/lib/imports/oneDrive';
import { documentImportPlan, isRefusedPlan } from '@/lib/imports/documentImport';
import { tooLargeMessage } from '@/lib/domain/storage/uploadLimits';
import type { ImportProvider } from '@/lib/imports/types';

export const runtime = 'nodejs';

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * Reads a response body into a Buffer, refusing once it exceeds `maxBytes`.
 * Returns null when the limit was passed -- the caller answers 413. This is the
 * cap that matters for a Google Doc export, which has no size up front.
 */
async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
  const body = response.body;
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) return jsonError('Unauthorized', 401);

  const provider = req.nextUrl.searchParams.get('provider');
  const itemId = req.nextUrl.searchParams.get('itemId');
  if (provider !== 'google-drive' && provider !== 'microsoft-onedrive') {
    return jsonError('Unsupported provider', 400);
  }
  if (!itemId || !ITEM_ID_PATTERNS[provider as ImportProvider].test(itemId)) {
    return jsonError('Invalid item id', 400);
  }

  const token = await getValidAccessToken(auth.userId, provider);
  if (!token) {
    return NextResponse.json({ error: 'Not connected', reconnect: true }, { status: 401 });
  }

  const item = provider === 'google-drive'
    ? await resolveGoogleDriveItem(token, itemId)
    : await resolveOneDriveItem(token, itemId);
  if (!item) return jsonError('File not found', 404);
  if (item.isFolder) return jsonError('Folders cannot be added as documents', 400);

  const plan = documentImportPlan(provider, item);
  if (isRefusedPlan(plan)) {
    return NextResponse.json({ error: plan.refused }, { status: 415 });
  }

  // Refuse EARLY on a known size -- before any download is attempted.
  if (typeof item.sizeBytes === 'number' && item.sizeBytes > plan.maxBytes) {
    return NextResponse.json(
      { error: tooLargeMessage(item.sizeBytes, plan.maxBytes, 'documents') },
      { status: 413 }
    );
  }

  // The first request: Google's API URL (bearer token) or OneDrive's pre-signed
  // URL (no token). Built here so every token decision is in one place.
  let firstUrl: string;
  let firstWithToken = false;
  if (provider === 'google-drive') {
    firstUrl = googleDriveDownloadUrl(itemId, plan.kind === 'export-pdf');
    firstWithToken = true;
  } else {
    const downloadUrl = await getOneDriveDownloadUrl(token, itemId);
    if (!downloadUrl || !isAllowedThumbnailUrl(provider, downloadUrl)) {
      return jsonError('Could not download the file.', 502);
    }
    firstUrl = downloadUrl;
    firstWithToken = false;
  }

  async function fetchHop(url: string, withToken: boolean): Promise<Response | null> {
    if (!isAllowedThumbnailUrl(provider as ImportProvider, url)) return null;
    try {
      return await fetch(url, {
        headers: withToken ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
        redirect: 'manual',
      });
    } catch {
      return null;
    }
  }

  let response = await fetchHop(firstUrl, firstWithToken);
  if (!response) return jsonError('Could not download the file.', 502);

  // ONE redirect hop, only to an allowlisted host, WITHOUT the token.
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) return jsonError('Could not download the file.', 502);
    let nextUrl: string;
    try {
      nextUrl = new URL(location, firstUrl).toString();
    } catch {
      return jsonError('Could not download the file.', 502);
    }
    if (!isAllowedThumbnailUrl(provider as ImportProvider, nextUrl)) {
      return jsonError('Could not download the file.', 502);
    }
    response = await fetchHop(nextUrl, false);
    if (!response) return jsonError('Could not download the file.', 502);
  }

  if (!response.ok) return jsonError('Could not download the file.', 502);

  const bytes = await readCapped(response, plan.maxBytes);
  if (bytes === null) {
    return NextResponse.json(
      { error: tooLargeMessage(plan.maxBytes + 1, plan.maxBytes, 'documents') },
      { status: 413 }
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': plan.contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'no-store',
      'X-Import-Filename': encodeURIComponent(plan.filename),
    },
  });
}
