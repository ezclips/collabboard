// A line diff, so "apply or discard" is a decision about something visible.
//
// Unit 2 of .agent/wiki-plan.md. Pure domain.
//
// WHY A DIFF AND NOT TWO TEXT BOXES. Unit 0's finding 3: page length varies
// materially run to run at fixed settings -- 11 claims and 18 claims for the
// same topic from the same passages. Two boxes side by side make every recompile
// look like a total rewrite, so the user either accepts blindly or rejects
// blindly. The diff is what makes "the model changed one paragraph and rewrote
// the rest for no reason" a thing a person can see before deciding.

export type BoardWikiDiffKind = 'same' | 'added' | 'removed';

export interface BoardWikiDiffLine {
  readonly kind: BoardWikiDiffKind;
  readonly text: string;
}

/**
 * Longest common subsequence over LINES, which is the granularity a person
 * reviews prose at. Character diffs of rewritten paragraphs are noise.
 *
 * BOUNDED ON PURPOSE. The table is O(n*m), and a compiled page is a screen or
 * two; a pathological input must not lock the browser up while someone waits to
 * decide. Past the bound the answer degrades to "all of it changed", which is
 * honest -- it claims less than a wrong diff would.
 */
const MAX_DIFF_LINES = 600;

export function boardWikiTextDiff(before: string, after: string): readonly BoardWikiDiffLine[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  if (beforeLines.length > MAX_DIFF_LINES || afterLines.length > MAX_DIFF_LINES) {
    return [
      ...beforeLines.map((text) => ({ kind: 'removed' as const, text })),
      ...afterLines.map((text) => ({ kind: 'added' as const, text })),
    ];
  }

  const table: number[][] = Array.from(
    { length: beforeLines.length + 1 },
    () => new Array<number>(afterLines.length + 1).fill(0),
  );
  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      table[i][j] = beforeLines[i] === afterLines[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const lines: BoardWikiDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      lines.push({ kind: 'same', text: beforeLines[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ kind: 'removed', text: beforeLines[i] });
      i += 1;
    } else {
      lines.push({ kind: 'added', text: afterLines[j] });
      j += 1;
    }
  }
  while (i < beforeLines.length) {
    lines.push({ kind: 'removed', text: beforeLines[i] });
    i += 1;
  }
  while (j < afterLines.length) {
    lines.push({ kind: 'added', text: afterLines[j] });
    j += 1;
  }
  return lines;
}

/** Does this diff change anything at all? A recompile that changes nothing should say so. */
export function boardWikiDiffIsEmpty(lines: readonly BoardWikiDiffLine[]): boolean {
  return lines.every((line) => line.kind === 'same');
}
