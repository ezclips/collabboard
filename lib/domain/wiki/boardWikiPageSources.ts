// The wiki page's source set, and the states derived from it.
//
// Unit 1 of .agent/wiki-plan.md. Pure domain: no client, no fetch, no storage.
//
// THE SOURCE SET IS CONTENT, NOT FOREIGN KEYS, and everything here follows from
// that. `source_references` could not serve this table -- its target must be a
// padlet, its source must be a knowledge document, and both columns are
// ON DELETE CASCADE, so a deleted source takes the reference row with it and
// the page silently loses a source it really used. The chat citation path does
// the opposite (jsonb, no FK), which is exactly why a deleted source can be
// rendered as GONE there. A row that cascades away cannot be shown as gone.
//
// So a source is recorded, compared, and rendered -- never deleted by the
// database on its owner's behalf.

import {
  boardAiCitationIdentityKey,
  type BoardAiCitationItem,
} from '../ai/boardAiChatCitation';

/**
 * What a source looked like when the page was compiled.
 *
 * Two shapes because the two source kinds version differently, and neither has
 * anything better available: a knowledge document carries `content_sha256` from
 * ingestion, a board post carries only `updated_at`.
 */
export type BoardWikiSourceVersion =
  | {
    readonly kind: 'document';
    /** From ingestion. Null for a document ingested before hashing existed. */
    readonly contentSha256: string | null;
    /**
     * bigint, carried as a STRING, and ABSENT rather than null when unknown.
     *
     * `| null` is deliberately NOT in this type. A materialized null breaks
     * toEqual expectations that predate the field -- toEqual treats an absent key
     * and undefined as equal, but null as a difference -- and the reader
     * normalizes with `?? null` anyway. Leaving null out makes the compiler
     * enforce that, instead of this comment.
     */
    readonly transcriptMutationRevision?: string;
    /**
     * True when this document carries a transcript representation RIGHT NOW.
     *
     * OPTIONAL and `true`-only: there is no `false`, because absent already
     * means "not a transcript" and a second way to say it is a second thing to
     * keep in step. Set only on a CURRENT version -- never recorded, never
     * parsed back -- because it is a fact about what the reader is looking at,
     * not about what was compiled.
     */
    readonly isTranscript?: true;
    readonly updatedAt: string;
  }
  | {
    readonly kind: 'post';
    readonly updatedAt: string;
  };

/** One recorded source: WHERE it is, and WHAT it was at compile time. */
export interface BoardWikiPageSource {
  readonly item: BoardAiCitationItem;
  readonly version: BoardWikiSourceVersion;
}

/**
 * `current` means the source still exists and has not changed since compile
 * time. `stale` means it exists and has changed. `gone` means it no longer
 * exists, or is no longer visible to this reader -- which amounts to the same
 * thing for someone who cannot open it either way.
 */
export type BoardWikiSourceState = 'current' | 'stale' | 'gone';

export interface BoardWikiSourceStatus {
  readonly source: BoardWikiPageSource;
  readonly state: BoardWikiSourceState;
  /**
   * True when this source is a transcript RIGHT NOW. False when it is not, or
   * is gone -- a source we cannot read is a source we cannot make claims
   * about.
   */
  readonly isTranscript: boolean;
}

/**
 * What each source looks like NOW, keyed by `boardAiCitationIdentityKey`.
 *
 * A key that is absent means gone. That is a deliberate conflation of "deleted"
 * and "no longer readable by this user": the page cannot offer either one, and
 * distinguishing them in the UI would leak the existence of a document to
 * someone who lost access to it.
 */
export type BoardWikiCurrentVersions = ReadonlyMap<string, BoardWikiSourceVersion>;

/**
 * Has this source changed since the page was compiled?
 *
 * A DOCUMENT COMPARES TWO TOKENS, and neither subsumes the other. A transcript
 * carries `content_sha256` -- a fingerprint over canonical text, every cue's
 * character range and timings, and the claimed video identity -- AND
 * `transcript_mutation_revision`, a monotonic counter that advances for
 * metadata-only edits and same-hash format replacements, which leave the hash
 * deliberately unchanged. Compare only the hash and a corrected title reads as
 * current; compare only the revision and a re-imported transcript whose text
 * and timings moved reads as current. So a differing revision, when BOTH sides
 * carry one, is a change on its own.
 *
 * A DOCUMENT ALSO COMPARES ITS HASH. `content_sha256` is the signal that
 * actually tracks content; `updated_at` moves for reasons that are not content
 * at all -- a re-render, a status transition, a backfill. The hash is used when
 * both sides have one, and `updated_at` is the fallback when either does not,
 * because a missing hash must not read as "unchanged". An absent revision on
 * either side falls through to that same logic rather than manufacturing
 * staleness: every page compiled before this field existed has an absent
 * revision, and marking all of them stale would be worse than the defect.
 */
function hasChanged(recorded: BoardWikiSourceVersion, current: BoardWikiSourceVersion): boolean {
  if (recorded.kind !== current.kind) return true;
  if (recorded.kind === 'document' && current.kind === 'document') {
    // Opaque strings compared for inequality, never parsed as numbers: a bigint
    // past Number.MAX_SAFE_INTEGER rounds, and two different revisions would
    // then read as equal.
    const recordedRevision = recorded.transcriptMutationRevision ?? null;
    const currentRevision = current.transcriptMutationRevision ?? null;
    if (recordedRevision !== null && currentRevision !== null && recordedRevision !== currentRevision) {
      return true;
    }
    // `isTranscript` is deliberately NOT compared. It is not a change signal,
    // and it never appears on the recorded side at all.
    if (recorded.contentSha256 !== null && current.contentSha256 !== null) {
      return recorded.contentSha256 !== current.contentSha256;
    }
    return recorded.updatedAt !== current.updatedAt;
  }
  return recorded.updatedAt !== current.updatedAt;
}

