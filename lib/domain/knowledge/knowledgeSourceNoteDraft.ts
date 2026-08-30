import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from './knowledgeSourceReferenceWrite';
import type {
  KnowledgePageRotation,
  NormalizedPageRegion,
} from './knowledgePageRegionGeometry';

/**
 * P6J-F9-B2. One visual rectangle on ONE page, already transformed into the
 * page's INTRINSIC UNROTATED system by the reader. `appliedRotation` is the
 * rotation that transform used -- verification evidence the server compares
 * against its stored page, as `selectedText` is, and like it never persisted.
 */
export interface KnowledgeSourcePageRegionSelection {
  readonly region: NormalizedPageRegion;
  readonly appliedRotation: KnowledgePageRotation;
}

/**
 * P6J-F5: one Knowledge source page, as the reader surface sees it. Deliberately
 * browser-safe -- no React, no Supabase, no fetch, no node builtins -- so the
 * Knowledge modal, the canvas controller and the tests all agree on one shape.
 */
/**
 * P6J-F6-B4-B2B. One exact selection inside ONE page, in the coordinate system
 * B4-B1 read and B4-B2A writes: page-relative, UTF-16 code units, half-open
 * [charStart, charEnd). The three fields travel together as one object so a
 * half-specified pair -- which the server rejects outright -- cannot be built.
 *
 * `selectedText` is verification evidence, never the stored quote: the server
 * re-derives the canonical text from its own page and compares.
 */
export interface KnowledgeSourceTextSelection {
  readonly charStart: number;
  readonly charEnd: number;
  readonly selectedText: string;
}

export interface KnowledgeSourcePageRequest {
  readonly sourceDocumentId: string;
  readonly originalFilename: string;
  readonly pageNumber: number;
  readonly pageText: string;
  /**
   * Absent or null means the reader captured no valid exact selection, which is
   * the page-only behaviour every pre-B4 caller already has.
   */
  readonly selection?: KnowledgeSourceTextSelection | null;
  /** A visual region instead of a text span; mutually exclusive with `selection`. */
  readonly region?: KnowledgeSourcePageRegionSelection | null;
  /**
   * Text Phase 1. The floating toolbar's chosen highlight color, seeding the
   * SAME existing Note `metadata.topStrip` field -- never a new column, and
   * never `metadata.cardColor` (the card's own, separate background field).
   * Absent or null means no color was chosen, the existing default behavior.
   */
  readonly topStripColor?: string | null;
}

/**
 * Transient provenance carried alongside a not-yet-created Note. Offsets and
 * their selected text joined the client-supplied set at B4-B2A; quoteHash is
 * still server-computed and locator is still unwritable.
 */
export interface KnowledgeSourceReferenceDraft {
  readonly sourceDocumentId: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
  readonly charStart: number | null;
  readonly charEnd: number | null;
  readonly selectedText: string | null;
  /** P6J-F9-B2 source/unrotated rectangle; null for page-only and exact spans. */
  readonly region: NormalizedPageRegion | null;
  /** Verification only; null whenever `region` is. */
  readonly appliedRotation: KnowledgePageRotation | null;
}

export interface KnowledgeSourceNoteDraft {
  readonly title: string;
  readonly content: string;
  readonly sourceReference: KnowledgeSourceReferenceDraft;
  /** Text Phase 1. Seeds the new Note's existing `metadata.topStrip` field. */
  readonly topStripColor: string | null;
}

/**
 * A page longer than the domain limit yields no quote at all rather than a
 * truncated one: a partial snapshot would hash to something that describes text
 * nobody ever read. Absent evidence beats wrong evidence, and the page range
 * still records exactly where the Note came from.
 */
/** One title rule for every mode: the document's name, or a safe default. */
function noteTitle(name: string): string { return name.length > 0 ? name : 'New Note'; }

/**
 * KNI-R1-A. `selectedText` is untrusted PLAIN TEXT lifted from the reader's
 * DOM, never source HTML -- escaping every markup-significant character is
 * what stops a selection like `<img onerror=...>` from becoming an element
 * the card's TipTap render pipeline would treat as structure.
 */
function escapeNoteHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The one place an EXACT_SPAN selection becomes editable Note body: escaped
 * literal text, CR/CRLF folded to LF, line breaks as `<br>`, wrapped in the
 * single paragraph StarterKit already expects. Never trimmed -- the
 * selection the user deliberately made travels through exactly as chosen.
 *
 * KNI-R2: exported so the drop-onto-an-existing-Note gesture reuses this
 * SAME authority rather than re-implementing escaping in the canvas layer.
 */
