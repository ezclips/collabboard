// lib/import/restore.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExportBundle } from '@/lib/export/types';

export interface ImportSummary {
  foldersImported: number;
  boardsImported: number;
  padletsImported: number;
}

interface RestoreImportBundleParams {
  supabase: SupabaseClient;
  bundle: ExportBundle;
  workspaceId: string;
  userId: string;
}

/**
 * Re-attaches ownership (workspace/user) to a normalized bundle and inserts
 * it into the target workspace, remapping every bundle-local reference
 * (folder -> parent folder, folder -> board, board -> padlet, and
 * padlet -> padlet container hierarchy in metadata) to the newly created
 * rows' real ids.
 *
 * The actual writes happen in one call to the `import_workspace_bundle`
 * Postgres function (see supabase/migrations/20260701_add_import_workspace_bundle_rpc.sql)
 * — a single RPC invocation is a single transaction, so any failure there
 * rolls back every insert/update from this import automatically. This
 * replaces the previous app-level "insert everything, delete everything on
 * failure" compensation, which could not guarantee no other session ever
 * saw the partial state mid-import.
 *
 * Callers must run lib/import/schema.ts's parseExportZip first — it
 * guarantees every reference here resolves within the bundle. The RPC still
 * defensively re-checks references and raises (aborting the transaction) if
 * a lookup ever fails, since it must not trust its caller any less than
 * this function already didn't.
 */
export async function restoreImportBundle({
  supabase,
  bundle,
  workspaceId,
  userId,
}: RestoreImportBundleParams): Promise<ImportSummary> {
  const { data, error } = await supabase.rpc('import_workspace_bundle', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_folders: bundle.data.folders,
    p_boards: bundle.data.boards,
    p_padlets: bundle.data.padlets,
  });

  if (error) {
    throw new Error(`Failed to import workspace bundle: ${error.message}`);
  }

  return data as ImportSummary;
}
