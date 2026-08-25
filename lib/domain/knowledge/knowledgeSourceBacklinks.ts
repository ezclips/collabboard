import type { SourceReference } from './knowledgePersistence';

/**
 * P6J-F6-B3 -- reverse provenance: one Knowledge document -> the Notes citing it.
 *
 * An in-memory inversion of rows the board already loaded and RLS already
 * authorized: the same `source_references` relation that answers "which source
 * does this Note cite" answers the reverse question, so there is no second
 * index to persist and no document-keyed read to add. Pure and display-only --
 * nothing here fetches, and nothing here knows how to navigate to a Note.
 */

/**
 * The minimum a post must expose to be a backlink target. Structural rather
 * than importing `Padlet`, so the domain layer stays free of the UI's types.
 */
export interface KnowledgeBacklinkPost {
  readonly id: string;
  readonly type: string;
  readonly title?: string | null;
  readonly content?: string | null;
}

/** One Note that cites a document, with the page range of that one citation. */
export interface KnowledgeSourceBacklink {
  readonly targetPadletId: string;
  readonly label: string;
  readonly pageStart: number;
  readonly pageEnd: number;
}

/** Backlinks grouped by the document they cite, in reference order. */
export type KnowledgeSourceBacklinkIndex = ReadonlyMap<string, readonly KnowledgeSourceBacklink[]>;

export const EMPTY_KNOWLEDGE_SOURCE_BACKLINK_INDEX: KnowledgeSourceBacklinkIndex = new Map();

/**
 * What "Note" means here, taken from the application's own predicate rather
 * than the editor's default branch: `useCanvasData` treats exactly `'note'`
 * and `'text'` as note/text padlets, the freeform minimap groups the same
 * pair, and a source-created Note is written as `'text'`
 * (`handleCreateNoteFromKnowledgePage`) -- so both are required. Every other
 * kind (drawing, image, link, file, table, card) may legitimately hold a
 * reference and is excluded from a list that claims to be Notes.
 */
export const KNOWLEDGE_BACKLINK_NOTE_TYPES: readonly string[] = ['note', 'text'];

export function isKnowledgeBacklinkNote(post: KnowledgeBacklinkPost): boolean {
  return KNOWLEDGE_BACKLINK_NOTE_TYPES.includes(post.type);
}

/** Roughly one line in the reader's narrow column. */
export const MAX_KNOWLEDGE_BACKLINK_LABEL_LENGTH = 72;

const FALLBACK_LABEL = 'Note';

/**
 * Note content is TipTap HTML. Tags are removed BEFORE entities are decoded, so
 * a decoded `&lt;` can never reconstitute markup here; the result is then only
 * ever rendered as a React text node, never through dangerouslySetInnerHTML.
 */
