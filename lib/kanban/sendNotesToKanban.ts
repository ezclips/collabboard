/**
 * PATCH-340. "Send to Kanban" persistence, always through the caller's own
 * Supabase client (RLS decides; no service role). This module owns the three
 * data needs of the feature: the editable-board list the dialog shows, the
 * batch insert of cards, and the one-query-per-board status read the note chip
 * uses.
 */
import { supabaseBrowser } from '@/lib/supabase/browser';
import { noteToKanbanCard, sortNotesForSend } from '@/lib/domain/canvas/noteToKanbanCard';
import type { Padlet } from '@/types/collabboard';

type KanbanClient = ReturnType<typeof supabaseBrowser>;

export interface EditableKanbanBoard {
  id: string;
  title: string;
  updatedAt: string | null;
}

export interface KanbanBoardColumn {
  id: string;
  name: string;
  order: number;
}

export interface SendNotesResult {
  total: number;
  created: Array<{ noteId: string; cardId: string }>;
  failed: number;
}

export interface KanbanLinkStatus {
  boardId: string;
  boardTitle: string;
  columnTitle: string;
  available: boolean;
}

export interface KanbanLinkRef {
  noteId: string;
  boardId: string;
  cardId: string;
}

/**
 * The Kanban boards this user may add cards to: a `kanban_board_members` row
 * with edit/admin, on a board whose layout is Kanban. Most recently updated
 * first, matching the dialog's default ordering.
 */
