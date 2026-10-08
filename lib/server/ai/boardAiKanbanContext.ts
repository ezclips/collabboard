// PATCH-322. Kanban as Board AI context.
//
// SERVER ONLY. Reads `kanban_*` tables through the CALLER'S authenticated
// client, scoped to the route board, after the same board-read authorization
// the other sources use. No admin client is accepted: reading around RLS to
// answer "may I read this" would make the answer meaningless.
//
// A citation says WHERE (card id + label), never WHAT. The blocks below carry
// the card's own text; the passages carry only identity and label.

import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import {
  BOARD_AI_CONTEXT_MAX_SINGLE_CHARS,
  boardAiContextLabel,
  type BoardAiCitablePassage,
  type ResolvedBoardAiContextBlock,
} from '../../domain/ai/boardAiChatContext';

/** The Kanban tables this reader touches. All read with the caller's client. */
export interface BoardAiKanbanQuery extends PromiseLike<{
  data: Array<Record<string, unknown>> | null;
  error: unknown;
}> {
  eq(column: string, value: unknown): BoardAiKanbanQuery;
  in(column: string, values: readonly unknown[]): BoardAiKanbanQuery;
  order(column: string, options: { ascending: boolean }): BoardAiKanbanQuery;
  limit(count: number): BoardAiKanbanQuery;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
}

export interface BoardAiKanbanSupabaseClient {
  from(table: string): { select(columns: string): BoardAiKanbanQuery };
  /**
   * The board-members RPC the Kanban store itself uses. `kanban_board_members`
   * has no `display_name`/`email` columns, so reading that table directly
   * yields nothing usable and every person would degrade to a raw user id --
   * which must never reach a model. This RPC is the one place a display name
   * comes from, and it runs on the caller's own client like every read here.
   */
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
}

const bounded = (text: string): string =>
  text.length <= BOARD_AI_CONTEXT_MAX_SINGLE_CHARS
    ? text
    : `${text.slice(0, BOARD_AI_CONTEXT_MAX_SINGLE_CHARS - 1)}…`;

/** 0/absent none, 1 low, 2 medium, >= 3 high -- the one mapping, server side. */
function priorityWord(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 'none';
  if (num === 1) return 'low';
  if (num === 2) return 'medium';
  return 'high';
}

/** Date only, from a TIMESTAMPTZ or a date-only string. Null when unusable. */
function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The board is a Kanban board, read with the caller's client.
 *
 * A `boards` row the caller cannot see reads as no row at all, so a non-Kanban
 * board and an unreadable one both resolve to false and the item is dropped.
 */
export async function isKanbanBoard(
  client: BoardAiKanbanSupabaseClient,
  boardId: string,
): Promise<Result<boolean, DomainError>> {
  const { data, error } = await client
    .from('boards')
    .select('id, layout')
    .eq('id', boardId)
    .maybeSingle();
  if (error) return err(domainError('unavailable', 'Could not read the board'));
  if (!data) return ok(false);
  return ok(data.layout === 'kanban');
}

/**
 * Board members by user id, resolved to a DISPLAY NAME and nothing else.
 *
 * The RPC is the Kanban store's own source for names; `kanban_board_members`
 * carries no `display_name` and no `email`, so a direct read would leave every
 * person as a raw user id. A member with no display name becomes the literal
 * "a board member" -- an email address or a user id is never written into the
 * block, because both are identity the model has no business receiving.
 */
async function readMemberNames(
  client: BoardAiKanbanSupabaseClient,
  boardId: string,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const { data, error } = await client.rpc('get_board_members_with_profile', { board_id: boardId });
  if (error || !data) return names;
  for (const row of data) {
    const userId = text(row.user_id);
    if (!userId) continue;
    const displayName = text(row.display_name);
    // A DISPLAY NAME CAN ITSELF BE AN EMAIL. Found live: an account's
    // `display_name` was an email address, so "from <email>" reached the model
    // through a field that was supposed to be a name. Anything containing "@"
    // (after trim) is treated as missing rather than sent.
    names.set(
      userId,
      displayName.length > 0 && !displayName.includes('@') ? displayName : 'a board member',
    );
  }
  return names;
}

async function readAssigneeIds(
  client: BoardAiKanbanSupabaseClient,
  cardId: string,
  fallbackAssigneeId: string,
): Promise<readonly string[]> {
  const ids = new Set<string>();
  const { data, error } = await client
    .from('kanban_card_assignees')
    .select('user_id')
    .eq('card_id', cardId);
  if (!error && data) {
    for (const row of data) {
      const userId = text(row.user_id);
      if (userId) ids.add(userId);
    }
  }
  if (ids.size === 0 && fallbackAssigneeId) ids.add(fallbackAssigneeId);
  return [...ids];
}

/**
 * One attached card, proven to sit on THIS board.
 *
 * `.eq('canvas_id', boardId)` is the rule that keeps Board Chat scoped: a card
 * from another board simply is not there for this query. Ancillary reads (a
 * missing column, row, link target or comment) degrade that part of the block
 * rather than failing the turn.
 */
