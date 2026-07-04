// app/api/workspace/import/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';
import { parseExportZip, ImportValidationError } from '@/lib/import/schema';
import { restoreImportBundle } from '@/lib/import/restore';
import { MAX_IMPORT_FILE_BYTES, UploadError } from '@/lib/import/upload';
import type { ExportBundle } from '@/lib/export/types';

function applyBoardNameOverrides(
  bundle: ExportBundle,
  overrides: Record<string, string>,
): ExportBundle {
  if (Object.keys(overrides).length === 0) {
    return bundle;
  }

  return {
    ...bundle,
    data: {
      ...bundle.data,
      boards: bundle.data.boards.map((board) => {
        const override = overrides[board.localId];
        if (!override) return board;
        return {
          ...board,
          title: override,
        };
      }),
    },
  };
}

function parseBoardNameOverrides(rawValue: FormDataEntryValue | null): Record<string, string> {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new UploadError('Board name overrides are not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UploadError('Board name overrides must be an object keyed by board id.');
  }

  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      throw new UploadError('Every board name override must be a string.');
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    overrides[key] = trimmed;
  }

  return overrides;
}

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
  const supabase = createRouteHandlerClient({ cookies: async () => cookieStore });

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
    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!file || !(file instanceof File)) {
      throw new UploadError('No file uploaded. Expected form field "file".');
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new UploadError(`File is too large (${Math.round(file.size / 1024 / 1024)}MB). Max is 25MB.`);
    }

    const zipBuffer = Buffer.from(await file.arrayBuffer());
    const parsedBundle = await parseExportZip(zipBuffer);
    const boardNameOverrides = parseBoardNameOverrides(formData?.get('boardNameOverrides') ?? null);
    const bundle = applyBoardNameOverrides(parsedBundle, boardNameOverrides);

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
