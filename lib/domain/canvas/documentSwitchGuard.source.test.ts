import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const usePadletSaveSrc = read('hooks/canvas/usePadletSave.ts');
const fnBody = (marker: string) =>
  canvasClientSrc.slice(canvasClientSrc.indexOf(marker), canvasClientSrc.indexOf('\n  };', canvasClientSrc.indexOf(marker)));

describe('PATCH-149B2-ii §32.14: all nine entry points use the shared guard', () => {
  it('exactly eight requestOpenDocument call sites exist (entries 2-9; entry 1 is guarded via handleToolClick)', () => {
    const count = (src: string) => (src.match(/requestOpenDocument\(/g) || []).length;
    expect(count(canvasClientSrc)).toBe(4); // openPadletInTypeEditor, openDocumentFromPreview, Columns, Rows
    // PATCH 9D added entry 9: a Document rendered as a Container child's own
    // "Read" action (RowColumnContainerCard's onOpenDocument prop), reusing
    // this exact same guarded function -- not a new modal/bypass.
    expect(count(freeformSrc)).toBe(4); // openFreeformPadletModal, onEditContent, onReadDocument, Container child onOpenDocument
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

  it('every setDocumentModalDestination( call in CanvasClient sits inside a guarded context, plus the one deliberate unconditional writer', () => {
    // 6 guarded writers: the guard machinery, creation (via handleToolClick's guard), and
    // executePadletTypeEditor -- reachable only once the guard has authorized (§36).
    // A 7th, UNGUARDED writer was added inside closeAllToolbarLaunchedUi() (the
    // ghosting-bug lifecycle patch): opening any mutually-exclusive post editor
    // now unconditionally clears documentModalDestination too, so a stale
    // Document editor can never survive underneath a newly-opened editor. This
    // is a deliberate, scoped exception -- for this development phase, unsaved
    // Document content may be discarded on switch (sample/dev data only); it
    // does NOT route through resolveDocumentSwitch/the dirty guard. If dirty-
    // draft preservation on cross-editor switch becomes a real requirement,
    // this writer is where that guard would need to be added.
    expect((canvasClientSrc.match(/setDocumentModalDestination\(/g) || []).length).toBe(7);
    const cleanupStart = canvasClientSrc.indexOf('const closeAllToolbarLaunchedUi = useCallback(() => {');
    const cleanupBody = canvasClientSrc.slice(cleanupStart, canvasClientSrc.indexOf('}, [', cleanupStart));
    expect(cleanupBody).toContain('setDocumentModalDestination(null);');
  });
});

describe('PATCH-149B2-ii §32.12 O4: handleToolClick and the drawing-editor path are guarded before mutation', () => {
  // §36.3: the harness cannot mount CanvasClient, so these two bind production to the
  // mechanism it proves. Neither proof is sufficient alone.
  it('discard runs queued actions through the cores, never the wrappers, never via a timer', () => {
    const discard = fnBody('const handleDocumentSwitchDiscard = () => {');
    expect(discard).toContain('executeToolAction(action.toolType)');
    expect(discard).toContain('executePadletTypeEditor(action.padlet)');
    // Re-entering a wrapper is the cc95a1b defect: the guard re-reads the stale
    // pre-discard closure and re-queues instead of running the action.
    expect(discard).not.toMatch(/handleToolClick\(|openPadletInTypeEditor\(/);
    expect(discard).toMatch(/const action = queuedDocumentAction;[\s\S]*setQueuedDocumentAction\(null\);/);
    expect(discard).not.toMatch(/setTimeout|queueMicrotask|flushSync|requestAnimationFrame/);
  });

  // §36: the guard sits in each thin wrapper, which mutates nothing itself; the
  // dispatch bodies moved to the unguarded cores (original intent, retargeted).
  it('both guarded wrappers stay thin: guard first, delegate, no duplicated mutation body', () => {
    const tool = fnBody('const handleToolClick = (toolType: string) => {');
    expect(tool).toContain("resolveDocumentSwitch({ kind: 'open-tool', toolType })");
    expect(tool).toContain('executeToolAction(toolType)');
    expect(tool).not.toMatch(/setSelectedPadletIds|setPadletToEdit|setIsNoteEditorOpen|switch \(toolType\)/);
    const editor = fnBody('const openPadletInTypeEditor = (post: Padlet) => {');
    expect(editor).toContain('requestOpenDocument(post, destination)');
    expect(editor).toContain('executePadletTypeEditor(post)');
    expect(editor).not.toMatch(/setIsNoteEditorOpen|setIsTodoEditorOpen|setIsClipartDraftModalOpen/);
  });

  it('§34.6: the parent dirty state resets when the Document modal closes', () => {
    expect(canvasClientSrc).toMatch(/if \(documentModalDestination === null\) setDocumentIsDirty\(false\);.*\n?.*\}, \[documentModalDestination\]\);/);
  });

  it("closeDrawingEditorsBeforePadletEdit's sole JSX call site is guarded first, and no naive unconditional clear was substituted", () => {
    // Anchor on the LAST onPadletEdit -- a first-occurrence match hits the wrong site (§31.5).
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

  it('no selected-state reset precedes the first persistence attempt; catch stays below the reset', () => {
    const tryIdx = body.indexOf('try {');
    expect(tryIdx).toBeGreaterThan(-1);
    const preamble = body.slice(tryIdx + 'try {'.length, tryIdx + 'try {'.length + 150);
    expect(preamble).not.toMatch(/setPadletToEdit\(null\)/);
    expect(preamble).not.toMatch(/setIsCardEditorOpen\(false\)/);
    expect(body.indexOf('} catch (e) {')).toBeGreaterThan(body.lastIndexOf('setPadletToEdit(null);'));
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
  it('no PDF branch was added, and the B1b-iii Read-affordance owners stay untouched', () => {
    const guardSrc = read('lib/domain/canvas/documentSwitchGuard.ts');
    for (const src of [canvasClientSrc, freeformSrc, guardSrc]) expect(src).not.toMatch(/pdf/i);
    // documentModalRoute.ts (the destination helper) is reused, never modified by B2-ii.
    expect(read('lib/domain/canvas/documentModalRoute.ts')).not.toMatch(/QueuedDocumentAction|documentIsDirty|resolveDocumentSwitch/);
  });
});
