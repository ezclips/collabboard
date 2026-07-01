// lib/import/upload.ts

import type { NextRequest } from 'next/server';

export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024; // 25MB cap for v1

export class UploadError extends Error {}

/**
 * Shared by both /api/workspace/import/preview and /api/workspace/import so
 * the size cap and "file" field name can't silently drift between them.
 */
export async function readUploadedZipBuffer(request: NextRequest): Promise<Buffer> {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!file || !(file instanceof File)) {
    throw new UploadError('No file uploaded. Expected form field "file".');
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new UploadError(`File is too large (${Math.round(file.size / 1024 / 1024)}MB). Max is 25MB.`);
  }

  return Buffer.from(await file.arrayBuffer());
}
