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
