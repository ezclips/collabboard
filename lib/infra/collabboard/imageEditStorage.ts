import { decodeImageDataUrl } from '../../domain/canvas/imageDataUrl';
import { parseKnowledgePdfAreaProvenance } from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
import { UPLOAD_LIMITS, tooLargeMessage } from '../../domain/storage/uploadLimits';
import { createStorageGateway } from '../supabase/storage';

/**
 * PATCH-182 -- the ONE place an edited Image picture is moved out of the post
 * and into Storage.
 *
 * Drawing on or cropping an Image post used to save the finished picture as a
 * `data:` URL inside the post row, so every board load downloaded every edited
 * picture in full, uncached, with the post list. This module turns that data
 * URL into a file and returns the URL the post should now hold.
 *
 * PRIVACY: a picture cut from a Knowledge PDF is as private as the PDF. It is
 * PUT to the board route that re-checks access on every read and stored in the
 * private bucket; it is NEVER uploaded to `padlet-files` or any public bucket.
 * An ordinary post goes to `padlet-files`, the same bucket the board's own
 * image uploads use.
 *
 * The user's work is never lost: if storing fails for ANY reason the original
 * data URL is returned unchanged and the save behaves exactly as it did before.
 * This function never throws.
 */

export type StoredImageEdit = {
  readonly url: string;
  readonly stored: 'public-file' | 'private-file' | 'inline';
};

const PADLET_FILES_BUCKET = 'padlet-files';

export async function storeEditedImage(input: {
  boardId: string;
  padletId: string;
  metadata: unknown;
  variant: 'drawing' | 'base';
  dataUrl: string;
}): Promise<StoredImageEdit> {
  const { boardId, padletId, metadata, variant, dataUrl } = input;

  // Not an image data URL (or not a decodable one): there is nothing to move.
  const decoded = decodeImageDataUrl(dataUrl);
  if (decoded === null) return { url: dataUrl, stored: 'inline' };
  // A fresh, ArrayBuffer-backed copy: the decoders below (fetch/Blob) want a
  // concrete backing buffer, not the shared-buffer-capable view type.
  const bytes = new Uint8Array(decoded.bytes);

  // A PDF-area post: the private route, never the public bucket.
  if (parseKnowledgePdfAreaProvenance(metadata) !== null) {
    try {
      const response = await fetch(
        `/api/boards/${boardId}/padlets/${padletId}/image?variant=${variant}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: bytes,
        },
      );
      if (!response.ok) throw new Error(`image edit route responded ${response.status}`);
      const payload = await response.json() as { url?: unknown };
      if (typeof payload?.url !== 'string' || payload.url.length === 0) {
        throw new Error('image edit route returned no url');
      }
      return { url: payload.url, stored: 'private-file' };
    } catch (reason) {
      console.warn('[image-edit] kept inline:', reason);
      return { url: dataUrl, stored: 'inline' };
    }
  }

  // Any other post: the same bucket and gateway the board's own uploads use.
  try {
    const gateway = createStorageGateway();
    const path = `image-edits/${boardId}/${padletId}/${variant}-${Date.now()}.png`;
    const file = new File([bytes], `${variant}.png`, { type: 'image/png' });
    const result = await gateway.upload(PADLET_FILES_BUCKET, path, file);
    if (!result.ok) throw new Error(result.error.message);
    return { url: gateway.getPublicUrl(PADLET_FILES_BUCKET, path), stored: 'public-file' };
  } catch (reason) {
    console.warn('[image-edit] kept inline:', reason);
    return { url: dataUrl, stored: 'inline' };
  }
}

export type StoredUploadedImage =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly message: string };

/**
 * PATCH-218 -- a NEWLY uploaded image, stored as a file instead of a `data:` URL.
 *
 * The Image window's upload tab used to read the chosen file with
 * `readAsDataURL` and save that base64 string as the post's `file_url`, its
 * `metadata.imageUrl` and the Image Library row's URLs. Every board load then
 * downloaded every uploaded picture, in full, inside the JSON. Drawn and cropped
 * pictures were already moved out (`storeEditedImage`, PATCH-182); this closes
 * the same hole for new uploads.
 *
 * UNLIKE `storeEditedImage`, THERE IS NO INLINE FALLBACK. For a brand-new upload
 * the file is still in hand, so a failure the user can retry is strictly better
 * than silently recreating the bloat this function exists to remove. It never
 * throws: every failure is `{ ok: false, message }`.
 */
const UPLOAD_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

function uploadExtensionFor(mimeType: string): string {
  const known = UPLOAD_EXTENSION_BY_MIME[mimeType.toLowerCase()];
  if (known) return known;
  const tail = mimeType.slice('image/'.length).toLowerCase().replace(/[^a-z0-9]/g, '');
  return tail.length > 0 ? tail : 'bin';
}

export async function storeUploadedImage(input: {
  boardId: string;
  file: File;
}): Promise<StoredUploadedImage> {
  const { boardId, file } = input;

  if (!file.type.startsWith('image/')) {
    return { ok: false, message: 'Please choose an image file.' };
  }
  if (file.size > UPLOAD_LIMITS.image) {
    return {
      ok: false,
      message: tooLargeMessage(file.size, UPLOAD_LIMITS.image, 'images'),
    };
  }

  try {
    const gateway = createStorageGateway();
    // A RANDOM name: the user's filename is never used in the path.
    const path = `image-uploads/${boardId}/${crypto.randomUUID()}.${uploadExtensionFor(file.type)}`;
    const result = await gateway.upload(PADLET_FILES_BUCKET, path, file);
    if (!result.ok) throw new Error(result.error.message);
    return { ok: true, url: gateway.getPublicUrl(PADLET_FILES_BUCKET, path) };
  } catch (reason) {
    console.warn('[image-upload] failed:', reason);
    return { ok: false, message: 'Could not upload the image. Please try again.' };
  }
}