export async function readKanbanCardBlock(
  client: BoardAiKanbanSupabaseClient,
  boardId: string,
  cardId: string,
): Promise<Result<ResolvedBoardAiContextBlock | null, DomainError>> {
  const kanban = await isKanbanBoard(client, boardId);
  if (!kanban.ok) return kanban;
  if (!kanban.value) return ok(null);

  const { data: card, error } = await client
    .from('kanban_cards')
    .select('id, title, content, column_id, swimlane_id, priority, status, project_id, score, date_started, date_due, assignee_id')
    .eq('id', cardId)
    .eq('canvas_id', boardId)
    .maybeSingle();
  if (error) return err(domainError('unavailable', 'Could not read the card'));
  if (!card) return ok(null);

  const title = text(card.title) || 'Untitled';
  const lines: string[] = [title];

  const columnId = text(card.column_id);
  if (columnId) {
    const { data: column, error: columnError } = await client
      .from('kanban_columns')
      .select('name')
      .eq('id', columnId)
      .maybeSingle();
    if (!columnError && column) {
      const name = text(column.name);
      if (name) lines.push(`Column: ${name}`);
    }
  }

  const swimlaneId = text(card.swimlane_id);
  if (swimlaneId) {
    const { data: row, error: rowError } = await client
      .from('kanban_swimlanes')
      .select('name')
      .eq('id', swimlaneId)
      .maybeSingle();
    if (!rowError && row) {
      const name = text(row.name);
      if (name) lines.push(`Row: ${name}`);
    }
  }

  const start = dateOnly(card.date_started);
  const end = dateOnly(card.date_due);
  if (start || end) lines.push(`Dates: ${start ?? '—'} → ${end ?? '—'}`);

  lines.push(`Priority: ${priorityWord(card.priority)}`);
  const status = text(card.status);
  if (status) lines.push(`Status: ${status}`);
  const project = text(card.project_id);
  if (project) lines.push(`Project: ${project}`);
  if (typeof card.score === 'number') lines.push(`Progress: ${card.score}%`);

  const memberNames = await readMemberNames(client, boardId);
  const assigneeIds = await readAssigneeIds(client, cardId, text(card.assignee_id));
  if (assigneeIds.length > 0) {
    lines.push(`People: ${assigneeIds.map((id) => memberNames.get(id) ?? 'a board member').join(', ')}`);
  }

  const description = text(card.content);
  if (description) lines.push(description);

  // Links: this card's outgoing relations, with each target's title.
  const { data: links, error: linksError } = await client
    .from('kanban_links')
    .select('from_card_id, to_card_id, relation')
    .eq('from_card_id', cardId);
  if (!linksError && links && links.length > 0) {
    const targetIds = [...new Set(links.map((link) => text(link.to_card_id)).filter(Boolean))];
    const titles = new Map<string, string>();
    if (targetIds.length > 0) {
      // `.eq('canvas_id', boardId)` keeps a link to a card on ANOTHER board
      // from lending that board's title to this block -- the target simply is
      // not there for this query, exactly as it would not be for the caller.
      const { data: targets, error: targetsError } = await client
        .from('kanban_cards')
        .select('id, title')
        .in('id', targetIds)
        .eq('canvas_id', boardId);
      if (!targetsError && targets) {
        for (const row of targets) titles.set(text(row.id), text(row.title) || 'Untitled');
      }
    }
    const linkLines = links.map((link) => {
      const targetId = text(link.to_card_id);
      // A target not on this board is named by WHAT IT IS, never by its id: the
      // model is told there is a link, not handed an identity it cannot use.
      return `- ${text(link.relation) || 'Relates to'} → ${titles.get(targetId) ?? 'another card'}`;
    });
    lines.push('Links:', ...linkLines);
  }

  // Comments: the NEWEST 20, read newest-first so the cap keeps the recent
  // conversation, then reversed so they read oldest -> newest like a thread.
  const { data: comments, error: commentsError } = await client
    .from('kanban_comments')
    .select('text, user_id, created_at')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (!commentsError && comments && comments.length > 0) {
    const commentLines = [...comments].reverse().map((comment) => {
      // A display name or the literal "a board member" -- never a user id.
      const author = memberNames.get(text(comment.user_id)) ?? 'a board member';
      return `${author}: ${text(comment.text)}`;
    });
    lines.push('Comments:', ...commentLines);
  }

  return ok({
    type: 'kanban-card',
    cardId,
    label: boardAiContextLabel(title),
    text: bounded(lines.join('\n')),
  });
}

interface OrderedCard {
  readonly id: string;
  readonly title: string;
  readonly columnName: string;
  readonly rowName: string;
  readonly dates: string;
  readonly priority: string;
  readonly status: string;
  readonly people: string;
  readonly columnOrder: number;
  readonly rowOrder: number;
  readonly cardOrder: number;
}

/**
 * The whole board as ONE block: one line per card, in column/row/card order.
 *
 * `blockIndex` is this block's position in the array the model is given, so the
 * per-card sub-tokens (`S2.5`) can be read back by the citation layer. The
 * caller knows it; this function cannot.
 */
