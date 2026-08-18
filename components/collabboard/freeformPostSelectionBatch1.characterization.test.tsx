// @vitest-environment jsdom
// PATCH FREEFORM-SELECTION-BATCH-1: Note/Todo/Link/AI-component had the exact
// same defect proven and fixed for Table (freeformTableSelection.
// characterization.test.tsx): each is selected on mousedown
// (handlePadletMouseDown, shared across every Freeform post type), but their
// own card click was never stopped, so it bubbled unobstructed to
// CanvasClient's blank-canvas deselect handler and cleared selection right
// after it was set. Link and Todo each own a dedicated branch and got their
// own guard, mirroring Table's. Note and AI-component have NO dedicated
// branch -- they fall through the SAME default wrapper Drawing also uses, so
// their guard is scoped by padlet.type rather than applied to the whole
// wrapper, to leave Drawing (explicitly frozen) untouched.
//
// Source/architecture assertions in the same style as the sibling PATCH
// POST-RESIZE-B3.1/B2 and PATCH FREEFORM-TABLE-SELECTION suites --
// FreeformPadletCards.tsx is not mounted directly in this repo's test suite;
// browser acceptance remains responsible for real click/DOM behavior.
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

function guardPrecedesContent(text: string, guard: string): void {
  const guardIndex = text.indexOf(guard);
  const contentIndex = text.indexOf('{content}');
  const resizeHandleIndex = text.indexOf('{resizeHandle}');
  expect(guardIndex).toBeGreaterThan(-1);
  expect(guardIndex).toBeLessThan(contentIndex);
  expect(contentIndex).toBeLessThan(resizeHandleIndex);
}

describe('PATCH FREEFORM-SELECTION-BATCH-1 Note/Todo/Link/AI-component click no longer races the blank-canvas deselect', () => {
  it('Link: click does NOT bubble to canvas deselect -- guard sits on Link\'s own wrapper', () => {
    const linkBranch = branch("if (padlet.type === 'link') {", "if (padlet.type === 'table') {");
    guardPrecedesContent(linkBranch, 'onClick={(e) => e.stopPropagation()}');
  });

  it('Todo: click does NOT bubble to canvas deselect -- guard sits on Todo\'s own wrapper', () => {
    const todoBranch = branch("if (padlet.type === 'todo') {", "if (padlet.type === 'container') {");
    guardPrecedesContent(todoBranch, 'onClick={(e) => e.stopPropagation()}');
  });

  it('Note and AI-component: click does NOT bubble to canvas deselect -- guard is scoped to their shared fallback wrapper', () => {
    const fallbackBranch = cardsSrc.slice(cardsSrc.indexOf("return (\n          <NotePostContextMenu"));
    const guard = "onClick={(padlet.type === 'text' || padlet.type === 'ai-component') ? (e) => e.stopPropagation() : undefined}";
    guardPrecedesContent(fallbackBranch, guard);
  });

  it('Drawing is untouched: the shared fallback wrapper\'s guard is conditional, not unconditional -- Drawing (and any other type reaching this branch) still gets onClick={undefined}', () => {
    const fallbackBranch = cardsSrc.slice(cardsSrc.indexOf("return (\n          <NotePostContextMenu"));
    // The unconditional form Table/Link/Todo use must NOT appear here --
    // only the type-scoped ternary.
    expect(fallbackBranch).not.toContain('<div className="relative" onClick={(e) => e.stopPropagation()}>');
    expect(fallbackBranch).toContain(": undefined}");
  });

  // Container was frozen/untouched AT THE TIME of this batch (it was still
  // bare here) -- it later received its own identical guard in PATCH
  // FREEFORM-CONTAINER-SELECTION (freeformContainerSelection.
  // characterization.test.tsx owns that assertion now), so this file no
  // longer asserts Container's current state to avoid two suites disagreeing
  // about one fact as later patches land.

  it('control: Table remains fixed (PATCH FREEFORM-TABLE-SELECTION, unchanged by this batch)', () => {
    const tableBranch = branch("if (padlet.type === 'table') {", "if (padlet.type === 'todo') {");
    guardPrecedesContent(tableBranch, 'onClick={(e) => e.stopPropagation()}');
  });

  it('control: Clipart remains fixed (its own pre-existing card-level guard is untouched)', () => {
    const clipartBranch = branch(
      "{padlet.type === 'card' && (",
      "(padlet.type === 'comment' || (padlet.type as string) === 'Comment') && (",
    );
    expect(clipartBranch).toContain('onClick={(e) => {');
    expect(clipartBranch).toContain('e.stopPropagation();');
    expect(clipartBranch).toContain('setSelectedPadletId(padlet.id);');
  });
});
