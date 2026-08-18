// @vitest-environment jsdom
// PATCH FREEFORM-CONTAINER-SELECTION: Container had the exact same defect
// proven and fixed for Table/Note/Todo/Link/AI-component (see
// freeformTableSelection.characterization.test.tsx and
// freeformPostSelectionBatch1.characterization.test.tsx): it is selected on
// mousedown (handlePadletMouseDown, shared across every Freeform post type),
// but its own card click was never stopped, so it bubbled unobstructed to
// CanvasClient's blank-canvas deselect handler and cleared selection right
// after it was set. Container's own dedicated branch (not shared with any
// other type) got the same unconditional guard Table did.
//
// Source/architecture assertions in the same style as the sibling suites --
// FreeformPadletCards.tsx is not mounted directly in this repo's test suite;
// browser acceptance remains responsible for real click/DOM behavior.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPostResizeCapability } from '@/lib/domain/canvas/postResizePolicy';

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

describe('PATCH FREEFORM-CONTAINER-SELECTION Container click no longer races the blank-canvas deselect', () => {
  it('Container click → selected → click does NOT bubble to canvas deselect → Container remains selected', () => {
    const containerBranch = branch("if (padlet.type === 'container') {", "return (\n          <NotePostContextMenu");

    // Selected on mousedown via the SAME shared mechanism every post type
    // uses -- unchanged, not part of this fix.
    expect(cardsSrc).toContain('handlePadletMouseDown(e, padlet.id);');

    const guardIndex = containerBranch.indexOf('onClick={(e) => e.stopPropagation()}');
    const contentIndex = containerBranch.indexOf('{content}');
    const resizeHandleIndex = containerBranch.indexOf('{resizeHandle}');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(contentIndex);
    expect(contentIndex).toBeLessThan(resizeHandleIndex);
  });

  it('resize geometry, orientation, auto-grow, and membership are untouched by this fix', () => {
    // Container's B3.1 resize contract (see PATCH POST-RESIZE-B3.1 suite)
    // stays exactly as it was -- this patch only wraps the existing
    // {content}/{resizeHandle} pair with a click guard, nothing inside it.
    expect(getPostResizeCapability({ type: 'container' })).toBe('none');
    expect(cardsSrc).toContain('mode="horizontal-only"');
    expect(cardsSrc).toContain('containerMinWidth = Math.max(');
    expect(cardsSrc).toContain("containerOrientation === 'horizontal' ? containerManualMinRequiredWidth : 0");
    expect(cardsSrc).toContain('onRequiredWidthChange={(requiredWidth) => growContainerWidth(padlet.id, requiredWidth)}');
    expect(cardsSrc).toContain('nextWidth <= currentWidth + 1');
    expect(cardsSrc).not.toContain('attachPostToContainer');
  });

  it('control: Table remains fixed (unchanged by this patch)', () => {
    const tableBranch = branch("if (padlet.type === 'table') {", "if (padlet.type === 'todo') {");
    expect(tableBranch).toContain('onClick={(e) => e.stopPropagation()}');
  });
});
