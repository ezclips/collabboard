/**
 * PATCH-341. Reverse lookup for "From brainstorm": the link lives only on the
 * Freeform note (`padlets.metadata.kanbanLink = { boardId, cardId }`,
 * PATCH-340), so a Kanban board finds its linked notes with the caller's own
 * client -- RLS decides, and a note the user cannot read is simply not found.
 */
import { supabaseBrowser } from '@/lib/supabase/browser';
import { noteToKanbanCard } from '@/lib/domain/canvas/noteToKanbanCard';
import type { Padlet } from '@/types/collabboard';

type KanbanClient = ReturnType<typeof supabaseBrowser>;

export const NOTE_LABEL_MAX = 60;

export interface BrainstormLink {
  noteId: string;
  boardId: string;
  boardTitle: string;
  noteLabel: string;
}

export type BrainstormLinksByCard = Map<string, BrainstormLink[]>;

interface PadletLinkRow {
  id: string;
  board_id: string;
  title?: string | null;
  content?: string | null;
  metadata?: { kanbanLink?: { boardId?: unknown; cardId?: unknown } } | null;
}

/**
 * One read per Kanban board load: every note whose `kanbanLink.boardId` is this
 * board, grouped by the card it points at. A query failure returns an empty map
 * (logged without any note content) rather than throwing.
 */
export async function loadBrainstormLinks(
  kanbanBoardId: string,
  client: KanbanClient = supabaseBrowser(),
): Promise<BrainstormLinksByCard> {
  const byCard: BrainstormLinksByCard = new Map();
  if (!kanbanBoardId) return byCard;

  const { data, error } = await client
    .from('padlets')
    .select('id, board_id, title, content, metadata')
    .eq('metadata->kanbanLink->>boardId', kanbanBoardId);

  if (error || !data) {
    if (error) {
      const message = (error as { message?: string; code?: string }).message ?? (error as { code?: string }).code;
      console.error('Failed to load brainstorm links:', message ?? 'unknown error');
    }
    return byCard;
  }

  const rows = data as PadletLinkRow[];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const sourceBoardIds = new Set<string>();
  const rawLinks: Array<{ cardId: string; noteId: string; boardId: string }> = [];

  for (const row of rows) {
    const link = row.metadata?.kanbanLink;
    if (!link || typeof link.boardId !== 'string' || typeof link.cardId !== 'string') continue;
    // Defensive: the query already filters on this, but never trust a JSON path.
    if (link.boardId !== kanbanBoardId) continue;
    rawLinks.push({ cardId: link.cardId, noteId: row.id, boardId: row.board_id });
    sourceBoardIds.add(row.board_id);
  }

  if (rawLinks.length === 0) return byCard;

  const boardTitles = new Map<string, string>();
  const { data: boards } = await client
    .from('boards')
    .select('id, title')
    .in('id', Array.from(sourceBoardIds));
  for (const board of (boards ?? []) as Array<{ id: string; title?: string | null }>) {
    boardTitles.set(board.id, board.title?.trim() || 'Untitled board');
  }

  for (const link of rawLinks) {
    const row = rowsById.get(link.noteId);
    if (!row) continue;
    const noteLabel = noteToKanbanCard({ title: row.title ?? '', content: row.content ?? '' } as Padlet)
      .title.slice(0, NOTE_LABEL_MAX);
    const list = byCard.get(link.cardId) ?? [];
    list.push({
      noteId: link.noteId,
      boardId: link.boardId,
      boardTitle: boardTitles.get(link.boardId) ?? 'Untitled board',
      noteLabel,
    });
    byCard.set(link.cardId, list);
  }

  return byCard;
}
