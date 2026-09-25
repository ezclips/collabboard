import { decodeImageDataUrl } from '../../domain/canvas/imageDataUrl';
import { parseKnowledgePdfAreaProvenance } from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
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
