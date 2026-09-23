import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_TRANSCRIPT_READING_BLOCK_TARGET_CHARS,
  knowledgeTranscriptReadingBlocks,
} from './knowledgeTranscriptReadingLayout';

/**
 * THE PARTITION INVARIANT IS THE WHOLE SAFETY ARGUMENT.
 *
 * These blocks are used to GROUP the render, never to rewrite the string, so the
 * one property that must never break is that concatenating the blocks' slices
 * reproduces the text character for character. A dropped or duplicated separator
 * would move every character offset after it, and those offsets are the
 * coordinate space for selections, highlights and citations.
 */

const reconstruct = (text: string, target?: number) =>
  knowledgeTranscriptReadingBlocks(text, target)
    .map((block) => text.slice(block.charStart, block.charEnd))
    .join('');

describe('the partition invariant', () => {
  it('reconstructs the text exactly, for these shapes', () => {
    const cases: readonly string[] = [
      '',
      'one line with no newline',
      'first line\nsecond line\nthird line\nfourth line',
      'trailing newline\n',
      'consecutive\n\nnewlines\n\n\ntoo',
      `${'x'.repeat(900)}\nshort\nafter a long one`,
      '\n',
      '\n\n\n',
    ];
    for (const text of cases) {
      expect(reconstruct(text), JSON.stringify(text)).toBe(text);
    }
  });

  it('reconstructs exactly at a tiny target, which forces many cuts', () => {
    const text = 'alpha\nbravo\ncharlie\ndelta\necho\nfoxtrot\ngolf\nhotel\nindia';
    expect(reconstruct(text, 5)).toBe(text);
  });

  it('reconstructs exactly with an over-long line present', () => {
    const text = `short\n${'y'.repeat(2000)}\nshort again`;
    expect(reconstruct(text, 100)).toBe(text);
  });
});

describe('blocks are contiguous and ascending', () => {
  const text = 'aaa\nbbb\nccc\nddd\neee\nfff\nggg\nhhh\niii\njjj';

  it('first starts at 0 and last ends at text.length', () => {
    const blocks = knowledgeTranscriptReadingBlocks(text, 10);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].charStart).toBe(0);
    expect(blocks[blocks.length - 1].charEnd).toBe(text.length);
  });

  it('each block starts where the previous ended', () => {
    const blocks = knowledgeTranscriptReadingBlocks(text, 10);
    for (let i = 1; i < blocks.length; i += 1) {
      expect(blocks[i].charStart).toBe(blocks[i - 1].charEnd);
    }
  });

  it('every range is non-empty and ordered', () => {
    for (const block of knowledgeTranscriptReadingBlocks(text, 10)) {
      expect(block.charEnd).toBeGreaterThan(block.charStart);
    }
  });
});

describe('no block boundary falls inside a line', () => {
  const text = 'alpha\nbravo\ncharlie\ndelta\necho\nfoxtrot\ngolf';

  it('every charEnd except the last is immediately after a newline', () => {
    const blocks = knowledgeTranscriptReadingBlocks(text, 12);
    for (const block of blocks.slice(0, -1)) {
      expect(text[block.charEnd - 1], `block ending at ${block.charEnd}`).toBe('\n');
    }
  });

  it('holds when the last line has no trailing newline', () => {
    const noTrailing = 'alpha\nbravo\ncharlie';
    const blocks = knowledgeTranscriptReadingBlocks(noTrailing, 8);
    for (const block of blocks.slice(0, -1)) {
      expect(noTrailing[block.charEnd - 1]).toBe('\n');
    }
    expect(blocks[blocks.length - 1].charEnd).toBe(noTrailing.length);
  });
});

describe('a line longer than the target', () => {
  it('is its own single block, never split', () => {
    const long = 'z'.repeat(500);
    const text = `before\n${long}\nafter`;
    const blocks = knowledgeTranscriptReadingBlocks(text, 50);
    // The block owns the long line AND the newline that terminates it, which is
    // the partition rule -- so the slice is the line plus one separator.
    const longBlock = blocks.find((block) => text.slice(block.charStart, block.charEnd).includes(long));
    expect(longBlock).toBeDefined();
    expect(text.slice(longBlock!.charStart, longBlock!.charEnd)).toBe(`${long}\n`);
    // Its content is the line alone once the terminating separator is removed,
    // and the run is whole -- not split across two blocks.
    expect(text.slice(longBlock!.charStart, longBlock!.charEnd).replace(/\n$/, '')).toBe(long);
    const blocksTouchingTheRun = blocks.filter(
      (block) => block.charStart < longBlock!.charEnd && block.charEnd > longBlock!.charStart,
    );
    expect(blocksTouchingTheRun).toHaveLength(1);
  });

  it('does not cause any later cut to land mid-line', () => {
    const text = `${'q'.repeat(300)}\nnext line\nanother line`;
    const blocks = knowledgeTranscriptReadingBlocks(text, 40);
    for (const block of blocks.slice(0, -1)) {
      expect(text[block.charEnd - 1]).toBe('\n');
    }
  });
});

describe('grouping actually groups', () => {
  it('forty short lines make more than one block and fewer than forty', () => {
    const text = Array.from({ length: 40 }, (_, index) => `line number ${index} of the transcript`).join('\n');
    const blocks = knowledgeTranscriptReadingBlocks(text);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.length).toBeLessThan(40);
  });

  it('a single short line is a single block', () => {
    expect(knowledgeTranscriptReadingBlocks('just one line')).toEqual([
      { charStart: 0, charEnd: 'just one line'.length },
    ]);
  });
});

describe('the default target is exported and used', () => {
  it('is the documented 450 characters', () => {
    expect(KNOWLEDGE_TRANSCRIPT_READING_BLOCK_TARGET_CHARS).toBe(450);
  });

  it('an explicit target changes the grouping but not the reconstruction', () => {
    const text = Array.from({ length: 20 }, (_, index) => `cue ${index} with some words here`).join('\n');
    const wide = knowledgeTranscriptReadingBlocks(text, 1000);
    const narrow = knowledgeTranscriptReadingBlocks(text, 50);
    expect(wide.length).toBeLessThan(narrow.length);
    expect(reconstruct(text, 1000)).toBe(text);
    expect(reconstruct(text, 50)).toBe(text);
  });
});
