import type { SourceReference } from './knowledgePersistence';
import { compareKnowledgeSourceReferences } from './knowledgeSourceReferenceIndex';
import {
  formatKnowledgeBacklinkPageHint,
  isKnowledgeBacklinkNote,
  knowledgeBacklinkLabel,
  knowledgeBacklinkRangesForTarget,
  plainTextFromNoteContent,
  type KnowledgeBacklinkPost,
  type KnowledgeSourceBacklink,
} from './knowledgeSourceBacklinks';
import { knowledgeSourceNoteAccentColor } from './knowledgeSourceHighlightColor';

/**
 * PDF Source Notes Panel -- Phase 1. A pure, read-only projection of Notes
 * that cite a Knowledge document, built ENTIRELY from data the board already
 * has in memory (source_references rows + live padlets). No fetch, no
 * Supabase, no persistence: this file only reshapes what
 * knowledgeSourceBacklinks.ts already proved for "Used in Notes" into a
 * richer, per-document summary suitable for a standalone panel.
 *
 * Runtime-independent by construction: every field here comes from already-
 * loaded rows and post metadata, never from a PDF page raster, a crop, or OCR.
 */

/** The minimum a post must expose to become a Source Note summary. */
export interface KnowledgeSourceNotePost extends KnowledgeBacklinkPost {
  readonly metadata?: { readonly topStrip?: unknown; readonly cardColor?: unknown } | null;
}

export type KnowledgeSourceNoteReferenceKind = 'exact-text' | 'page' | 'area';

const MAX_QUOTE_EXCERPT_LENGTH = 140;
const MAX_BODY_EXCERPT_LENGTH = 160;

/**
 * One citation of the current document, presentation-safe only: no OCR, no
 * quote reconstruction, no crop, no raw HTML. id is the source reference's
 * own id -- the one stable identity for a React key, never the visible text.
 */
export interface KnowledgeSourceNoteReferenceDetail {
  readonly id: string;
  readonly kind: KnowledgeSourceNoteReferenceKind;
  readonly pageStart: number;
  readonly pageEnd: number;
  /** Plain-text, capped. Only ever set for kind: 'exact-text'. */
  readonly quoteExcerpt: string | null;
}

/** One panel item: one Note, its citations of ONE document aggregated. */
export interface KnowledgeSourceNoteSummary {
  readonly targetPadletId: string;
  readonly title: string;
  readonly bodyExcerpt: string;
  readonly accentColor: string | null;
  readonly pageHint: string;
  readonly references: readonly KnowledgeSourceNoteReferenceDetail[];
}

/** Document id -> its citing Notes, in the summary builder's own order. */
export type KnowledgeSourceNoteSummaryIndex = ReadonlyMap<string, readonly KnowledgeSourceNoteSummary[]>;

export const EMPTY_KNOWLEDGE_SOURCE_NOTE_SUMMARY_INDEX: KnowledgeSourceNoteSummaryIndex = new Map();

const ELLIPSIS = '...';

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}

/** Same identification the persisted region branch already uses: no OCR here either. */
function referenceKind(reference: SourceReference): KnowledgeSourceNoteReferenceKind {
  if (reference.region !== null) return 'area';
  if (reference.quoteText !== null && reference.charStart !== null && reference.charEnd !== null) {
    return 'exact-text';
  }
  // A page-only reference's own quoteText may still carry a page snapshot --
  // that is evidence for the server, never a selected quote to display here.
  return 'page';
}

function referenceDetail(reference: SourceReference): KnowledgeSourceNoteReferenceDetail {
  const kind = referenceKind(reference);
  return {
    id: String(reference.id),
    kind,
    pageStart: reference.pageStart,
    pageEnd: reference.pageEnd,
    quoteExcerpt: kind === 'exact-text' && reference.quoteText !== null
      ? truncate(reference.quoteText, MAX_QUOTE_EXCERPT_LENGTH)
      : null,
  };
}

function documentTargetKey(documentId: string, targetPadletId: string): string {
  return `${documentId}::${targetPadletId}`;
}

