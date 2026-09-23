/**
 * How a transcript's canonical text is grouped for READING, without touching
 * the text itself.
 *
 * ============================================================================
 * WHY THIS EXISTS AND WHY IT CHANGES NOTHING ABOUT THE TEXT
 * ============================================================================
 *
 * A transcript's canonical string is ONE CUE PER LINE, joined by "\n" (see the
 * document builder). Rendered with `whitespace-pre-wrap` that is honest but
 * unreadable: a caption cue is a timing unit, not a sentence, so sentences break
 * mid-phrase at a width nobody chose, and the reader gets 12px text across its
 * full width.
 *
 * THE STRING MUST NOT CHANGE, and this module is built so it cannot. Character
 * offsets into that exact string are the coordinate space for exact selections,
 * stored highlights, Board AI citations -- and, for a transcript, the cue
 * mapping that turns a cited passage back into a moment in the video. A
 * one-character drift sends a citation to the wrong second, and a wrong second
 * looks right. So the fix is GROUPING and CSS, never text processing: this
 * module only reports WHERE to cut, and the renderer collapses whitespace
 * visually while the DOM text nodes -- and therefore every offset -- stay
 * byte-identical.
 *
 * PURE. No I/O, no React, no table names. A function over a string.
 */

/** One reading block: a contiguous slice of the text, `[charStart, charEnd)`. */
export interface KnowledgeTranscriptReadingBlock {
  readonly charStart: number;
  readonly charEnd: number;
}

/**
 * The target size of one reading block, in characters.
 *
 * A block is built from whole cues (whole lines), so this is a THRESHOLD, not a
 * fixed length: lines accumulate until adding one more would reach it. Chosen to
 * land near a comfortable paragraph at the reader's measure (68ch) rather than
 * derived from the corpus -- it is a typographic target, and a block that runs a
 * little over on one long cue is correct behaviour, not a miss.
 */
export const KNOWLEDGE_TRANSCRIPT_READING_BLOCK_TARGET_CHARS = 450;

/**
 * Groups the text into reading blocks by cutting ONLY at line boundaries.
 *
 * THE PARTITION INVARIANT, which is the whole safety argument: the blocks are
 * contiguous and ascending; the first starts at 0; each `charStart` equals the
 * previous `charEnd`; the last ends at `text.length`. Every separator character
 * belongs to exactly one block -- the one it terminates -- so
 * `blocks.map(b => text.slice(b.charStart, b.charEnd)).join('') === text`
 * holds for every input, including a trailing newline and consecutive newlines.
 *
 * Cutting at a line boundary means never cutting mid-cue and therefore never
 * mid-word, which is what keeps a block readable and a character offset
 * meaningful.
 */
export function knowledgeTranscriptReadingBlocks(
  text: string,
  targetChars: number = KNOWLEDGE_TRANSCRIPT_READING_BLOCK_TARGET_CHARS,
): readonly KnowledgeTranscriptReadingBlock[] {
  if (text.length === 0) return [];

  const blocks: KnowledgeTranscriptReadingBlock[] = [];
  // The block being accumulated, then flushed at the first line that would
  // carry it to the target.
  let blockStart = 0;
  // Where the current line began, so a cut can be placed AFTER its newline.
  let lineStart = 0;

  for (let index = 0; index <= text.length; index += 1) {
    const atEnd = index === text.length;
    if (!atEnd && text[index] !== '\n') continue;

    // `index` is a newline, or one past the last character. Include the newline
    // in the line, so a cut immediately after it leaves every separator owned
    // by exactly one block.
    const lineEnd = atEnd ? text.length : index + 1;

    // A single line longer than the target is its OWN block: never split,
    // because splitting would cut mid-line and therefore mid-cue. This is
    // checked against the line alone, so an over-long line flushes whatever
    // came before it and stands apart.
    const lineLength = lineEnd - lineStart;
    const blockLengthIfLineAdded = lineEnd - blockStart;

    if (blockLengthIfLineAdded > targetChars && lineStart > blockStart) {
      // The accumulated lines already form a block; flush it and start fresh at
      // this line.
      blocks.push({ charStart: blockStart, charEnd: lineStart });
      blockStart = lineStart;
    }

    if (lineLength > targetChars) {
      // Over-long single line: its own block, and the next block starts after it.
      blocks.push({ charStart: blockStart, charEnd: lineEnd });
      blockStart = lineEnd;
    }

    lineStart = lineEnd;
  }

  // The tail. Anything not yet flushed -- including a final line with no
  // trailing newline -- becomes the last block, so the partition reaches
  // text.length exactly.
  if (blockStart < text.length) {
    blocks.push({ charStart: blockStart, charEnd: text.length });
  }

  return blocks;
}
