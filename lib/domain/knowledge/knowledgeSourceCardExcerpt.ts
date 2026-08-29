import type { SourceReference } from './knowledgePersistence';

/**
 * P6J-F8-B2 -- what a card may SHOW of the text a Note cites.
 *
 * Pure derivation over rows the board already loaded -- no read, write, resolve
 * or persist. The excerpt is the capture-time snapshot the server stored; the
 * reader stays authority on where that span sits today.
 *
 * THE GATE IS THE POINT. `quoteText` is populated two very different ways.
 * EXACT SPAN (offsets present): the server sliced its own stored page, compared
 * the slice against the client's claim, refused any mismatch, and stored ITS
 * OWN slice -- short, verified, what B2 exists to display. PAGE ONLY (offsets
 * absent): the client sent a whole page and the server stored it verbatim; live
 * rows run past 1500 characters, and four of the six references on the first
 * board using this feature are of that kind, so showing them would dump a page
 * onto a 280px card AND present unverified client text as canonical provenance.
 * Eligibility is therefore decided by the OFFSETS, never by "is there a quote".
 */

/**
 * UTF-16 code units of stored quote that may reach the card DOM. The
 * persistence limit is 100_000 -- fine for a stored citation, absurd for a card.
 * This keeps the text node small; CSS line-clamping at the render site keeps the
 * card's HEIGHT sane. Clamping alone would still put the whole quote in the
 * document, so both are needed.
 */
export const KNOWLEDGE_SOURCE_CARD_EXCERPT_MAX_LENGTH = 600;

export interface KnowledgeSourceCardExcerpt {
  /** Already clamped, and already carrying its ellipsis when cut. */
  readonly text: string;
  readonly truncated: boolean;
}

/**
 * The offsets that prove the stored quote is the server's own slice.
 * `charEnd > charStart` is checked rather than inherited: the column constraint
 * tolerates `char_end = char_start`, so an empty span is representable even
 * though the write command refuses to create one.
 */
function hasVerifiedExactSpan(reference: SourceReference): boolean {
  const { charStart, charEnd } = reference;
  if (typeof charStart !== 'number' || typeof charEnd !== 'number') return false;
  // Rejects NaN and fractions -- `typeof NaN` is 'number', so this earns its keep.
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return false;
  return charStart >= 0 && charEnd > charStart;
}

/**
 * Cuts to the cap without splitting a surrogate pair: keeping a high surrogate
 * while dropping its low half leaves a character nobody selected, drawn as a
 * replacement glyph. Stepping back one unit drops the astral character whole.
 */
function clampQuote(quote: string): KnowledgeSourceCardExcerpt {
  // Verbatim: never trimmed, collapsed or normalised -- this is the text the server verified.
  if (quote.length <= KNOWLEDGE_SOURCE_CARD_EXCERPT_MAX_LENGTH) {
    return { text: quote, truncated: false };
  }
  const last = quote.charCodeAt(KNOWLEDGE_SOURCE_CARD_EXCERPT_MAX_LENGTH - 1);
  const isHighSurrogate = last >= 0xd800 && last <= 0xdbff;
  const cut = KNOWLEDGE_SOURCE_CARD_EXCERPT_MAX_LENGTH - (isHighSurrogate ? 1 : 0);
  // The ellipsis is ours: the one character here the cited document did not supply.
  return { text: `${quote.slice(0, cut)}…`, truncated: true };
}

/**
 * KNI-R1-H. Distinguishes a genuinely authored Note body from the HTML
 * wrapper noise an emptied TipTap editor still emits (`''`, `<p></p>`,
 * `<p><br></p>`). A small tag-strip, not a parser: this exists only to gate
 * the legacy excerpt fallback below, never to sanitise or persist anything.
 */
function hasMeaningfulNoteContent(noteContent: string): boolean {
  return noteContent.replace(/<[^>]*>/g, '').trim().length > 0;
}

/**
 * The excerpt one card may display, or null when it may display none. A Note
 * with several citations gets nothing: the marker already collapses to
 * "N sources" because choosing one of them to show would misrepresent the rest,
 * and an excerpt would make that choice invisible. Null is the honest answer,
 * not a failure -- the Note still renders, marker and navigation untouched.
 *
 * KNI-R1-F/G. `noteContent` is the ONE other input to this eligibility
 * decision: a post-R1 Note already carries its selection as editable body,
 * so showing the read-only excerpt beside it would print the same passage
 * twice. Only a legacy blank-body Note -- the pre-R1 contract -- still needs
 * this fallback. Defaults to `''` so a caller mid-migration to the new
 * parameter still gets the pre-R1 (fallback-eligible) behaviour rather than a
 * type error.
 */
export function knowledgeSourceCardExcerpt(
  references: readonly SourceReference[],
  noteContent: string = '',
): KnowledgeSourceCardExcerpt | null {
  if (references.length !== 1) return null;
  const [only] = references;
  if (!hasVerifiedExactSpan(only)) return null;
  const { quoteText } = only;
  if (typeof quoteText !== 'string' || quoteText.length === 0) return null;
  if (hasMeaningfulNoteContent(noteContent)) return null;
  return clampQuote(quoteText);
}
