// @vitest-environment jsdom
// PATCH FREEFORM-TABLE-SELECTION: Freeform Table was selected on mousedown
// (handlePadletMouseDown, shared across all post types) but had no card-level
// click handler of its own, unlike Clipart. The click that follows selection
// bubbled unobstructed to CanvasClient's blank-canvas deselect handler, which
// clears selection unless a padlet's own click already stopped it -- so Table
// selected on mousedown, then immediately deselected again on the very same
// click. Clipart never hit this because its own card `onClick` already calls
// `e.stopPropagation()`. These are source/architecture assertions in the
// same style as the sibling PATCH POST-RESIZE-B3.1 suite
// (containerResizeB3.integration.test.tsx) -- FreeformPadletCards.tsx is not
// mounted directly in this repo's test suite; browser acceptance remains
// responsible for real click/DOM behavior.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const cardsSrc = code(read('components/collabboard/canvas/ui/FreeformPadletCards.tsx'));

function branch(startMarker: string, endMarker: string): string {
  const start = cardsSrc.indexOf(startMarker);
  const end = cardsSrc.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return cardsSrc.slice(start, end);
}

describe('PATCH FREEFORM-TABLE-SELECTION Table click no longer races the blank-canvas deselect', () => {
  it('Table click → selected → click does NOT bubble to canvas deselect → Table remains selected', () => {
    const tableBranch = branch("if (padlet.type === 'table') {", "if (padlet.type === 'todo') {");

    // Selected on mousedown via the SAME shared mechanism every post type
    // uses -- unchanged, not part of this fix.
    expect(cardsSrc).toContain('handlePadletMouseDown(e, padlet.id);');

    // The fix: Table's own card-level wrapper now stops its click from
    // bubbling to CanvasClient's blank-canvas deselect handler, exactly
    // mirroring Clipart's existing card-level guard.
    expect(tableBranch).toContain('onClick={(e) => e.stopPropagation()}');
  });

  it('the guard sits on Table\'s own wrapper, immediately around {content}/{resizeHandle}, not injected earlier in the branch', () => {
    const tableBranch = branch("if (padlet.type === 'table') {", "if (padlet.type === 'todo') {");
    const guardIndex = tableBranch.indexOf('onClick={(e) => e.stopPropagation()}');
    const contentIndex = tableBranch.indexOf('{content}');
    const resizeHandleIndex = tableBranch.indexOf('{resizeHandle}');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(contentIndex);
    expect(contentIndex).toBeLessThan(resizeHandleIndex);
  });

  it('scoped to Table only: the neighboring Link branch\'s own {content}/{resizeHandle} wrapper (same generic machinery, different post type) is untouched -- a plain <div className="relative"> with no click handler', () => {
    // Link's wrapper immediately precedes its OWN {content}, one call before
    // Table's in source order -- slicing back from Table's {content} would
    // include Table's guard, so anchor on Link's own {content} instead.
    const linkContentIndex = cardsSrc.indexOf(
      "onCopyLinkAddress={() => copyLinkAddress(padlet.id)}",
    );
    const linkWrapper = cardsSrc.slice(linkContentIndex, cardsSrc.indexOf('{content}', linkContentIndex));
    expect(linkWrapper).toContain('<div className="relative">');
    expect(linkWrapper).not.toContain('onClick');
  });

  it('Clipart is unchanged: its own pre-existing card-level click guard is untouched', () => {
    const clipartBranch = branch(
      "{padlet.type === 'card' && (",
      "(padlet.type === 'comment' || (padlet.type as string) === 'Comment') && (",
    );
    expect(clipartBranch).toContain('onClick={(e) => {');
    expect(clipartBranch).toContain('e.stopPropagation();');
    expect(clipartBranch).toContain('setSelectedPadletId(padlet.id);');
  });
});