export function knowledgeSourceSelectionToNoteHtml(selectedText: string): string {
  const normalized = selectedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return `<p>${escapeNoteHtml(normalized).split('\n').join('<br>')}</p>`;
}

/**
 * KNI-R2. A structurally empty TipTap body ('' , whitespace, `<p></p>`,
 * `<p><br></p>`) carries no authored text -- a tag-strip that leaves nothing
 * behind, mirroring knowledgeSourceCardExcerpt's own meaningful-content gate.
 */
function isStructurallyEmptyNoteContent(content: string): boolean {
  return content.replace(/<[^>]*>/g, '').trim().length === 0;
}

/**
 * KNI-R2. Dropping a Source clip onto an EXISTING Note appends the selection
 * as a new paragraph after whatever the Note already says -- it never
 * replaces authored content. A structurally empty existing body (the common
 * case: a fresh Note, or a legacy blank-body source Note) has no wrapper
 * noise worth preserving, so the result is just the new paragraph.
 */
export function appendKnowledgeSourceSelectionToNoteContent(
  existingContent: string,
  selectedText: string,
): string {
  const appended = knowledgeSourceSelectionToNoteHtml(selectedText);
  return isStructurallyEmptyNoteContent(existingContent) ? appended : `${existingContent}${appended}`;
}

function quoteFromPageText(pageText: string): string | null {
  if (pageText.length === 0) return null;
  if (pageText.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) return null;
  // Never trimmed or normalised -- the quote must match its server-side hash byte for byte.
  return pageText;
}

export function buildKnowledgeSourceNoteDraft(
  request: KnowledgeSourcePageRequest,
): KnowledgeSourceNoteDraft {
  // Exactly three shapes, chosen by one test each, so an exact span can never
  // carry a page quote, a page-only draft can never carry half an offset pair,
  // and a region can never carry text evidence F9 never read.
  const selection = request.selection ?? null;
  // A text span outranks a region: the pair is unreachable from the reader,
  // and letting a field B2 introduced change a pre-B2 payload is the worse
  // of the two failures.
  const region = selection === null ? request.region ?? null : null;
  if (region !== null) {
    return {
      title: noteTitle(request.originalFilename),
      content: '',
      topStripColor: request.topStripColor ?? null,
      sourceReference: {
        sourceDocumentId: request.sourceDocumentId,
        pageStart: request.pageNumber,
        pageEnd: request.pageNumber,
        // F9 performs no OCR, so a region quotes nothing: a page snapshot would
        // attribute text to a rectangle nobody read it from, and the server
        // refuses such a write outright.
        quoteText: null,
        charStart: null,
        charEnd: null,
        selectedText: null,
        // Already intrinsic/unrotated: the reader transformed it through the
        // one geometry authority.
        region: region.region,
        appliedRotation: region.appliedRotation,
      },
    };
  }
  return {
    title: noteTitle(request.originalFilename),
    // PAGE_ONLY stays blank: the page text is evidence, not authorship, and
    // lives only in source_references. KNI-R1: an EXACT_SPAN selection is
    // different -- the user deliberately chose it, so it also becomes the
    // Note's initial editable body (escaped, never trimmed). Either way the
    // source reference below stays the untouched, independent provenance
    // record; editing the body afterward can never redefine it.
    content: selection === null ? '' : knowledgeSourceSelectionToNoteHtml(selection.selectedText),
    topStripColor: request.topStripColor ?? null,
    sourceReference: {
      sourceDocumentId: request.sourceDocumentId,
      pageStart: request.pageNumber,
      pageEnd: request.pageNumber,
      // An exact span sends no client quote at all: the server derives the
      // canonical one by slicing its own stored page.
      quoteText: selection === null ? quoteFromPageText(request.pageText) : null,
      // Forwarded verbatim. The reader already proved these coordinates against
      // the rendered page; re-deriving them here would be a second coordinate
      // algorithm, and trimming would break the server's exact comparison.
      charStart: selection === null ? null : selection.charStart,
      charEnd: selection === null ? null : selection.charEnd,
      selectedText: selection === null ? null : selection.selectedText,
      region: null,
      appliedRotation: null,
    },
  };
}
