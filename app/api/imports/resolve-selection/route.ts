// POST /api/imports/resolve-selection
// Body: { provider, itemId, name, mimeType, thumbnailUrl?, openUrl? }
//
// Resolution rules:
// 1. If the item is an image AND has a direct thumbnail/source URL, use it.
// 2. If the provider supplies a thumbnail, upload it to import-previews and use that.
// 3. Otherwise generate a branded preview card PNG via lib/imports/preview.ts.
//
// Returns: { previewImageUrl, openUrl, provider, itemId, name, mimeType, kind, sizeBytes? }

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getValidAccessToken } from '@/lib/imports/tokenRefresh';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { generatePreviewPng } from '@/lib/imports/preview';
import type { ImportProvider, ImportKind, ResolvedImportItem } from '@/lib/imports/types';

export const runtime = 'nodejs';

const IMAGE_MIME_PREFIXES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME_PREFIXES.some((p) => mimeType.startsWith(p));
}

function detectKind(mimeType: string): ImportKind {
  return isImageMime(mimeType) ? 'image' : 'document';
}

async function uploadToStorage(
  userId: string,
  provider: ImportProvider,
  itemId: string,
  data: Buffer,
  contentType: string
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const path = `imports/${userId}/${provider}/${itemId}.png`;

  const { error } = await admin.storage
    .from('import-previews')
    .upload(path, data, { contentType, upsert: true });

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
    provider: ImportProvider;
    itemId: string;
    name: string;
    mimeType: string;
    thumbnailUrl?: string;
    openUrl?: string;
    sizeBytes?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { provider, itemId, name, mimeType, thumbnailUrl, openUrl, sizeBytes } = body;

  if (!provider || !itemId || !name || !mimeType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const kind = detectKind(mimeType);

  // Build fetch options with provider auth header when needed.
  // Google Drive thumbnail URLs require an Authorization header.
  async function fetchThumbnail(url: string): Promise<Response | null> {
    const fetchHeaders: Record<string, string> = {};
    if (
      provider === 'google-drive' &&
      (url.includes('googleusercontent.com') || url.includes('googleapis.com'))
    ) {
      const googleToken = await getValidAccessToken(authResolved.userId, 'google-drive');
      if (googleToken) fetchHeaders['Authorization'] = `Bearer ${googleToken}`;
    }
    try {
      const res = await fetch(url, { cache: 'no-store', headers: fetchHeaders });
      return res.ok ? res : null;
    } catch {
      return null;
    }
  }

  // --- Case 1: It's an image with a direct provider thumbnail we can use ---
  if (kind === 'image' && thumbnailUrl) {
    const thumbRes = await fetchThumbnail(thumbnailUrl);
    if (thumbRes) {
      try {
        const thumbBuf = Buffer.from(await thumbRes.arrayBuffer());
        const publicUrl = await uploadToStorage(authResolved.userId, provider, itemId, thumbBuf, 'image/png');
        if (publicUrl) {
          const result: ResolvedImportItem = {
            previewImageUrl: publicUrl,
            openUrl: openUrl || thumbnailUrl,
            provider,
            itemId,
            name,
            mimeType,
            kind,
            sizeBytes,
          };
          return NextResponse.json(result);
        }
      } catch {
        // Fall through to preview generation
      }
    }
  }

  // --- Case 2: Provider gave us a thumbnail (document with thumbnail) ---
  if (thumbnailUrl) {
    const thumbRes = await fetchThumbnail(thumbnailUrl);
    if (thumbRes) {
      try {
        const thumbBuf = Buffer.from(await thumbRes.arrayBuffer());
        const contentType = thumbRes.headers.get('content-type') || 'image/png';
        const publicUrl = await uploadToStorage(authResolved.userId, provider, itemId, thumbBuf, contentType);
        if (publicUrl) {
          const result: ResolvedImportItem = {
            previewImageUrl: publicUrl,
            openUrl: openUrl || '',
            provider,
            itemId,
            name,
            mimeType,
            kind,
            sizeBytes,
          };
          return NextResponse.json(result);
        }
      } catch {
        // Fall through to generated card
      }
    }
  }

  // --- Case 3: Generate branded preview card ---
  try {
    const pngBuf = await generatePreviewPng({ fileName: name, mimeType, provider, kind });
    const publicUrl = await uploadToStorage(authResolved.userId, provider, itemId, pngBuf, 'image/png');

    if (!publicUrl) {
      return NextResponse.json({ error: 'Preview storage unavailable' }, { status: 500 });
    }

    const result: ResolvedImportItem = {
      previewImageUrl: publicUrl,
      openUrl: openUrl || '',
      provider,
      itemId,
      name,
      mimeType,
      kind,
      sizeBytes,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
