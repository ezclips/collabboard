// lib/export/serialize.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import {
  EXPORT_SCHEMA_VERSION,
  PADLET_METADATA_REF_ARRAY_KEY,
  PADLET_METADATA_REF_KEYS,
  PADLET_METADATA_SECTION_KEY,
  type ExportBundle,
  type ExportData,
  type ExportScope,
  type NormalizedBoard,
  type NormalizedBoardSection,
  type NormalizedFolder,
  type NormalizedPadlet,
} from './types';

// Raw shapes as read from Supabase. Verified against the actual table
// columns (see lib/export/types.ts header) — intentionally narrower than
// `select('*')` and excludes personal/per-user state columns.
interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  position: number | null;
}

interface BoardRow {
  id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  layout: string;
  background: Record<string, unknown> | null;
  background_type: 'color' | 'gradient' | 'image' | null;
  background_value: string | null;
  container_size: 'small' | 'medium' | 'large' | null;
  comments_enabled: boolean | null;
  reactions_enabled: boolean | null;
  created_at: string;
  updated_at: string;
}

function normalizeBoardBackground(
  background: Record<string, unknown> | string | null,
): Record<string, unknown> | null {
  if (background === null || background === 'null') {
    return null;
  }
  if (typeof background === 'object' && !Array.isArray(background)) {
    return background;
  }
  return null;
}

interface PadletRow {
  id: string;
  board_id: string;
  title: string;
  content: string;
  color: string | null;
  type: string;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  location_lng: number | null;
  location_lat: number | null;
  location_label: string | null;
  location_mapbox_id: string | null;
  location_precision: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// board_sections has no tracked CREATE TABLE migration (created outside
// migration files); columns confirmed via a live query: id is numeric
// (int8/serial), board_id is a uuid FK to boards.id.
interface BoardSectionRow {
  id: number;
  board_id: string;
  title: string;
  description: string | null;
  position: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Remaps padlet-to-padlet references inside `metadata` from source row ids
 * to this bundle's local padlet ids. References that don't resolve within
 * the exported padlet set (dangling data in the source DB) are dropped
 * rather than carried through, since a bundle must be internally consistent.
 */
function remapPadletMetadataRefs(
  metadata: Record<string, unknown>,
  padletLocalIdBySourceId: Map<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...metadata };

  for (const key of PADLET_METADATA_REF_KEYS) {
    const value = metadata[key];
    if (typeof value !== 'string') continue;
    const mapped = padletLocalIdBySourceId.get(value);
    if (mapped) {
      result[key] = mapped;
    } else {
      delete result[key];
    }
  }

  const childIds = metadata[PADLET_METADATA_REF_ARRAY_KEY];
  if (Array.isArray(childIds)) {
    const mappedChildren = childIds
      .filter((value): value is string => typeof value === 'string')
      .map((value) => padletLocalIdBySourceId.get(value))
      .filter((value): value is string => Boolean(value));
    if (mappedChildren.length) {
      result[PADLET_METADATA_REF_ARRAY_KEY] = mappedChildren;
    } else {
      delete result[PADLET_METADATA_REF_ARRAY_KEY];
    }
  }

