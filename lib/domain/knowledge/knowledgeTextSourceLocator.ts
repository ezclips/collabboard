// Where a text chunk sits in its source, carried in `source_locators`.
//
// WHY HERE AND NOT IN A COLUMN. knowledge_chunks has char_start/char_end, and
// writing them there is right and is done. But the two consumers -- Board AI
// chat and the Knowledge search proxy -- do not read the table: they read
// `search_board_knowledge_chunks_text`, whose RETURNS TABLE lists page_start,
// page_end, chunk_index, text, source_locators and rank, and NOT the character
// columns. A RETURNS TABLE cannot be widened by CREATE OR REPLACE, so adding
// them would mean DROP + CREATE of the one function both consumers retrieve
// through, in the same migration that changes the chunk constraints.
//
// `source_locators` is jsonb and already travels. So the range rides there as
// well as in its columns: the columns are the truth, this is the truth's way
// out through a function whose shape is fixed. That is Decision 6, reversed,
// and the duplication is the price of not dropping a live function.
//
// A DISCRIMINANT, NOT A SHAPE GUESS. The PDF locator in knowledgeChunking.ts is
// a bbox on a page with an element id and a reading order. Nothing about it
// overlaps with this, and a consumer must never read one as the other, so this
// says what it is in its first field and every reader checks that before
// trusting any number in it.

/** What a text locator calls itself. Never inferred from the absence of a bbox. */
export const KNOWLEDGE_TEXT_LOCATOR_KIND = 'text-range';

export interface KnowledgeTextSourceLocator {
  readonly kind: typeof KNOWLEDGE_TEXT_LOCATOR_KIND;
  /** Inclusive, in UTF-16 code units of the canonical text. */
  readonly charStart: number;
  /** Exclusive. The same half-open convention the chunker and the reader use. */
  readonly charEnd: number;
}

export function buildKnowledgeTextSourceLocator(
  charStart: number,
  charEnd: number,
): KnowledgeTextSourceLocator {
  return { kind: KNOWLEDGE_TEXT_LOCATOR_KIND, charStart, charEnd };
}

/**
 * Reads a range back out of whatever jsonb a row happens to hold.
 *
 * FAILS CLOSED. The value comes from a database column, which means it comes
 * from whatever wrote the row -- including an older build, a PDF's bbox
 * locators, or an empty array. Anything that is not exactly one well-formed
 * text range returns null, and the caller then has a passage with no range
 * rather than a passage claiming a range it cannot support. A citation that
 * cannot name where it points is not emitted at all; it is never approximated.
 */
export function parseKnowledgeTextSourceLocator(value: unknown): KnowledgeTextSourceLocator | null {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const record = candidate as Record<string, unknown>;
    if (record.kind !== KNOWLEDGE_TEXT_LOCATOR_KIND) continue;
    const charStart = record.charStart;
    const charEnd = record.charEnd;
    if (typeof charStart !== 'number' || typeof charEnd !== 'number') return null;
    if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return null;
    // An empty range names no characters, so it cannot be opened and is not a
    // range this function will hand back.
    if (charStart < 0 || charEnd <= charStart) return null;
    return { kind: KNOWLEDGE_TEXT_LOCATOR_KIND, charStart, charEnd };
  }
  return null;
}