export async function readKanbanBoardBlock(
  client: BoardAiKanbanSupabaseClient,
  boardId: string,
  blockIndex: number,
): Promise<Result<ResolvedBoardAiContextBlock | null, DomainError>> {
  const kanban = await isKanbanBoard(client, boardId);
  if (!kanban.ok) return kanban;
  if (!kanban.value) return ok(null);

  const { data: cards, error: cardsError } = await client
    .from('kanban_cards')
    .select('id, title, column_id, swimlane_id, priority, status, date_started, date_due, order_index')
    .eq('canvas_id', boardId);
  if (cardsError) return err(domainError('unavailable', 'Could not read the board cards'));
  const cardRows = cards ?? [];

  const columnNames = new Map<string, string>();
  const columnOrder = new Map<string, number>();
  const { data: columns, error: columnsError } = await client
    .from('kanban_columns')
    .select('id, name, order_index')
    .eq('canvas_id', boardId)
    .order('order_index', { ascending: true });
  if (!columnsError && columns) {
    columns.forEach((column, index) => {
      columnNames.set(text(column.id), text(column.name));
      columnOrder.set(text(column.id), typeof column.order_index === 'number' ? column.order_index : index);
    });
  }

  const rowNames = new Map<string, string>();
  const rowOrder = new Map<string, number>();
  const { data: rows, error: rowsError } = await client
    .from('kanban_swimlanes')
    .select('id, name, order_index')
    .eq('canvas_id', boardId)
    .order('order_index', { ascending: true });
  if (!rowsError && rows) {
    rows.forEach((row, index) => {
      rowNames.set(text(row.id), text(row.name));
      rowOrder.set(text(row.id), typeof row.order_index === 'number' ? row.order_index : index);
    });
  }

  const memberNames = await readMemberNames(client, boardId);

  const assigneesByCard = new Map<string, string[]>();
  const cardIds = cardRows.map((card) => text(card.id)).filter(Boolean);
  if (cardIds.length > 0) {
    const { data: assignees, error: assigneesError } = await client
      .from('kanban_card_assignees')
      .select('card_id, user_id')
      .in('card_id', cardIds);
    if (!assigneesError && assignees) {
      for (const row of assignees) {
        const cardId = text(row.card_id);
        const userId = text(row.user_id);
        if (!cardId || !userId) continue;
        const current = assigneesByCard.get(cardId) ?? [];
        current.push(userId);
        assigneesByCard.set(cardId, current);
      }
    }
  }

  const ordered: OrderedCard[] = cardRows.map((card) => {
    const id = text(card.id);
    const columnId = text(card.column_id);
    const swimlaneId = text(card.swimlane_id);
    const people = (assigneesByCard.get(id) ?? []).map((userId) => memberNames.get(userId) ?? 'a board member');
    const start = dateOnly(card.date_started);
    const end = dateOnly(card.date_due);
    return {
      id,
      title: text(card.title) || 'Untitled',
      columnName: columnNames.get(columnId) ?? '—',
      rowName: swimlaneId ? rowNames.get(swimlaneId) ?? '—' : '—',
      dates: start || end ? `${start ?? '—'}→${end ?? '—'}` : 'no dates',
      priority: priorityWord(card.priority),
      status: text(card.status) || '—',
      people: people.length > 0 ? people.join(', ') : '—',
      columnOrder: columnOrder.get(columnId) ?? Number.MAX_SAFE_INTEGER,
      rowOrder: swimlaneId ? rowOrder.get(swimlaneId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
      cardOrder: typeof card.order_index === 'number' ? card.order_index : Number.MAX_SAFE_INTEGER,
    };
  });

  ordered.sort((a, b) => (
    a.columnOrder - b.columnOrder
    || a.rowOrder - b.rowOrder
    || a.cardOrder - b.cardOrder
  ));

  const lines: string[] = [];
  const passages: BoardAiCitablePassage[] = [];
  let omitted = 0;
  // Room kept back so the "how many were left out" note can never be clipped by
  // the final clamp: the note is appended AFTER the last line that fit, and a
  // body trimmed to the ceiling would otherwise lose exactly the sentence that
  // makes the omission loud.
  const bodyBudget = BOARD_AI_CONTEXT_MAX_SINGLE_CHARS - 40;
  ordered.forEach((card, index) => {
    const token = `S${blockIndex + 1}.${index + 1}`;
    const line = `[${token}] ${card.title} · ${card.columnName} · ${card.rowName} · ${card.dates} · ${card.priority} · ${card.status} · ${card.people}`;
    const candidate = [...lines, line].join('\n');
    if (candidate.length > bodyBudget) {
      omitted += 1;
      return;
    }
    lines.push(line);
    passages.push({ source: 'kanban-card', cardId: card.id, label: boardAiContextLabel(card.title) });
  });
  if (omitted > 0) lines.push(`(+${omitted} more cards not shown)`);

  const body = lines.length > 0 ? lines.join('\n') : 'No cards on this board.';

  return ok({
    type: 'kanban-board',
    label: 'Kanban board',
    ...(passages.length > 0 ? { passages } : {}),
    text: bounded(body),
  });
}