  return result;
}

/**
 * Remaps a padlet's Columns-layout `metadata.sectionId` (stored as a string
 * mirroring board_sections.id, a numeric column) to this bundle's local
 * section id. Uses a separate id-map from remapPadletMetadataRefs since
 * section ids and padlet ids are different source-id namespaces. Dangling
 * references (e.g. an already-deleted section) are dropped, matching the
 * padlet ref-key behavior above.
 */
function remapPadletSectionRef(
  metadata: Record<string, unknown>,
  sectionLocalIdBySourceId: Map<string, string>,
): Record<string, unknown> {
  const value = metadata[PADLET_METADATA_SECTION_KEY];
  if (typeof value !== 'string') return metadata;

  const result: Record<string, unknown> = { ...metadata };
  const mapped = sectionLocalIdBySourceId.get(value);
  if (mapped) {
    result[PADLET_METADATA_SECTION_KEY] = mapped;
  } else {
    delete result[PADLET_METADATA_SECTION_KEY];
  }
  return result;
}

export class ExportValidationError extends Error {}

interface BuildExportBundleParams {
  supabase: SupabaseClient;
  workspaceId: string;
  workspaceName: string;
  scope: ExportScope;
  /** When provided, export only these boards (plus the folders/padlets they need) instead of every board in the workspace. */
  boardIds?: string[];
}

/**
 * Loads the workspace's boards/folders/padlets and converts them into the
 * portable, normalized export shape, minting fresh bundle-local ids for
 * every record (see lib/export/types.ts).
 *
 * `supabase` must be the caller's session-bound client (RLS-enforced), not
 * the service-role admin client — 'accessible' scope is defined as
 * "whatever this user's RLS policies let them read," so no manual
 * ownership filter is applied here. 'all'/'team-member' scope (which would
 * need to bypass RLS to see other members' private boards) is rejected by
 * the route before this is called.
 */
export async function buildExportBundle({
  supabase,
  workspaceId,
  workspaceName,
  scope,
  boardIds,
}: BuildExportBundleParams): Promise<ExportBundle> {
  if (boardIds && boardIds.length === 0) {
    throw new ExportValidationError('No boards selected for export.');
  }

  const { data: folderRows, error: folderError } = await supabase
    .from('folders')
    .select('id, parent_id, name, icon, color, position')
    .eq('workspace_id', workspaceId);

  if (folderError) {
    throw new Error(`Failed to load folders: ${folderError.message}`);
  }

  let boardQuery = supabase
    .from('boards')
    .select(
      'id, folder_id, title, description, layout, background, background_type, background_value, container_size, comments_enabled, reactions_enabled, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (boardIds) {
    boardQuery = boardQuery.in('id', boardIds);
  }

  const { data: boardRows, error: boardError } = await boardQuery;

  if (boardError) {
    throw new Error(`Failed to load boards: ${boardError.message}`);
  }

  if (boardIds) {
    // RLS silently filters inaccessible rows rather than erroring, so a
    // requested id missing from the result means it doesn't exist, isn't in
    // this workspace, or isn't accessible to the current user — reject the
    // whole request rather than silently exporting a subset of what was asked for.
    const returnedIds = new Set((boardRows ?? []).map((board) => board.id));
    const inaccessibleIds = boardIds.filter((id) => !returnedIds.has(id));
    if (inaccessibleIds.length) {
      throw new ExportValidationError(
        `${inaccessibleIds.length} selected board(s) are not accessible or do not exist: ${inaccessibleIds.join(', ')}`,
      );
    }
  }

  const boardSourceIds = (boardRows ?? []).map((board) => board.id);

  const { data: padletRows, error: padletError } = boardSourceIds.length
    ? await supabase
        .from('padlets')
        .select(
          'id, board_id, title, content, color, type, position_x, position_y, width, height, file_url, file_name, file_type, file_size, location_lng, location_lat, location_label, location_mapbox_id, location_precision, metadata, created_at, updated_at',
        )
        .in('board_id', boardSourceIds)
    : { data: [] as PadletRow[], error: null };

  if (padletError) {
    throw new Error(`Failed to load padlets: ${padletError.message}`);
  }

  const { data: boardSectionRows, error: boardSectionError } = boardSourceIds.length
    ? await supabase
        .from('board_sections')
        .select('id, board_id, title, description, position, created_at, updated_at')
        .in('board_id', boardSourceIds)
    : { data: [] as BoardSectionRow[], error: null };

  if (boardSectionError) {
    throw new Error(`Failed to load board sections: ${boardSectionError.message}`);
  }

  // Pass 1: mint local ids for every folder before resolving parent_id refs,
  // since a folder can reference a sibling that appears later in the array.
  const folderLocalIdBySourceId = new Map<string, string>();
  (folderRows ?? []).forEach((row: FolderRow, index) => {
    folderLocalIdBySourceId.set(row.id, `f_${index}`);
  });

  const folders: NormalizedFolder[] = (folderRows ?? []).map((row: FolderRow) => {
    let parentRef: string | null = null;
    if (row.parent_id) {
      const resolvedParentRef = folderLocalIdBySourceId.get(row.parent_id);
      if (!resolvedParentRef) {
        throw new Error(
          `Folder "${row.name}" has a parent folder this export cannot read (folder id ${row.parent_id}).`,
        );
      }
      parentRef = resolvedParentRef;
    }

    return {
      localId: folderLocalIdBySourceId.get(row.id)!,
      parentRef,
      name: row.name,
      icon: row.icon,
      color: row.color,
      position: row.position,
    };
  });

  const boardLocalIdBySourceId = new Map<string, string>();
  const boards: NormalizedBoard[] = (boardRows ?? []).map((row: BoardRow, index) => {
    const localId = `b_${index}`;
    boardLocalIdBySourceId.set(row.id, localId);

    // folders SELECT RLS is workspace-membership-based and does not enforce
    // a folder's own access/private/members/teams restriction, while board
    // visibility can pass via straight ownership even when the folder
    // itself would normally deny that user (e.g. a board owner whose
    // workspace membership has since lapsed). Readability is therefore NOT
    // guaranteed symmetric — a visible board's folder_id can, in that edge
    // case, fail to resolve here. Treat that as an integrity problem rather
    // than silently detaching the board from its folder.
    let folderRef: string | null = null;
    if (row.folder_id) {
      const resolvedFolderRef = folderLocalIdBySourceId.get(row.folder_id);
      if (!resolvedFolderRef) {
        throw new Error(
          `Board "${row.title}" is in a folder this export cannot read (folder id ${row.folder_id}). ` +
            'This usually means folder access changed after the board was created. Ask a workspace admin to check folder permissions before exporting.',
        );
      }
      folderRef = resolvedFolderRef;
    }

    return {
      localId,
      folderRef,
      title: row.title,
      description: row.description,
      layout: row.layout,
      background: normalizeBoardBackground(row.background),
      backgroundType: row.background_type,
      backgroundValue: row.background_value,
      containerSize: row.container_size,
      commentsEnabled: row.comments_enabled ?? true,
      reactionsEnabled: row.reactions_enabled ?? true,
      originalCreatedAt: row.created_at,
      originalUpdatedAt: row.updated_at,
    };
  });

  const padletLocalIdBySourceId = new Map<string, string>();
  (padletRows ?? []).forEach((row: PadletRow, index) => {
    padletLocalIdBySourceId.set(row.id, `p_${index}`);
  });

  // board_sections.id is numeric but padlet.metadata.sectionId stores it as a
  // string (see components/canvas/layouts/ColumnsLayout.tsx), so key this map
  // by the stringified source id to match how sectionId is actually compared.
  const sectionLocalIdBySourceId = new Map<string, string>();
  (boardSectionRows ?? []).forEach((row: BoardSectionRow, index) => {
    sectionLocalIdBySourceId.set(String(row.id), `s_${index}`);
  });

  const boardSections: NormalizedBoardSection[] = (boardSectionRows ?? []).map(
    (row: BoardSectionRow) => ({
      localId: sectionLocalIdBySourceId.get(String(row.id))!,
      boardRef: boardLocalIdBySourceId.get(row.board_id)!,
      title: row.title,
      description: row.description,
      position: row.position,
      originalCreatedAt: row.created_at,
      originalUpdatedAt: row.updated_at,
    }),
  );

  const padlets: NormalizedPadlet[] = (padletRows ?? []).map((row: PadletRow) => {
    const metadataWithRefs = remapPadletMetadataRefs(row.metadata ?? {}, padletLocalIdBySourceId);
    const metadata = remapPadletSectionRef(metadataWithRefs, sectionLocalIdBySourceId);

    return {
      localId: padletLocalIdBySourceId.get(row.id)!,
      boardRef: boardLocalIdBySourceId.get(row.board_id)!,
      title: row.title,
      content: row.content,
      color: row.color,
      type: row.type,
      positionX: row.position_x,
      positionY: row.position_y,
      width: row.width,
      height: row.height,
      fileUrl: row.file_url,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      locationLng: row.location_lng,
      locationLat: row.location_lat,
      locationLabel: row.location_label,
      locationMapboxId: row.location_mapbox_id,
      locationPrecision: row.location_precision,
      metadata,
      originalCreatedAt: row.created_at,
      originalUpdatedAt: row.updated_at,
    };
  });

  // Prune to only the folders these boards actually need, walking each
  // board's folder up through parentRef so nested chains stay resolvable
  // (an ancestor can be "needed" even if no selected board sits in it directly).
  const neededFolderLocalIds = new Set<string>();
  const folderByLocalId = new Map(folders.map((folder) => [folder.localId, folder]));
  const markFolderAndAncestors = (localId: string | null) => {
    let current = localId;
    while (current && !neededFolderLocalIds.has(current)) {
      neededFolderLocalIds.add(current);
      current = folderByLocalId.get(current)?.parentRef ?? null;
    }
  };
  boards.forEach((board) => markFolderAndAncestors(board.folderRef));
  const neededFolders = folders.filter((folder) => neededFolderLocalIds.has(folder.localId));

  const data: ExportData = { folders: neededFolders, boards, padlets, boardSections };

  return {
    manifest: {
      type: 'collabboard-workspace-export',
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      exportedFromWorkspaceId: workspaceId,
      exportedFromWorkspaceName: workspaceName,
      scope,
      counts: {
        folders: data.folders.length,
        boards: data.boards.length,
        padlets: data.padlets.length,
        boardSections: data.boardSections.length,
      },
    },
    data,
  };
}

export async function buildExportZip(bundle: ExportBundle): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(bundle.manifest, null, 2));
  zip.file('data.json', JSON.stringify(bundle.data, null, 2));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
