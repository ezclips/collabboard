import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PADLET_METADATA_REF_ARRAY_KEY,
  PADLET_METADATA_REF_KEYS,
  PADLET_METADATA_SECTION_KEY,
} from '@/lib/export/types';

type BoardRow = {
  id: string;
  title: string;
};

type PadletRow = {
  id: string;
  board_id: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
};

type BoardSectionRow = {
  id: number;
  board_id: string;
};

export interface OrphanedRefFinding {
  padletId: string;
  boardId: string;
  boardTitle: string;
  padletTitle: string;
  field:
    | 'parentId'
    | 'coverChildId'
    | 'coverPadletId'
    | 'coverChildPadletId'
    | 'childPadletIds'
    | 'sectionId';
  danglingValue: string;
}

interface FindOrphanedPadletReferencesParams {
  supabase: SupabaseClient;
  workspaceId: string;
  boardIds?: string[];
}

export async function findOrphanedPadletReferences({
  supabase,
  workspaceId,
  boardIds,
}: FindOrphanedPadletReferencesParams): Promise<OrphanedRefFinding[]> {
  let boardQuery = supabase
    .from('boards')
    .select('id, title')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (boardIds && boardIds.length > 0) {
    boardQuery = boardQuery.in('id', boardIds);
  }

  const { data: boardRows, error: boardError } = await boardQuery;
  if (boardError) {
    throw new Error(`Failed to load boards: ${boardError.message}`);
  }

  const boards = (boardRows || []) as BoardRow[];
  const boardIdSet = new Set(boards.map((board) => board.id));
  if (boardIdSet.size === 0) {
    return [];
  }

  const boardTitleById = new Map(boards.map((board) => [board.id, board.title]));

  const { data: padletRows, error: padletError } = await supabase
    .from('padlets')
    .select('id, board_id, title, metadata')
    .in('board_id', [...boardIdSet]);

  if (padletError) {
    throw new Error(`Failed to load padlets: ${padletError.message}`);
  }

  const { data: boardSectionRows, error: boardSectionError } = await supabase
    .from('board_sections')
    .select('id, board_id')
    .in('board_id', [...boardIdSet]);

  if (boardSectionError) {
    throw new Error(`Failed to load board sections: ${boardSectionError.message}`);
  }

  const padlets = (padletRows || []) as PadletRow[];
  const boardSections = (boardSectionRows || []) as BoardSectionRow[];

  const validPadletIdsByBoardId = new Map<string, Set<string>>();
  for (const padlet of padlets) {
    const existing = validPadletIdsByBoardId.get(padlet.board_id) || new Set<string>();
    existing.add(padlet.id);
    validPadletIdsByBoardId.set(padlet.board_id, existing);
  }

  const validSectionIdsByBoardId = new Map<string, Set<string>>();
  for (const section of boardSections) {
    const existing = validSectionIdsByBoardId.get(section.board_id) || new Set<string>();
    existing.add(String(section.id));
    validSectionIdsByBoardId.set(section.board_id, existing);
  }

  const findings: OrphanedRefFinding[] = [];

  for (const padlet of padlets) {
    const metadata = (padlet.metadata || {}) as Record<string, unknown>;
    const validPadletIds = validPadletIdsByBoardId.get(padlet.board_id) || new Set<string>();
    const validSectionIds = validSectionIdsByBoardId.get(padlet.board_id) || new Set<string>();
    const boardTitle = boardTitleById.get(padlet.board_id) || 'Untitled board';
    const padletTitle = padlet.title?.trim() || '';

    for (const key of PADLET_METADATA_REF_KEYS) {
      const value = metadata[key];
      if (typeof value === 'string' && !validPadletIds.has(value)) {
        findings.push({
          padletId: padlet.id,
          boardId: padlet.board_id,
          boardTitle,
          padletTitle,
          field: key,
          danglingValue: value,
        });
      }
    }

    const childIds = metadata[PADLET_METADATA_REF_ARRAY_KEY];
    if (Array.isArray(childIds)) {
      for (const childId of childIds) {
        if (typeof childId === 'string' && !validPadletIds.has(childId)) {
          findings.push({
            padletId: padlet.id,
            boardId: padlet.board_id,
            boardTitle,
            padletTitle,
            field: PADLET_METADATA_REF_ARRAY_KEY,
            danglingValue: childId,
          });
        }
      }
    }

    const sectionId = metadata[PADLET_METADATA_SECTION_KEY];
    if (typeof sectionId === 'string' && !validSectionIds.has(sectionId)) {
      findings.push({
        padletId: padlet.id,
        boardId: padlet.board_id,
        boardTitle,
        padletTitle,
        field: PADLET_METADATA_SECTION_KEY,
        danglingValue: sectionId,
      });
    }
  }

  return findings;
}
