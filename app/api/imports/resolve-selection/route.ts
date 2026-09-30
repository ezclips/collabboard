// POST /api/imports/resolve-selection
// Body: { provider, itemId, name?, mimeType?, thumbnailUrl?, openUrl?, sizeBytes? }
//
// PATCH-213 SECURITY. The item is resolved on the SERVER from the provider; the
// body's `name`, `mimeType`, `openUrl`, `sizeBytes` and `thumbnailUrl` are
// IGNORED. Before this, the route fetched `body.thumbnailUrl` -- a URL the
// client chose -- from the server (SSRF, and any internal address), and attached
// the user's Google token when that URL merely CONTAINED `googleapis.com`, so a
// crafted URL (`https://evil.example/?googleapis.com`) received the token. Now the
// only thumbnail ever fetched is the one the provider's own API returned, from an
// exact host allowlist, with redirects disabled so nothing can carry the token
// elsewhere.
//
// Resolution rules (unchanged cases):
// 1. If the item is an image AND the provider gave a direct thumbnail, use it.
// 2. Otherwise, if the provider gave a thumbnail, upload that to import-previews.
// 3. Otherwise generate a branded preview card PNG via lib/imports/preview.ts.
//
// Preview objects get a RANDOM name (`imports/{userId}/{provider}/{uuid}.{ext}`),
// so a private file's preview cannot be found by knowing the user id and file id.
//
// Returns: { previewImageUrl, openUrl, provider, itemId, name, mimeType, kind, sizeBytes? }

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { generatePreviewPng } from '@/lib/imports/preview';
import { isAllowedThumbnailUrl, shouldAttachGoogleToken, ITEM_ID_PATTERNS } from '@/lib/imports/providerUrls';
import { resolveGoogleDriveItem } from '@/lib/imports/googleDrive';
import { resolveOneDriveItem } from '@/lib/imports/oneDrive';
import type { ImportProvider, ImportKind, ResolvedImportItem } from '@/lib/imports/types';

export const runtime = 'nodejs';

const IMAGE_MIME_PREFIXES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME_PREFIXES.some((p) => mimeType.startsWith(p));
}

function detectKind(mimeType: string): ImportKind {
  return isImageMime(mimeType) ? 'image' : 'document';
}

/** The file extension for a thumbnail's content type (defaults to png). */
function extensionForContentType(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  return 'png';
}

async function uploadToStorage(
  userId: string,
  provider: ImportProvider,
  data: Buffer,
  contentType: string,
  extension: string
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  // A RANDOM name, never the item id: the bucket is public, so the name is the
  // only thing standing between a private file's preview and a guessing visitor.
  const path = `imports/${userId}/${provider}/${randomUUID()}.${extension}`;

  const { error } = await admin.storage
    .from('import-previews')
    .upload(path, data, { contentType, upsert: false });

  if (error) {
    console.error('Storage upload failed:', error.message);
    return null;
  }

  const { data: urlData } = admin.storage
    .from('import-previews')
    .getPublicUrl(path);

  return urlData.publicUrl || null;
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const authResolved = auth;

  let body: {
    provider?: ImportProvider;
    itemId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const provider = body.provider;
  const itemId = body.itemId;

  if (provider !== 'google-drive' && provider !== 'microsoft-onedrive') {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
  }
  if (typeof itemId !== 'string' || !ITEM_ID_PATTERNS[provider].test(itemId)) {
    return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
  }

  const token = await getValidAccessToken(authResolved.userId, provider);
  if (!token) {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 });
  }

  // THE ITEM IS RESOLVED HERE, from the provider, with the user's own token.
  // Everything the response carries comes from this, never from the body.
  const resolved = provider === 'google-drive'
    ? await resolveGoogleDriveItem(token, itemId)
    : await resolveOneDriveItem(token, itemId);

  if (!resolved) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  if (resolved.isFolder) {
    return NextResponse.json({ error: 'Folders cannot be imported' }, { status: 400 });
  }

  const name = resolved.name;
  const mimeType = resolved.mimeType;
  const sizeBytes = resolved.sizeBytes;
  const openUrl = resolved.openUrl ?? '';
  const kind = detectKind(mimeType);

  // The provider's OWN thumbnail. Google's resolved `thumbnailUrl` is a local
  // proxy URL, so the server must fetch the raw one; OneDrive's resolved
  // `thumbnailUrl` IS the provider URL.
  const thumbnailUrl =
    provider === 'google-drive' ? resolved.rawThumbnailUrl : resolved.thumbnailUrl;

  // Fetch a provider thumbnail, but ONLY from an allowlisted host, and never
  // follow a redirect (which could carry the token or the request elsewhere).
  const fetchThumbnail = async (url: string): Promise<Response | null> => {
    if (!isAllowedThumbnailUrl(provider, url)) return null;
    const fetchHeaders: Record<string, string> = {};
    if (shouldAttachGoogleToken(url)) {
      const googleToken = await getValidAccessToken(authResolved.userId, 'google-drive');
      if (googleToken) fetchHeaders['Authorization'] = `Bearer ${googleToken}`;
    }
    try {
      const res = await fetch(url, { cache: 'no-store', headers: fetchHeaders, redirect: 'error' });
      return res.ok ? res : null;
    } catch {
      return null;
    }
  };

  const buildResult = (previewImageUrl: string): ResolvedImportItem => {
    return {
      previewImageUrl,
      openUrl,
      provider,
      itemId,
      name,
      mimeType,
      kind,
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    };
  };

  // --- Case 1: an image with a direct provider thumbnail ---
  if (kind === 'image' && thumbnailUrl) {
    const thumbRes = await fetchThumbnail(thumbnailUrl);
    if (thumbRes) {
      try {
        const thumbBuf = Buffer.from(await thumbRes.arrayBuffer());
        const contentType = thumbRes.headers.get('content-type') || 'image/png';
        const publicUrl = await uploadToStorage(
          authResolved.userId,
          provider,
          thumbBuf,
          contentType,
          extensionForContentType(contentType)
        );
        if (publicUrl) return NextResponse.json(buildResult(publicUrl));
      } catch {
        // Fall through to preview generation
      }
    }
  }

  // --- Case 2: a document with a provider thumbnail ---
  if (thumbnailUrl) {
    const thumbRes = await fetchThumbnail(thumbnailUrl);
    if (thumbRes) {
      try {
        const thumbBuf = Buffer.from(await thumbRes.arrayBuffer());
        const contentType = thumbRes.headers.get('content-type') || 'image/png';
        const publicUrl = await uploadToStorage(
          authResolved.userId,
          provider,
          thumbBuf,
          contentType,
          extensionForContentType(contentType)
        );
        if (publicUrl) return NextResponse.json(buildResult(publicUrl));
      } catch {
        // Fall through to generated card
      }
    }
  }

  // --- Case 3: generated branded preview card ---
  try {
    const pngBuf = await generatePreviewPng({ fileName: name, mimeType, provider, kind });
    const publicUrl = await uploadToStorage(
      authResolved.userId,
      provider,
      pngBuf,
      'image/png',
      'png'
    );

    if (!publicUrl) {
      return NextResponse.json({ error: 'Preview storage unavailable' }, { status: 500 });
    }

    return NextResponse.json(buildResult(publicUrl));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
