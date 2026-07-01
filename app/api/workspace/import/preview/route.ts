// app/api/workspace/import/preview/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { buildImportPreview, ImportValidationError } from '@/lib/import/schema';
import { readUploadedZipBuffer, UploadError } from '@/lib/import/upload';

/**
 * Parse-only preview: runs the exact same validation as the real import
 * (lib/import/schema.ts parseExportZip) but never touches the database.
 * The real POST /api/workspace/import re-validates from scratch when the
 * user confirms — this route has no side effects to make consistent with it.
 *
 * Request:  POST multipart/form-data, field "file" = *.zip from /api/workspace/export
 * Response: 200 { exportedFromWorkspaceName, exportedAt, folders: { count, names }, boards: { count, names }, padlets: { count } }
 *           400 { error } - missing file, oversized file, or schema/version/reference mismatch
 *           401 { error } - not authenticated
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const zipBuffer = await readUploadedZipBuffer(request);
    const preview = await buildImportPreview(zipBuffer);
    return NextResponse.json(preview, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof UploadError || error instanceof ImportValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Preview failed: ${message}` }, { status: 500 });
  }
}
