// app/api/workspace/export/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';
import { buildExportBundle, buildExportZip, ExportValidationError } from '@/lib/export/serialize';
import type { ExportScope } from '@/lib/export/types';

const EXPORT_SCOPES: ExportScope[] = ['accessible', 'all', 'team-member'];

function isExportScope(value: unknown): value is ExportScope {
  return typeof value === 'string' && (EXPORT_SCOPES as string[]).includes(value);
}

/**
 * GET: list exportable boards for the current workspace, using the same
 * server-side auth path as the actual export POST route.
 */
export async function GET() {
  try {
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

    const { data: boardRows, error: boardError } = await supabase
      .from('boards')
      .select('id, title, layout, folder_id')
      .eq('workspace_id', workspaceContext.workspaceId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (boardError) {
      return NextResponse.json({ error: `Failed to load boards: ${boardError.message}` }, { status: 500 });
    }

    const { data: folderRows, error: folderError } = await supabase
      .from('folders')
      .select('id, name')
      .eq('workspace_id', workspaceContext.workspaceId);

    if (folderError) {
      return NextResponse.json({ error: `Failed to load folders: ${folderError.message}` }, { status: 500 });
    }

    return NextResponse.json(
      {
        boards: (boardRows ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          layout: row.layout,
          folderId: row.folder_id,
        })),
        folders: (folderRows ?? []).map((row) => ({
          id: row.id,
          name: row.name,
        })),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to load export options: ${message}` }, { status: 500 });
  }
}

/**
 * v1 contract: synchronous export, direct zip download.
 * No job table / email delivery yet — see lib/import/restore.ts header for
 * why async delivery was deferred until size/timeout data justifies it.
 *
 * Request:  POST { scope: 'accessible' | 'all' | 'team-member', boardIds?: string[] }
 *           boardIds is optional — when omitted, every accessible board in
 *           the workspace is exported; when provided, only those boards
 *           (plus the folders/padlets they need) are exported.
 * Response: 200 application/zip (Content-Disposition: attachment)
 *           400 { error } - bad scope, scope not yet supported, empty/invalid
 *                           boardIds, or a requested board is not accessible
 *           401 { error } - not authenticated
 *           404 { error } - no workspace for this user
 *           500 { error } - export failed
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

  const body = await request.json().catch(() => ({}));
  const scope = isExportScope(body?.scope) ? body.scope : 'accessible';

  if (scope !== 'accessible') {
    return NextResponse.json(
      { error: `Export scope "${scope}" is not available yet. Only "accessible" is supported.` },
      { status: 400 },
    );
  }

  let boardIds: string[] | undefined;
  if (body?.boardIds !== undefined) {
    if (!Array.isArray(body.boardIds) || !body.boardIds.every((id: unknown) => typeof id === 'string')) {
      return NextResponse.json({ error: 'boardIds must be an array of strings.' }, { status: 400 });
    }
    boardIds = body.boardIds;
  }

  const workspaceContext = await resolveCurrentWorkspace(supabase, user);
  if (!workspaceContext) {
    return NextResponse.json({ error: 'No workspace found for this user.' }, { status: 404 });
  }

  try {
    const bundle = await buildExportBundle({
      supabase,
      workspaceId: workspaceContext.workspaceId,
      workspaceName: workspaceContext.workspaceName,
      scope,
      boardIds,
    });

    const zipBuffer = await buildExportZip(bundle);
    const filename = `workspace-export-${new Date().toISOString().split('T')[0]}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ExportValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Export failed: ${message}` }, { status: 500 });
  }
}
