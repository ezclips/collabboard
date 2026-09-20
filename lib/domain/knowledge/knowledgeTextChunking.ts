// Paragraph chunking for sources that are text all the way down.
//
// SEPARATE FROM knowledgeChunking.ts ON PURPOSE. That module chunks PDF
// ELEMENTS -- it carries bounding boxes, reading order, element types and table
// coordinates, because a PDF chunk has to point at a rectangle on a page. A
// text file has none of those and inventing them would be the same mistake as
// inventing a page number. The two share a destination table, not an algorithm.
//
// ===========================================================================
// THE SLICE IS THE CHUNK, AND THAT IS WHAT MAKES LOSSLESSNESS STRUCTURAL
// ===========================================================================
//
// Every chunk's text is exactly `source.slice(charStart, charEnd)`, the spans
// are contiguous, and they cover the source from 0 to its length. So
// concatenating the chunks in chunk_index order reproduces the source byte for
// byte -- not because a step reassembles it carefully, but because nothing was
// ever taken out. Separators (the blank lines between paragraphs) belong to a
// chunk rather than being discarded between them.
//
// That property is what the resolution path spends: a citation names
// [charStart, charEnd) into the SOURCE, and reading it back means finding the
// chunks that overlap the range and slicing. If chunking dropped a single
// newline, every offset after it would point one character early -- silently,
// and further out of step with each paragraph.
//
// `assertLosslessChunking` states it as a check anyway. Structural or not, it
// is the invariant ingestion refuses on, and a refusal at ingest is a source
// that never entered the corpus rather than a citation that quietly lands in
// the wrong sentence.

import { isSafeTextCutIndex, safeTextCutIndex } from './knowledgeTextCanonical';

/** One chunk of a pageless text source. */
export interface KnowledgeTextChunkDraft {
  /** Byte-for-byte `source.slice(charStart, charEnd)`. */
  readonly text: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly chunkIndex: number;
}

/**
 * The paragraph budget. A chunk is closed once it reaches MIN and the next
 * paragraph would not fit under MAX; a single paragraph longer than MAX is
 * split at whitespace.
 *
 * These are a starting budget, not a measured optimum -- the plan says to
 * measure them against real sources during acceptance, and they should move if
 * that measurement says so. They are stated here, once, rather than spelled
 * into the algorithm.
 */
export const KNOWLEDGE_TEXT_CHUNK_MIN_CHARS = 300;
export const KNOWLEDGE_TEXT_CHUNK_MAX_CHARS = 800;

/** A span of the source: [start, end). */
interface Span { readonly start: number; readonly end: number; }

/**
 * Paragraph spans covering the WHOLE source with no gaps.
 *
 * A blank-line run ends the paragraph it follows rather than forming a span of
 * its own, so the separator travels with the text it separates and the spans
 * stay contiguous.
 */
function paragraphSpans(source: string): readonly Span[] {
  const spans: Span[] = [];
  const breaks = /\n[ \t]*\n[ \s]*/g;
  let start = 0;
  let match = breaks.exec(source);
  while (match !== null) {
    spans.push({ start, end: match.index + match[0].length });
    start = match.index + match[0].length;
    match = breaks.exec(source);
  }
  if (start < source.length) spans.push({ start, end: source.length });
  return spans;
}

/**
 * Split one over-long span at whitespace, never mid-word where that is
 * avoidable. A run of non-whitespace longer than MAX (a URL, a base64 blob) is
 * cut hard -- a chunk that exceeded the budget would be worse than a cut, and
 * the offsets stay exact either way.
 */
function splitLongSpan(source: string, span: Span): readonly Span[] {
  const out: Span[] = [];
  let start = span.start;
  while (span.end - start > KNOWLEDGE_TEXT_CHUNK_MAX_CHARS) {
    const limit = start + KNOWLEDGE_TEXT_CHUNK_MAX_CHARS;
    const window = source.slice(start, limit);
    const cut = window.search(/\s(?=\S*$)/);
    // `cut + 1` keeps the whitespace with the chunk that precedes it, which is
    // what keeps the spans contiguous.
    const wanted = cut > KNOWLEDGE_TEXT_CHUNK_MIN_CHARS ? start + cut + 1 : limit;
    // NEVER BETWEEN A SURROGATE PAIR. A hard cut at the budget can land inside
    // an astral character -- an emoji, most often -- and split it into two
    // halves that render as replacement glyphs on both sides of the boundary,
    // in the chunk text AND in every citation whose range crosses it. Moving
    // back one keeps the pair whole and keeps the chunk under budget.
    const end = safeTextCutIndex(source, wanted);
    // Defensive: a cut that moved back to where it started would not advance.
    if (end <= start) {
      out.push({ start, end: limit + 1 <= span.end ? limit + 1 : span.end });
      start = limit + 1 <= span.end ? limit + 1 : span.end;
      continue;
    }
    out.push({ start, end });
    start = end;
  }
  if (start < span.end) out.push({ start, end: span.end });
  return out;
}

/**
 * The chunks of a text source.
 *
 * Returns none for a source with nothing in it -- an empty or whitespace-only
 * file indexes nothing rather than contributing a chunk that matches every
 * query weakly. That is the control the acceptance names.
 */
