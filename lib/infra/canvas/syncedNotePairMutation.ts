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
  metadata: Record<string, unknown> | null;
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

/** `undefined` means "unchanged"; the RPC needs an explicit null to clear. */
const explicit = <T,>(value: T | undefined): T | null => (value === undefined ? null : value);

/** Omitted rather than nulled, so an absent value clears nothing. */
const present = (key: string, value: string | undefined) =>
  (typeof value === 'string' && value.length > 0 ? { [key]: value } : {});

const isRow = (value: unknown): value is SyncedNotePairRow =>
  typeof value === 'object' && value !== null
  && typeof (value as { id?: unknown }).id === 'string';

export async function updateSyncedNotePair(
  supabase: SupabaseClient,
  input: UpdateSyncedNotePairInput,
): Promise<UpdateSyncedNotePairResult> {
  const { data, error } = await supabase.rpc('update_synced_note_pair', {
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

  if (error) {
    // The function's own typed refusals, by SQLSTATE. The message tokens it
    // raises are generic and carry no ids, so neither branch can enumerate.
    if (error.code === '42501') return { status: 'denied' };
    if (error.code === '22023') return { status: 'invalid_pair' };
    if (error.code === '40001') return { status: 'conflict' };
    return { status: 'failed' };
  }

  // Anything but exactly two well-formed rows is a result this cannot vouch
  // for -- a zero-row reply, a partial reply, or a filtered one. It is never
  // reported as saved.
  if (!Array.isArray(data) || data.length !== 2 || !data.every(isRow)) {
    return { status: 'failed' };
  }
  const [first, second] = data as SyncedNotePairRow[];
  if (first.id === second.id) return { status: 'failed' };
  return { status: 'saved', rows: [first, second] };
}
