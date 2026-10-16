import { createStorageGateway } from '../supabase/storage';

/**
 * PATCH-380. WHERE A VIEWER'S FILE GOES.
 *
 * A guest may NEVER write to Storage directly: PATCH-358's `guest_no_storage_*`
 * policies refuse it, and they stay exactly as they are. So a guest's file goes
 * through the server route, which writes with the admin client after checking
 * the owner's "Guests may upload" switch. Everyone else keeps the direct path,
 * unchanged.
 *
 * CLIENT-SAFE: no Supabase client of its own beyond the member gateway, and the
 * guest path is a plain `fetch` of the public route.
 *
 * Returns the public URL. THROWS on any failure, exactly as the inline helper it
 * replaces did, so the caller's existing `catch` still reports it the same way.
 */

export interface ViewerUploadInput {
  /** True for an anonymous guest -- the ONLY thing that changes the destination. */
  readonly isGuest: boolean;
  readonly boardId: string;
  readonly file: File;
  /** The member path in `padlet-files` (a guest's path is chosen by the server). */
  readonly storagePath: string;
}

const PADLET_FILES_BUCKET = 'padlet-files';

export async function uploadFileForViewer(input: ViewerUploadInput): Promise<string> {
  const { isGuest, boardId, file, storagePath } = input;

  if (!isGuest) {
    const storageGateway = createStorageGateway();
    const uploadResult = await storageGateway.upload(PADLET_FILES_BUCKET, storagePath, file);
    if (!uploadResult.ok) throw uploadResult.error.cause ?? uploadResult.error;
    return storageGateway.getPublicUrl(PADLET_FILES_BUCKET, storagePath);
  }

  const form = new FormData();
  form.set('file', file);
  const response = await fetch(`/api/boards/${boardId}/guest-upload`, { method: 'POST', body: form });
  const payload = await response.json().catch(() => null) as { url?: string; error?: string } | null;
  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error ?? 'Could not upload the file.');
  }
  return payload.url;
}