export async function listEditableKanbanBoards(
  userId: string,
  client: KanbanClient = supabaseBrowser(),
): Promise<EditableKanbanBoard[]> {
  if (!userId) return [];
  const { data: memberships, error } = await client
    .from('kanban_board_members')
    .select('canvas_id')
    .eq('user_id', userId)
    .in('permission_level', ['edit', 'admin']);
  if (error || !memberships) return [];

  const boardIds = Array.from(
    new Set(memberships.map((m) => (m as { canvas_id?: string }).canvas_id).filter((id): id is string => !!id)),
  );
  if (boardIds.length === 0) return [];

  const { data: boards, error: boardsError } = await client
    .from('boards')
    .select('id, title, layout, updated_at')
    .in('id', boardIds)
    .eq('layout', 'kanban')
    .is('deleted_at', null);
  if (boardsError || !boards) return [];

  return (boards as Array<{ id: string; title?: string | null; updated_at?: string | null }>)
    .map((board) => ({
      id: board.id,
      title: board.title && board.title.trim().length > 0 ? board.title : 'Untitled board',
      updatedAt: board.updated_at ?? null,
    }))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

export async function loadBoardColumns(
  boardId: string,
  client: KanbanClient = supabaseBrowser(),
): Promise<KanbanBoardColumn[]> {
  const { data, error } = await client
    .from('kanban_columns')
    .select('id, name, order_index')
    .eq('canvas_id', boardId)
    .order('order_index', { ascending: true });
  if (error || !data) return [];
  return (data as Array<{ id: string; name?: string | null; order_index?: number | null }>).map((column) => ({
    id: column.id,
    name: column.name && column.name.trim().length > 0 ? column.name : 'Column',
    order: Number(column.order_index) || 0,
  }));
}

export async function loadBoardFirstSwimlane(
  boardId: string,
  client: KanbanClient = supabaseBrowser(),
): Promise<string | null> {
  const { data, error } = await client
    .from('kanban_swimlanes')
    .select('id, order_index')
    .eq('canvas_id', boardId)
    .order('order_index', { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return (data[0] as { id?: string }).id ?? null;
}

/** One card to insert, and the note(s) it came from. */
export interface KanbanCardDraft {
  title: string;
  content: string;
  /** PATCH-340: one note. PATCH-342: one or more (merged notes). */
  sourceNoteIds: string[];
}

export interface InsertKanbanCardsResult {
  total: number;
  created: Array<{ cardId: string; sourceNoteIds: string[] }>;
  failed: number;
}

/**
 * Insert card rows at the end of `columnId`, then report exactly which were
 * created. The whole batch is attempted first; if that statement is refused,
 * each row is retried alone so one rejected row cannot lose the rest -- and the
 * caller learns the honest created/failed split. Shared by "One card per note"
 * and the AI suggestions: ONE insert path.
 */
export async function insertKanbanCards(
  params: {
    boardId: string;
    columnId: string;
    swimlaneId: string | null;
    userId: string;
    cards: KanbanCardDraft[];
  },
  client: KanbanClient = supabaseBrowser(),
): Promise<InsertKanbanCardsResult> {
  const total = params.cards.length;
  if (total === 0) return { total: 0, created: [], failed: 0 };

  const { data: existing } = await client
    .from('kanban_cards')
    .select('order_index')
    .eq('canvas_id', params.boardId)
    .eq('column_id', params.columnId);
  let nextOrder = 0;
  for (const row of (existing ?? []) as Array<{ order_index?: number | null }>) {
    const value = Number(row.order_index);
    if (Number.isFinite(value) && value >= nextOrder) nextOrder = value + 1;
  }

  const nowIso = new Date().toISOString();
  const rows = params.cards.map((card, index) => ({
    id: crypto.randomUUID(),
    canvas_id: params.boardId,
    column_id: params.columnId,
    swimlane_id: params.swimlaneId,
    title: card.title,
    content: card.content,
    order_index: nextOrder + index,
    creator_id: params.userId,
    created_at: nowIso,
    updated_at: nowIso,
    sourceNoteIds: card.sourceNoteIds,
  }));

  const insertPayload = rows.map(({ sourceNoteIds: _sourceNoteIds, ...row }) => row);
  const createdIds = new Set<string>();

  const batch = await client.from('kanban_cards').insert(insertPayload).select('id');
  if (!batch.error) {
    for (const row of (batch.data ?? []) as Array<{ id: string }>) createdIds.add(row.id);
  } else {
    for (const row of insertPayload) {
      const single = await client.from('kanban_cards').insert(row).select('id');
      const id = (single.data?.[0] as { id?: string } | undefined)?.id;
      if (!single.error && id) createdIds.add(id);
    }
  }

  const created = rows
    .filter((row) => createdIds.has(row.id))
    .map((row) => ({ cardId: row.id, sourceNoteIds: row.sourceNoteIds }));
  return { total, created, failed: total - created.length };
}

/**
 * Insert one card per note (in reading order) at the end of `columnId`, then
 * report exactly which notes got a card.
 */
export async function sendNotesToKanban(
  params: {
    boardId: string;
    columnId: string;
    swimlaneId: string | null;
    notes: Padlet[];
    userId: string;
  },
  client: KanbanClient = supabaseBrowser(),
): Promise<SendNotesResult> {
  const ordered = sortNotesForSend(params.notes);
  const result = await insertKanbanCards(
    {
      boardId: params.boardId,
      columnId: params.columnId,
      swimlaneId: params.swimlaneId,
      userId: params.userId,
      cards: ordered.map((note) => {
        const card = noteToKanbanCard(note);
        return { title: card.title, content: card.content, sourceNoteIds: [note.id] };
      }),
    },
    client,
  );
  return {
    total: result.total,
    created: result.created.map((entry) => ({ noteId: entry.sourceNoteIds[0], cardId: entry.cardId })),
    failed: result.failed,
  };
}

/**
 * PATCH-342. noteId -> cardId, for linking the notes a created card came from.
 * A note that is the source of several created cards links to the FIRST one;
 * notes no created card used are absent (stay unlinked).
 */
export function buildNoteCardLinks(
  created: Array<{ cardId: string; sourceNoteIds: string[] }>,
): Map<string, string> {
  const links = new Map<string, string>();
  for (const { cardId, sourceNoteIds } of created) {
    for (const noteId of sourceNoteIds) {
      if (!links.has(noteId)) links.set(noteId, cardId);
    }
  }
  return links;
}

/**
 * One read per board for a set of note links: the card's current column title,
 * and whether the card is still readable (RLS returns nothing for a card the
 * user may not see, which reads the same as deleted -- both are "not available").
 */
export async function loadKanbanLinkStatuses(
  links: KanbanLinkRef[],
  client: KanbanClient = supabaseBrowser(),
): Promise<Map<string, KanbanLinkStatus>> {
  const statuses = new Map<string, KanbanLinkStatus>();
  if (links.length === 0) return statuses;

  const byBoard = new Map<string, KanbanLinkRef[]>();
  for (const link of links) {
    const list = byBoard.get(link.boardId) ?? [];
    list.push(link);
    byBoard.set(link.boardId, list);
  }

  for (const [boardId, boardLinks] of byBoard) {
    const cardIds = Array.from(new Set(boardLinks.map((link) => link.cardId)));

    const { data: boardRow } = await client.from('boards').select('id, title').eq('id', boardId).maybeSingle();
    const boardTitle =
      (boardRow as { title?: string | null } | null)?.title?.trim() || 'Kanban board';

    const { data: cards } = await client
      .from('kanban_cards')
      .select('id, column_id')
      .eq('canvas_id', boardId)
      .in('id', cardIds);
    const cardRows = (cards ?? []) as Array<{ id: string; column_id?: string | null }>;

    const columnIds = Array.from(
      new Set(cardRows.map((card) => card.column_id).filter((id): id is string => !!id)),
    );
    const columnTitles = new Map<string, string>();
    if (columnIds.length > 0) {
      const { data: columns } = await client.from('kanban_columns').select('id, name').in('id', columnIds);
      for (const column of (columns ?? []) as Array<{ id: string; name?: string | null }>) {
        columnTitles.set(column.id, column.name ?? '');
      }
    }

    const cardToColumn = new Map(cardRows.map((card) => [card.id, card.column_id ?? null]));
    for (const link of boardLinks) {
      const columnId = cardToColumn.get(link.cardId);
      if (columnId) {
        statuses.set(link.cardId, {
          boardId,
          boardTitle,
          columnTitle: columnTitles.get(columnId) ?? '',
          available: true,
        });
      } else {
        statuses.set(link.cardId, { boardId, boardTitle, columnTitle: '', available: false });
      }
    }
  }

  return statuses;
}
