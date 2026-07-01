// app/api/workspace/import/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';
import { parseExportZip, ImportValidationError } from '@/lib/import/schema';
import { restoreImportBundle } from '@/lib/import/restore';
import { readUploadedZipBuffer, UploadError } from '@/lib/import/upload';

/**
 * v1 contract: this is the write step. Clients are expected to call
 * POST /api/workspace/import/preview first and only call this once the user
 * confirms — but this route re-validates from scratch regardless (it does
 * not trust a prior preview call), since nothing here depends on that call
 * having happened.
 *
 * Request:  POST multipart/form-data, field "file" = *.zip from /api/workspace/export
 * Response: 200 { foldersImported, boardsImported, padletsImported }
 *           400 { error } - missing file, oversized file, schema/version mismatch,
 *                           or a broken cross-reference (validated before any writes)
 *           401 { error } - not authenticated
 *           404 { error } - no workspace for this user
 *           500 { error } - import failed after validation (rolled back)
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

  const workspaceContext = await resolveCurrentWorkspace(supabase, user);
  if (!workspaceContext) {
    return NextResponse.json({ error: 'No workspace found for this user.' }, { status: 404 });
  }

  try {
    const zipBuffer = await readUploadedZipBuffer(request);
    const bundle = await parseExportZip(zipBuffer);

    const summary = await restoreImportBundle({
      supabase,
      bundle,
      workspaceId: workspaceContext.workspaceId,
      userId: user.id,
    });

    return NextResponse.json(summary, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof UploadError || error instanceof ImportValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Import failed: ${message}` }, { status: 500 });
  }
}
