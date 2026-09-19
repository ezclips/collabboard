import { describe, expect, it } from 'vitest';

import { boardWikiDiffIsEmpty, boardWikiTextDiff } from './boardWikiTextDiff';

const render = (lines: ReturnType<typeof boardWikiTextDiff>) =>
  lines.map((line) => `${line.kind === 'same' ? ' ' : line.kind === 'added' ? '+' : '-'}${line.text}`);

describe('the diff shows what actually changed', () => {
  it('keeps untouched lines as context rather than reprinting the page', () => {
    // Finding 3: a recompile rewrites length and wording run to run. If every
    // recompile renders as a total rewrite the user accepts or rejects blindly,
    // which is the same as having no diff.
    expect(render(boardWikiTextDiff('a\nb\nc', 'a\nB\nc'))).toEqual([' a', '-b', '+B', ' c']);
  });

  it('reports a pure insertion as an insertion', () => {
    expect(render(boardWikiTextDiff('a\nc', 'a\nb\nc'))).toEqual([' a', '+b', ' c']);
  });

  it('reports a pure deletion as a deletion', () => {
    expect(render(boardWikiTextDiff('a\nb\nc', 'a\nc'))).toEqual([' a', '-b', ' c']);
  });

  it('an identical page is an empty diff, and says so', () => {
    const lines = boardWikiTextDiff('a\nb', 'a\nb');
    expect(boardWikiDiffIsEmpty(lines)).toBe(true);
    expect(boardWikiDiffIsEmpty(boardWikiTextDiff('a\nb', 'a\nc'))).toBe(false);
  });

  it('a first page compiled from nothing is all addition', () => {
    expect(render(boardWikiTextDiff('', 'new line'))).toEqual(['-', '+new line']);
  });

  it('preserves every line of both sides -- nothing is dropped by the walk', () => {
    const before = 'one\ntwo\nthree\nfour';
    const after = 'zero\none\nthree\nfour\nfive';
    const lines = boardWikiTextDiff(before, after);
    expect(lines.filter((l) => l.kind !== 'added').map((l) => l.text)).toEqual(before.split('\n'));
    expect(lines.filter((l) => l.kind !== 'removed').map((l) => l.text)).toEqual(after.split('\n'));
  });

  it('degrades to a whole-page replacement past its bound rather than locking up', () => {
    // O(n*m) on a pathological input is a frozen tab while someone waits to
    // make a decision. "All of it changed" claims less than a wrong diff.
    const huge = Array.from({ length: 601 }, (_, index) => `line ${index}`).join('\n');
    const lines = boardWikiTextDiff(huge, `${huge}\nextra`);
    expect(lines.some((line) => line.kind === 'same')).toBe(false);
    expect(lines.filter((line) => line.kind === 'removed')).toHaveLength(601);
    expect(lines.filter((line) => line.kind === 'added')).toHaveLength(602);
  });
});
