import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  boardAiCitationIdentityKey,
  boardAiCitationItemFromPassage,
} from '../../domain/ai/boardAiChatCitation';

/**
 * The wiki compiles from the SAME passages the chat cites, so it must build
 * the same citation from them.
 *
 * It used to build its own, and the copy had fallen behind: a pageless passage
 * became a `knowledge-page` with no page number, so every passage of one text
 * source collapsed to a single citation identity and pointed at a page that
 * does not exist. That is Decision 0, and it had been fixed on the chat path
 * only. One rule, one spelling -- this suite pins that there is exactly one.
 */
const source = readFileSync(
  resolve(process.cwd(), 'lib/server/wiki/boardWikiCompileSession.ts'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the wiki does not keep its own copy of the citation rule', () => {
  it('builds every item through the shared function', () => {
    expect(source).toContain('boardAiCitationItemFromPassage(passage)');
  });

  it('constructs no citation item of its own', () => {
    // The literal that was wrong. If it comes back, so does the defect.
    expect(source).not.toContain("type: 'knowledge-page' as const");
    expect(source).not.toContain('pageNumber: passage.pageStart');
  });

  it('aborts rather than dropping a passage it cannot cite', () => {
    // The same standard the unversionable-passage rule already applies: a page
    // whose references are partly guesses is worse than no page.
    expect(source).toContain('if (item === null)');
    expect(source).toMatch(/item === null[\s\S]{0,200}return err\(/);
  });
});

describe('the shared rule, on the passages a wiki compile sees', () => {
  const base = { source: 'knowledge' as const, label: 'kiln-log.md', knowledgeDocumentId: 'doc-1' };

  it('a pageless passage cites its RANGE, and names no page', () => {
    const item = boardAiCitationItemFromPassage({ ...base, charStart: 0, charEnd: 553 });
    expect(item).toEqual({
      type: 'knowledge-selection', knowledgeDocumentId: 'doc-1',
      charStart: 0, charEnd: 553, label: 'kiln-log.md',
    });
    expect(item?.pageNumber).toBeUndefined();
  });

  it('two passages of one text source are two DIFFERENT citations', () => {
    const a = boardAiCitationItemFromPassage({ ...base, charStart: 0, charEnd: 553 })!;
    const b = boardAiCitationItemFromPassage({ ...base, charStart: 553, charEnd: 1004 })!;
    expect(boardAiCitationIdentityKey(a)).not.toBe(boardAiCitationIdentityKey(b));
  });

  it('a PDF passage still cites its page', () => {
    expect(boardAiCitationItemFromPassage({ ...base, label: 'slides.pdf — page 3', pageStart: 3 }))
      .toEqual({ type: 'knowledge-page', knowledgeDocumentId: 'doc-1', pageNumber: 3, label: 'slides.pdf — page 3' });
  });

  it('a post passage cites the post', () => {
    expect(boardAiCitationItemFromPassage({ source: 'post', label: 'Weekly plan', padletId: 'p-1' }))
      .toEqual({ type: 'padlet', padletId: 'p-1', label: 'Weekly plan' });
  });

  it('a passage with neither locator cites nothing', () => {
    expect(boardAiCitationItemFromPassage(base)).toBeNull();
  });
});