function plainTextFromNoteContent(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateLabel(value: string): string {
  if (value.length <= MAX_KNOWLEDGE_BACKLINK_LABEL_LENGTH) return value;
  return `${value.slice(0, MAX_KNOWLEDGE_BACKLINK_LABEL_LENGTH - 1).trimEnd()}…`;
}

/**
 * Title, then a plain-text excerpt of the content, then a generic word. The
 * padlet id is never a label: an opaque UUID tells the reader nothing.
 */
export function knowledgeBacklinkLabel(post: KnowledgeBacklinkPost): string {
  const title = typeof post.title === 'string' ? post.title.trim() : '';
  if (title.length > 0) return truncateLabel(title);

  const content = typeof post.content === 'string' ? plainTextFromNoteContent(post.content) : '';
  if (content.length > 0) return truncateLabel(content);

  return FALLBACK_LABEL;
}

/** A citation covers a page when that page falls inside its inclusive range. */
export function knowledgeBacklinkCoversPage(
  backlink: Pick<KnowledgeSourceBacklink, 'pageStart' | 'pageEnd'>,
  pageNumber: number,
): boolean {
  return backlink.pageStart <= pageNumber && pageNumber <= backlink.pageEnd;
}

/**
 * Inverts already-loaded references into document -> citing Notes.
 *
 * A reference whose target is absent from `posts`, or is not a Note, is
 * skipped in silence: the board only asks for references belonging to posts it
 * holds, so an unresolvable target is a torn-state guard rather than an
 * expected case, and it must never render a blank row or a raw id.
 */
export function buildKnowledgeSourceBacklinkIndex(
  references: Iterable<SourceReference>,
  posts: Iterable<KnowledgeBacklinkPost>,
): KnowledgeSourceBacklinkIndex {
  const notesById = new Map<string, KnowledgeBacklinkPost>();
  for (const post of posts) {
    if (isKnowledgeBacklinkNote(post)) notesById.set(String(post.id), post);
  }
  if (notesById.size === 0) return EMPTY_KNOWLEDGE_SOURCE_BACKLINK_INDEX;

  const index = new Map<string, KnowledgeSourceBacklink[]>();
  for (const reference of references) {
    const note = notesById.get(String(reference.targetPadletId));
    if (!note) continue;

    const documentId = String(reference.sourceDocumentId);
    const backlink: KnowledgeSourceBacklink = {
      targetPadletId: String(reference.targetPadletId),
      label: knowledgeBacklinkLabel(note),
      pageStart: reference.pageStart,
      pageEnd: reference.pageEnd,
    };

    const bucket = index.get(documentId);
    if (bucket) bucket.push(backlink);
    else index.set(documentId, [backlink]);
  }

  return index;
}

/** Every citation of one document, one entry per reference row. */
export function knowledgeSourceBacklinksForDocument(
  index: KnowledgeSourceBacklinkIndex,
  documentId: string | null | undefined,
): readonly KnowledgeSourceBacklink[] {
  if (!documentId) return [];
  return index.get(documentId) ?? [];
}

/**
 * One entry per Note, keeping its first citation. "Used in Notes · N" counts
 * Notes, not rows: a Note citing one document three times contributes one.
 */
export function knowledgeSourceBacklinkTargets(
  backlinks: readonly KnowledgeSourceBacklink[],
): readonly KnowledgeSourceBacklink[] {
  const seen = new Set<string>();
  const targets: KnowledgeSourceBacklink[] = [];
  for (const backlink of backlinks) {
    if (seen.has(backlink.targetPadletId)) continue;
    seen.add(backlink.targetPadletId);
    targets.push(backlink);
  }
  return targets;
}

/** The same per-Note collapse, restricted to citations covering one page. */
export function knowledgeSourceBacklinkTargetsOnPage(
  backlinks: readonly KnowledgeSourceBacklink[],
  pageNumber: number,
): readonly KnowledgeSourceBacklink[] {
  return knowledgeSourceBacklinkTargets(
    backlinks.filter((backlink) => knowledgeBacklinkCoversPage(backlink, pageNumber)),
  );
}

/** An inclusive span of pages, after overlapping citations have been coalesced. */
export interface KnowledgeBacklinkPageRange {
  readonly start: number;
  readonly end: number;
}

/**
 * P6J-F6-B3N -- one rendered row. `targetPadletId` stays the only identity;
 * `displayText` is presentation and must never decide what gets opened.
 */
export interface KnowledgeSourceBacklinkRow {
  readonly targetPadletId: string;
  readonly label: string;
  readonly displayText: string;
}

/**
 * Every page range one Note cites in this document, sorted and coalesced --
 * touching spans included, so p.1 plus p.2 reads as one `pp. 1–2` rather than a
 * list that looks like two separate citations.
 */
export function knowledgeBacklinkRangesForTarget(
  backlinks: readonly KnowledgeSourceBacklink[],
  targetPadletId: string,
): readonly KnowledgeBacklinkPageRange[] {
  const ranges = backlinks
    .filter((backlink) => backlink.targetPadletId === targetPadletId)
    .map((backlink) => ({ start: backlink.pageStart, end: backlink.pageEnd }))
    .sort((a, b) => (a.start - b.start) || (a.end - b.end));

  const merged: KnowledgeBacklinkPageRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      if (range.end > last.end) merged[merged.length - 1] = { start: last.start, end: range.end };
      continue;
    }
    merged.push(range);
  }
  return merged;
}

/** `p. 2`, `pp. 2–4`, `pp. 1, 3–4`. Empty for a Note with no ranges. */
export function formatKnowledgeBacklinkPageHint(
  ranges: readonly KnowledgeBacklinkPageRange[],
): string {
  if (ranges.length === 0) return '';
  const parts = ranges.map((range) => (
    range.start === range.end ? `${range.start}` : `${range.start}–${range.end}`
  ));
  const plural = ranges.length > 1 || ranges[0].start !== ranges[0].end;
  return `${plural ? 'pp.' : 'p.'} ${parts.join(', ')}`;
}

/**
 * Document-level rows, with a page hint appended ONLY where two Notes would
 * otherwise read identically -- a source-created Note inherits the PDF's
 * filename as its title, so two Notes citing one document legitimately render
 * the same label (runtime B3 hit exactly that). The hint tells them apart for
 * the reader; it takes no part in identifying either.
 */
export function knowledgeSourceBacklinkDocumentRows(
  backlinks: readonly KnowledgeSourceBacklink[],
): readonly KnowledgeSourceBacklinkRow[] {
  const targets = knowledgeSourceBacklinkTargets(backlinks);
  const labelCounts = new Map<string, number>();
  for (const target of targets) {
    labelCounts.set(target.label, (labelCounts.get(target.label) ?? 0) + 1);
  }

  return targets.map((target) => {
    const hint = (labelCounts.get(target.label) ?? 0) > 1
      ? formatKnowledgeBacklinkPageHint(
        knowledgeBacklinkRangesForTarget(backlinks, target.targetPadletId),
      )
      : '';
    return {
      targetPadletId: target.targetPadletId,
      label: target.label,
      displayText: hint.length > 0 ? `${target.label} · ${hint}` : target.label,
    };
  });
}

/** Page-level rows: under a `Page N` heading already, so no hint is added. */
export function knowledgeSourceBacklinkPageRows(
  backlinks: readonly KnowledgeSourceBacklink[],
  pageNumber: number,
): readonly KnowledgeSourceBacklinkRow[] {
  return knowledgeSourceBacklinkTargetsOnPage(backlinks, pageNumber).map((target) => ({
    targetPadletId: target.targetPadletId,
    label: target.label,
    displayText: target.label,
  }));
}
