// SYNCED_NOTE_PAIR_ATOMIC_UPDATE_1 -- the only client route to the atomic
// synced-Note update.
//
// Deliberately narrow: it names the RPC, shapes its arguments, and classifies
// its outcome. It performs no compensating write, no retry and no repair. A
// result that is not a genuine two-row success is reported as such, never
// softened into one -- the defect this replaces was a client that believed two
// independent writes had both landed.
import type { SupabaseClient } from '@supabase/supabase-js';

/** Merged into BOTH members. `null` clears the key back to its default. */
export type SyncedNoteSharedAppearance = {
  cardColor?: string | null;
  topStrip?: string | null;
  textColor?: string | null;
  titleStyle?: Record<string, unknown> | null;
};

/** Merged into the EDITED member only: per-record, never synchronized. */
export type SyncedNoteSourceMetadata = {
  reactions?: string[] | null;
  badgeColor?: string | null;
  detachedComments?: unknown[] | null;
  commentTitle?: string | null;
  commentTitleStyle?: Record<string, unknown> | null;
  /**
   * The scheduler defaults `withSchedulerDefaults` produces, which are the
   * edited Note's OWN dates and not its twin's. Unlike every key above, these
   * are never sent as null: that helper only ever ADDS a missing default, so
   * omitting an absent one leaves whatever is stored alone rather than
   * clearing it.
   */
  start_date?: string;
  end_date?: string;
};

export type SyncedNotePairRow = {
  id: string;
  title: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
};

export type UpdateSyncedNotePairResult =
  /** Both rows came back committed. Only this may be treated as persisted. */
  | { status: 'saved'; rows: readonly [SyncedNotePairRow, SyncedNotePairRow] }
  /** The board refused this caller. */
  | { status: 'denied' }
  /** Missing, self-linked, non-reciprocal, cross-board, wrong-type or malformed. */
  | { status: 'invalid_pair' }
  /** The transaction rolled back rather than update exactly two rows. */
  | { status: 'conflict' }
  /** Transport, unexpected database fault, or a shape this cannot verify. */
  | { status: 'failed' };

export type UpdateSyncedNotePairInput = {
  padletId: string;
  /** The twin this save is FOR. A reply naming anything else is not it. */
  twinId: string;
  boardId: string;
  title: string;
  content: string;
  shared: SyncedNoteSharedAppearance;
  sourceOnly: SyncedNoteSourceMetadata;
};

/**
 * The twin id a record declares, or null. Anything that is not a non-empty
 * string is NOT a synced Note: the caller keeps its ordinary single-row path
 * rather than sending a malformed pair to the database.
 */
export function readSyncedTwinId(metadata: unknown): string | null {
  const value = (metadata as { syncedWith?: unknown } | null | undefined)?.syncedWith;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The editor sends its WHOLE payload every save, using `undefined` for a field
 * the user cleared: here undefined means "clear it" and must arrive as an
 * explicit null, since JSON drops the key and the RPC reads omission as
 * "unchanged".
 */
const explicit = <T,>(value: T | undefined): T | null => (value === undefined ? null : value);

/** The opposite rule, and the only fields on it: withSchedulerDefaults only
 *  ADDS a missing default, so omission must mean "unchanged" here -- a null
 *  would delete dates the editor was never asked to touch. */
const present = (key: string, value: string | undefined) =>
  (typeof value === 'string' && value.length > 0 ? { [key]: value } : {});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A plain JSON object: not an array, not null, not a primitive. */
const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The complete shape reconciliation reads; a row failing ANY part of it is
 *  never written into local state. */
const isRow = (value: unknown): value is SyncedNotePairRow => {
  if (!isJsonObject(value)) return false;
  const { id, title, content, metadata } = value;
  return typeof id === 'string' && UUID.test(id)
    && (title === null || typeof title === 'string')
    && (content === null || typeof content === 'string')
    && isJsonObject(metadata);
};

export async function updateSyncedNotePair(
  supabase: SupabaseClient,
  input: UpdateSyncedNotePairInput,
): Promise<UpdateSyncedNotePairResult> {
  // A transport fault or an offline client can reject, or return nothing at
  // all: each is this adapter's failure to report, never an exception thrown
  // back through saveNote.
  const send = () => supabase.rpc('update_synced_note_pair', {
    p_padlet_id: input.padletId,
    p_board_id: input.boardId,
    p_title: input.title,
    p_content: input.content,
    p_shared_appearance: {
      cardColor: explicit(input.shared.cardColor),
      topStrip: explicit(input.shared.topStrip),
      textColor: explicit(input.shared.textColor),
      titleStyle: explicit(input.shared.titleStyle),
    },
    p_source_metadata: {
      reactions: explicit(input.sourceOnly.reactions),
      badgeColor: explicit(input.sourceOnly.badgeColor),
      detachedComments: explicit(input.sourceOnly.detachedComments),
      commentTitle: explicit(input.sourceOnly.commentTitle),
      commentTitleStyle: explicit(input.sourceOnly.commentTitleStyle),
      ...present('start_date', input.sourceOnly.start_date),
      ...present('end_date', input.sourceOnly.end_date),
    },
  });
  let data: unknown;
  let error: { code?: string } | null;
  try { ({ data, error } = await send()); } catch { return { status: 'failed' }; }

  if (error) {
    // The function's own typed refusals, by SQLSTATE. The message tokens it
    // raises are generic and carry no ids, so neither branch can enumerate.
    if (error.code === '42501') return { status: 'denied' };
    if (error.code === '22023') return { status: 'invalid_pair' };
    if (error.code === '40001') return { status: 'conflict' };
    return { status: 'failed' };
  }

  // Anything but exactly two well-formed rows naming the pair this call asked
  // about is a result it cannot vouch for, and is never reported as saved.
  if (!Array.isArray(data) || data.length !== 2 || !data.every(isRow)) {
    return { status: 'failed' };
  }
  const [first, second] = data as SyncedNotePairRow[];
  // Exactly the two records this call named, once each and in either order.
  const wanted = [input.padletId, input.twinId].sort().join('|');
  if (first.id === second.id || [first.id, second.id].sort().join('|') !== wanted) {
    return { status: 'failed' };
  }
  // Still a pair on arrival: rows no longer pointing at each other are not one.
  if (first.metadata.syncedWith !== second.id || second.metadata.syncedWith !== first.id) {
    return { status: 'failed' };
  }
  return { status: 'saved', rows: [first, second] };
}
