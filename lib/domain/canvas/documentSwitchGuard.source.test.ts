import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const usePadletSaveSrc = read('hooks/canvas/usePadletSave.ts');

describe('PATCH-149B2-ii §32.14: all eight entry points use the shared guard', () => {
  it('exactly seven requestOpenDocument call sites exist (entries 2-8; entry 1 is guarded via handleToolClick)', () => {
    const count = (src: string) => (src.match(/requestOpenDocument\(/g) || []).length;
    expect(count(canvasClientSrc)).toBe(4); // openPadletInTypeEditor, openDocumentFromPreview, Columns, Rows
    expect(count(freeformSrc)).toBe(3); // openFreeformPadletModal, onEditContent, onReadDocument
  });

  it('no unguarded setDocumentModalDestination writer survives in FreeformPadletCards (source suite fails if 6-8 bypass)', () => {
    expect(freeformSrc).not.toMatch(/setDocumentModalDestination\(/);
  });

  it('requestOpenDocument never overwrites current padletToEdit/destination before a blocked decision is confirmed', () => {
    const start = canvasClientSrc.indexOf('const requestOpenDocument = (post: Padlet, destination: DocumentModalDestination) => {');
    const body = canvasClientSrc.slice(start, canvasClientSrc.indexOf('};', start));
    expect(body).toMatch(/if \(resolveDocumentSwitch\(\{ kind: 'open-document', post, destination \}\)\) return;/);
  });

  it('Keep editing clears the queued continuation and nothing else', () => {
    const start = canvasClientSrc.indexOf('const handleDocumentSwitchKeepEditing');
    const body = canvasClientSrc.slice(start, canvasClientSrc.indexOf(';', start) + 1);
    expect(body).toContain('setQueuedDocumentAction(null)');
    expect(body).not.toMatch(/setDocumentModalDestination|setPadletToEdit/);
  });

  it('every setDocumentModalDestination( call in CanvasClient sits inside a guarded context', () => {
    // Direct writers: the guard machinery itself (resolveDocumentSwitch/requestOpenDocument/
    // handleDocumentSwitchDiscard), plus entry 1 (creation), reached only via handleToolClick's guard.
    expect((canvasClientSrc.match(/setDocumentModalDestination\(/g) || []).length).toBe(5);
  });
});

describe('PATCH-149B2-ii §32.12 O4: handleToolClick and the drawing-editor path are guarded before mutation', () => {
  it('§34.6: the parent dirty state resets when the Document modal closes', () => {
    expect(canvasClientSrc).toMatch(/if \(documentModalDestination === null\) setDocumentIsDirty\(false\);.*\n?.*\}, \[documentModalDestination\]\);/);
  });

  it('handleToolClick calls resolveDocumentSwitch before any tool-state mutation', () => {
    const start = canvasClientSrc.indexOf('const handleToolClick = (toolType: string) => {');
    const body = canvasClientSrc.slice(start, canvasClientSrc.indexOf('setSelectedPadletIds([])', start));
    expect(body).toContain("resolveDocumentSwitch({ kind: 'open-tool', toolType })");
  });

  it("closeDrawingEditorsBeforePadletEdit's sole JSX call site is guarded first, and no naive unconditional clear was substituted", () => {
    // Anchor on the LAST onPadletEdit (the Drawing layout's, not WallCanvas's unrelated
    // one) -- handleDocumentSwitchDiscard's own executor also names this function
    // and a bare first-occurrence text match would hit the wrong site (§31.5 trap).
    const jsxSiteIdx = canvasClientSrc.lastIndexOf('onPadletEdit={(padlet) => {');
    expect(jsxSiteIdx).toBeGreaterThan(canvasClientSrc.indexOf('onPadletEdit={(padlet) => {'));
    const callSiteIdx = canvasClientSrc.indexOf('closeDrawingEditorsBeforePadletEdit();', jsxSiteIdx);
    const before = canvasClientSrc.slice(jsxSiteIdx, callSiteIdx);
    expect(before).toMatch(/resolveDocumentSwitch\(\{ kind: 'open-drawing-editor', padlet \}\)/);
    expect(canvasClientSrc).not.toMatch(/setDocumentModalDestination\(null\);\s*\n\s*closeDrawingEditorsBeforePadletEdit/);
  });
});

describe('PATCH-149B2-ii O-1: saveCard failure-ordering guard (§33.4/§34.9 -- scoped, not whole-file position)', () => {
  const start = usePadletSaveSrc.indexOf('const saveCard = useCallback');
  const body = usePadletSaveSrc.slice(start, usePadletSaveSrc.indexOf(', [\n    canvasId,', start));

  it('no selected-state reset sits between the try block opening and the first persistence attempt', () => {
    const tryIdx = body.indexOf('try {');
    expect(tryIdx).toBeGreaterThan(-1);
    const preamble = body.slice(tryIdx + 'try {'.length, tryIdx + 'try {'.length + 150);
    expect(preamble).not.toMatch(/setPadletToEdit\(null\)/);
    expect(preamble).not.toMatch(/setIsCardEditorOpen\(false\)/);
  });

  it('the catch path still remains below the success-path reset (§32.3, re-verified)', () => {
    const resetAt = body.lastIndexOf('setPadletToEdit(null);');
    const catchAt = body.indexOf('} catch (e) {');
    expect(catchAt).toBeGreaterThan(resetAt);
  });
});

describe('PATCH-149B2-ii: queued continuation is a discriminated descriptor, not a stored callback', () => {
  const guardSrc = read('lib/domain/canvas/documentSwitchGuard.ts');
  it('documentSwitchGuard.ts holds no function-typed field and stays React-free', () => {
    expect(guardSrc).not.toMatch(/callback|useState|useEffect|from 'react'/i);
    expect(guardSrc).toContain("kind: 'open-document'");
    expect(guardSrc).toContain("kind: 'open-tool'");
    expect(guardSrc).toContain("kind: 'open-drawing-editor'");
  });

  it('CanvasClient carries exactly one queued-continuation state slot', () => {
    expect((canvasClientSrc.match(/useState<QueuedDocumentAction \| null>/g) || []).length).toBe(1);
  });
});

describe('PATCH-149B2-ii: scope boundary -- no PDF, Read-affordance, or clipart work', () => {
  it('no PDF-specific branch was added to any authorized B2-ii file', () => {
    const guardSrc = read('lib/domain/canvas/documentSwitchGuard.ts');
    for (const src of [canvasClientSrc, freeformSrc, guardSrc]) expect(src).not.toMatch(/pdf/i);
  });

  it('the B1b-iii Read-affordance owners were not touched by this patch', () => {
    // documentModalRoute.ts (the destination helper) is reused, never modified by B2-ii.
    const routeSrc = read('lib/domain/canvas/documentModalRoute.ts');
    expect(routeSrc).not.toMatch(/QueuedDocumentAction|documentIsDirty|resolveDocumentSwitch/);
  });
});