/**
 * Inverts already-loaded references + live posts into document -> summaries.
 *
 * References are sorted ONCE by the existing createdAt/id authority before
 * grouping, so within every document bucket a Note's summary lands at its
 * EARLIEST citation of that document -- the one deterministic order this
 * projection defines.
 *
 * A reference whose target is absent from posts, or is not a Note, is
 * skipped in silence: exactly knowledgeSourceBacklinks.ts's own rule, so a
 * deleted Note or a non-Note target never produces a dead panel item.
 */
export function buildKnowledgeSourceNoteSummaryIndex(
  references: Iterable<SourceReference>,
  posts: Iterable<KnowledgeSourceNotePost>,
): KnowledgeSourceNoteSummaryIndex {
  const notesById = new Map<string, KnowledgeSourceNotePost>();
  for (const post of posts) {
    if (isKnowledgeBacklinkNote(post)) notesById.set(String(post.id), post);
  }
  if (notesById.size === 0) return EMPTY_KNOWLEDGE_SOURCE_NOTE_SUMMARY_INDEX;

  const sorted = Array.from(references).sort(compareKnowledgeSourceReferences);

  // Pass 1: group the SORTED, eligible references by document, then by
  // target -- first-occurrence order preserved throughout, which is what
  // makes a Note's summary land at its earliest citation of that document.
  const targetOrderByDocument = new Map<string, string[]>();
  const refsByDocumentAndTarget = new Map<string, SourceReference[]>();
  for (const reference of sorted) {
    const note = notesById.get(String(reference.targetPadletId));
    if (!note) continue;

    const documentId = String(reference.sourceDocumentId);
    const targetPadletId = String(reference.targetPadletId);
    const key = documentTargetKey(documentId, targetPadletId);

    const bucket = refsByDocumentAndTarget.get(key);
    if (bucket) { bucket.push(reference); continue; }
    refsByDocumentAndTarget.set(key, [reference]);

    const order = targetOrderByDocument.get(documentId);
    if (order) order.push(targetPadletId);
    else targetOrderByDocument.set(documentId, [targetPadletId]);
  }

  // Pass 2: one summary object per (document, target), built once from its
  // full reference list -- no partial object is ever mutated or replaced.
  const index = new Map<string, readonly KnowledgeSourceNoteSummary[]>();
  for (const [documentId, targetIds] of targetOrderByDocument) {
    const summaries = targetIds.map((targetPadletId): KnowledgeSourceNoteSummary => {
      const docTargetRefs = refsByDocumentAndTarget.get(documentTargetKey(documentId, targetPadletId))!;
      const note = notesById.get(targetPadletId)!;
      const metadata = note.metadata;
      const topStrip = typeof metadata?.topStrip === 'string' ? metadata.topStrip : undefined;
      const cardColor = typeof metadata?.cardColor === 'string' ? metadata.cardColor : undefined;
      // The existing range-merge/format authority, reused rather than
      // reimplemented: a pseudo-backlink per reference is enough, since that
      // authority only ever reads targetPadletId/pageStart/pageEnd from it.
      const pseudoBacklinks: KnowledgeSourceBacklink[] = docTargetRefs.map((reference) => ({
        targetPadletId, label: '', pageStart: reference.pageStart, pageEnd: reference.pageEnd,
      }));
      return {
        targetPadletId,
        title: knowledgeBacklinkLabel(note),
        bodyExcerpt: truncate(plainTextFromNoteContent(note.content ?? ''), MAX_BODY_EXCERPT_LENGTH),
        accentColor: knowledgeSourceNoteAccentColor({ topStrip, cardColor }),
        pageHint: formatKnowledgeBacklinkPageHint(knowledgeBacklinkRangesForTarget(pseudoBacklinks, targetPadletId)),
        references: docTargetRefs.map(referenceDetail),
      };
    });
    index.set(documentId, summaries);
  }
  return index;
}

/** Every Note summary citing one document, in the builder's own order. */
export function knowledgeSourceNoteSummariesForDocument(
  index: KnowledgeSourceNoteSummaryIndex,
  documentId: string | null | undefined,
): readonly KnowledgeSourceNoteSummary[] {
  if (!documentId) return [];
  return index.get(documentId) ?? [];
}