export function buildKnowledgeTextChunks(source: string): readonly KnowledgeTextChunkDraft[] {
  if (source.trim().length === 0) return [];

  const units = paragraphSpans(source).flatMap((span) => (
    span.end - span.start > KNOWLEDGE_TEXT_CHUNK_MAX_CHARS
      ? splitLongSpan(source, span)
      : [span]
  ));

  const drafts: KnowledgeTextChunkDraft[] = [];
  let open: Span | null = null;
  for (const unit of units) {
    if (open === null) {
      open = unit;
      continue;
    }
    const grown = unit.end - open.start;
    const enough = open.end - open.start >= KNOWLEDGE_TEXT_CHUNK_MIN_CHARS;
    if (enough && grown > KNOWLEDGE_TEXT_CHUNK_MAX_CHARS) {
      drafts.push({ text: source.slice(open.start, open.end), charStart: open.start, charEnd: open.end, chunkIndex: drafts.length });
      open = unit;
      continue;
    }
    open = { start: open.start, end: unit.end };
  }
  if (open !== null) {
    drafts.push({ text: source.slice(open.start, open.end), charStart: open.start, charEnd: open.end, chunkIndex: drafts.length });
  }
  return drafts;
}

/** One stored chunk, as the resolution path reads it back. */
export interface KnowledgeStoredTextChunk {
  readonly text: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly chunkIndex: number;
}

/**
 * The text a citation names, stitched from the chunks that cover it.
 *
 * THE INVERSE OF THE CHUNKER, AND IT DEPENDS ON THE SAME INVARIANT. Because
 * chunk texts are exact, contiguous slices, the chunks overlapping
 * [charStart, charEnd) can be concatenated and sliced to yield precisely what
 * the source held there -- no chunk boundary is visible in the result, and a
 * selection that straddles two paragraphs comes back whole.
 *
 * FAILS CLOSED, and this is the important part. A range that is not fully
 * covered returns null rather than the fragment that happens to be present.
 * The existing PDF path refuses a selection whose stored text does not match
 * what the client claimed, for the same reason: a citation that silently
 * returns LESS than it names is a quotation the reader believes is complete.
 */
export function stitchKnowledgeTextRange(
  chunks: readonly KnowledgeStoredTextChunk[],
  charStart: number,
  charEnd: number,
): string | null {
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return null;
  if (charStart < 0 || charEnd <= charStart) return null;

  const covering = [...chunks]
    .filter((chunk) => chunk.charEnd > charStart && chunk.charStart < charEnd)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
  if (covering.length === 0) return null;

  // Contiguity across exactly the requested span, checked rather than assumed:
  // these rows came from the database, and a gap here means the range crosses
  // a chunk that is missing.
  if (covering[0].charStart > charStart) return null;
  if (covering[covering.length - 1].charEnd < charEnd) return null;
  for (let i = 1; i < covering.length; i += 1) {
    if (covering[i].charStart !== covering[i - 1].charEnd) return null;
  }
  for (const chunk of covering) {
    if (chunk.text.length !== chunk.charEnd - chunk.charStart) return null;
  }

  const base = covering[0].charStart;
  const joined = covering.map((chunk) => chunk.text).join('');
  const slice = joined.slice(charStart - base, charEnd - base);
  return slice.length === charEnd - charStart ? slice : null;
}

/**
 * The invariant ingestion refuses on. Returns null when it holds, and the
 * reason when it does not.
 *
 * Checked rather than trusted because the cost of it being wrong is not a
 * failed upload -- it is a corpus of citations that each land a little way from
 * what they quote, with nothing on screen to suggest it.
 */
export function assertLosslessChunking(
  source: string,
  chunks: readonly KnowledgeTextChunkDraft[],
): string | null {
  if (chunks.length === 0) {
    return source.trim().length === 0 ? null : 'Chunking produced nothing for a non-empty source';
  }
  let expectedIndex = 0;
  let cursor = 0;
  for (const chunk of chunks) {
    if (chunk.chunkIndex !== expectedIndex) {
      return `Chunk indexes are not 0..n in order (saw ${chunk.chunkIndex}, expected ${expectedIndex})`;
    }
    if (chunk.charStart !== cursor) {
      return `Chunk ${chunk.chunkIndex} starts at ${chunk.charStart}, leaving a gap or overlap at ${cursor}`;
    }
    if (chunk.charEnd <= chunk.charStart) {
      return `Chunk ${chunk.chunkIndex} is empty or inverted`;
    }
    if (chunk.text !== source.slice(chunk.charStart, chunk.charEnd)) {
      return `Chunk ${chunk.chunkIndex} text does not match its own span`;
    }
    // A boundary inside a surrogate pair leaves half an astral character at
    // the end of one chunk and half at the start of the next. Both halves
    // survive concatenation, so losslessness alone would not catch it.
    if (!isSafeTextCutIndex(source, chunk.charStart) || !isSafeTextCutIndex(source, chunk.charEnd)) {
      return `Chunk ${chunk.chunkIndex} boundary splits a surrogate pair`;
    }
    cursor = chunk.charEnd;
    expectedIndex += 1;
  }
  if (cursor !== source.length) {
    return `Chunks cover ${cursor} of ${source.length} characters`;
  }
  if (chunks.map((chunk) => chunk.text).join('') !== source) {
    // Unreachable if the span checks above hold. Stated anyway because it is
    // the property in the words ingestion uses, and a future change to the
    // span rules should fail on the SENTENCE, not only on its consequences.
    return 'Concatenated chunks do not reproduce the source';
  }
  return null;
}