/**
 * The state of every recorded source, in the order the page recorded them.
 *
 * THE COMPARISON IS DELIBERATELY COARSE, AND THIS IS THE RULE MOST LIKELY TO BE
 * "FIXED" BY SOMEONE LATER. A changed source marks the page stale EVEN WHEN THE
 * CITED PAGE ITSELF DID NOT CHANGE: editing page 2 of a twelve-page PDF flags a
 * wiki page that cites page 6.
 *
 * That is intended. Comparing per cited page would need per-page version
 * tracking the ingestion path does not produce, and its failure mode is silent
 * -- a page that really did change would read as current. FLAG, DO NOT BURY. A
 * false "check this" costs a glance; a false "still accurate" is the
 * confident-wrong failure this whole stream exists to avoid.
 */
export function boardWikiSourceStates(
  sources: readonly BoardWikiPageSource[],
  current: BoardWikiCurrentVersions,
): readonly BoardWikiSourceStatus[] {
  return sources.map((source) => {
    const now = current.get(boardAiCitationIdentityKey(source.item));
    if (now === undefined) return { source, state: 'gone' as const, isTranscript: false };
    const isTranscript = now.kind === 'document' && now.isTranscript === true;
    return {
      source,
      state: hasChanged(source.version, now) ? 'stale' as const : 'current' as const,
      isTranscript,
    };
  });
}

/**
 * The page-level roll-up.
 *
 * GONE OUTRANKS STALE, because they call for different things: a stale page can
 * be refreshed from its sources, and a page with a gone source cannot be fully
 * refreshed at all -- some of what it says has no source left to check. A page
 * that is both should say the harder thing.
 */
export type BoardWikiPageFreshness = 'current' | 'stale' | 'sources-gone';

export function boardWikiPageFreshness(
  statuses: readonly BoardWikiSourceStatus[],
): BoardWikiPageFreshness {
  if (statuses.some((status) => status.state === 'gone')) return 'sources-gone';
  if (statuses.some((status) => status.state === 'stale')) return 'stale';
  return 'current';
}

/**
 * Reads a stored `sources` array back, entry by entry.
 *
 * Strict, and drops rather than throws -- the same discipline as
 * `boardAiContextItemsFromStored`. This column is jsonb on a table an editor can
 * write, so it is untrusted input: one malformed entry must not brick a page,
 * and must not lend its identity to the entry behind it either.
 *
 * A dropped entry is a source the page no longer claims. That is the safe
 * direction: it under-claims provenance rather than inventing it.
 */
export function boardWikiPageSourcesFromStored(value: unknown): readonly BoardWikiPageSource[] {
  if (!Array.isArray(value)) return [];
  const parsed: BoardWikiPageSource[] = [];
  for (const raw of value) {
    const source = parseSource(raw);
    if (source) parsed.push(source);
  }
  return parsed;
}

function parseSource(raw: unknown): BoardWikiPageSource | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const item = parseItem(entry.item);
  const version = parseVersion(entry.version);
  if (!item || !version) return null;
  return { item, version };
}

/**
 * One citation item, read from untrusted input.
 *
 * Exported because the save path validates a chain of IDENTITIES with no
 * versions attached -- the client is not allowed to assert a version, so it
 * cannot send the `{item, version}` pair `boardWikiPageSourcesFromStored`
 * expects. Same parser either way, so the two paths cannot diverge on what
 * counts as an item.
 */
export function boardWikiCitationItemFromStored(raw: unknown): BoardAiCitationItem | null {
  return parseItem(raw);
}

function parseItem(raw: unknown): BoardAiCitationItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.type !== 'string' || typeof entry.label !== 'string') return null;
  // Rebuilt field by field rather than spread, so a stored object cannot carry
  // extra keys inward -- the same reason the route parsers do it this way.
  const item: Record<string, unknown> = { type: entry.type, label: entry.label };
  if (typeof entry.knowledgeDocumentId === 'string') item.knowledgeDocumentId = entry.knowledgeDocumentId;
  if (typeof entry.padletId === 'string') item.padletId = entry.padletId;
  if (typeof entry.pageNumber === 'number') item.pageNumber = entry.pageNumber;
  if (typeof entry.charStart === 'number') item.charStart = entry.charStart;
  if (typeof entry.charEnd === 'number') item.charEnd = entry.charEnd;
  // An item with no identity at all cannot be compared or opened, so it is not
  // a source -- it is a label, and a label is not provenance.
  if (item.knowledgeDocumentId === undefined && item.padletId === undefined) return null;
  return item as unknown as BoardAiCitationItem;
}

function parseVersion(raw: unknown): BoardWikiSourceVersion | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.updatedAt !== 'string' || entry.updatedAt.length === 0) return null;
  if (entry.kind === 'post') return { kind: 'post', updatedAt: entry.updatedAt };
  if (entry.kind === 'document') {
    return {
      kind: 'document',
      contentSha256: typeof entry.contentSha256 === 'string' ? entry.contentSha256 : null,
      updatedAt: entry.updatedAt,
      // Conditional, never `transcriptMutationRevision: null`: an absent key and
      // null are different to toEqual, and the absent key is what old stored
      // entries really have.
      ...(typeof entry.transcriptMutationRevision === 'string'
        ? { transcriptMutationRevision: entry.transcriptMutationRevision }
        : {}),
    };
  }
  return null;
}
