import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression coverage for the "ghosting" bug: opening one mutually-exclusive
// post editor (Note/Document/Link/Table/Todo/Container/Comment/Image/
// Drawing/AI, plus the Card/Image freeform toolbars) left a PREVIOUSLY open
// one mounted underneath it, because several launch sites set their own
// isXEditorOpen/padletToEdit/cardToolbarPadletId/imageToolbarPadletId flags
// directly instead of going through the shared closeAllToolbarLaunchedUi()
// cleanup first. §36.3: the harness cannot mount CanvasClient (Supabase,
// dnd-kit, Excalidraw, every canvas layout), so -- matching the established
// documentSwitchGuard.source.test.ts precedent -- these are source-level
// proofs that each fixed call site's body contains the cleanup call before
// its editor-opening setter, not a rendered-DOM assertion.
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');

function bodyFrom(marker: string, endMarker = '\n  };'): string {
  const start = canvasClientSrc.indexOf(marker);
  expect(start, `marker not found: ${marker}`).toBeGreaterThan(-1);
  const end = canvasClientSrc.indexOf(endMarker, start);
  expect(end, `end marker not found after: ${marker}`).toBeGreaterThan(start);
  return canvasClientSrc.slice(start, end);
}

// JSX-inline handlers close over `}}` rather than `};` -- slice to the
// matching close instead of guessing an offset, so a reordered/reformatted
// handler can't silently make the slice span into the next prop.
function jsxHandlerBody(marker: string): string {
  const start = canvasClientSrc.indexOf(marker);
  expect(start, `marker not found: ${marker}`).toBeGreaterThan(-1);
  let depth = 0;
  let i = canvasClientSrc.indexOf('{', start);
  const braceStart = i;
  for (; i < canvasClientSrc.length; i++) {
    if (canvasClientSrc[i] === '{') depth++;
    else if (canvasClientSrc[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  expect(i, `unbalanced braces after: ${marker}`).toBeGreaterThan(braceStart);
  return canvasClientSrc.slice(start, i + 1);
}

describe('closeAllToolbarLaunchedUi: canonical cleanup covers Document too', () => {
  it('clears documentModalDestination, documentIsDirty, and queuedDocumentAction', () => {
    const body = bodyFrom('const closeAllToolbarLaunchedUi = useCallback(() => {', '}, [');
    expect(body).toContain('setDocumentModalDestination(null);');
    expect(body).toContain('setDocumentIsDirty(false);');
    expect(body).toContain('setQueuedDocumentAction(null);');
  });
});

describe('Straightforward unsafe call sites now clean up before opening another editor', () => {
  it('handleAddPostToSection', () => {
    const body = bodyFrom('const handleAddPostToSection = useCallback((sectionId: number) => {');
    const cleanupIdx = body.indexOf('closeAllToolbarLaunchedUi();');
    const openIdx = body.indexOf('setIsNoteEditorOpen(true);');
    expect(cleanupIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(cleanupIdx);
  });

  it('renameTodo', () => {
    const body = bodyFrom("const renameTodo = (id: string) => {");
    expect(body.indexOf('closeAllToolbarLaunchedUi();')).toBeLessThan(body.indexOf('setIsTodoEditorOpen(true);'));
  });

  it('renameColumn', () => {
    const body = bodyFrom("const renameColumn = (id: string) => {");
    expect(body.indexOf('closeAllToolbarLaunchedUi();')).toBeLessThan(body.indexOf('setIsContainerEditorOpen(true);'));
  });

  it('renameComment', () => {
    const body = bodyFrom("const renameComment = (id: string) => {");
    expect(body.indexOf('closeAllToolbarLaunchedUi();')).toBeLessThan(body.indexOf('setIsCommentEditorOpen(true);'));
  });

  it('addPostRelative', () => {
    const body = bodyFrom('const addPostRelative = async (post: Padlet, action: ');
    const cleanupIdx = body.indexOf('closeAllToolbarLaunchedUi();');
    const openIdx = body.indexOf('setIsNoteEditorOpen(true);');
    expect(cleanupIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(cleanupIdx);
  });

  it('Columns layout onOpenPost', () => {
    const body = jsxHandlerBody('onOpenPost={(post: Padlet) => {');
    expect(body.indexOf('closeAllToolbarLaunchedUi();')).toBeLessThan(body.indexOf('setIsNoteEditorOpen(true);'));
  });

  it('Row layout onOpenPost', () => {
    const body = jsxHandlerBody('onOpenPost={(post) => {');
    expect(body.indexOf('closeAllToolbarLaunchedUi();')).toBeLessThan(body.indexOf('setIsNoteEditorOpen(true);'));
  });

  it('Map layout onEditPinContainer', () => {
    const body = jsxHandlerBody('onEditPinContainer={canUseFreeformEditButton ? ((post) => {');
    expect(body.indexOf('closeAllToolbarLaunchedUi();')).toBeLessThan(body.indexOf('setIsContainerEditorOpen(true);'));
  });

  it('ImportsDialog onImportResolved', () => {
    const body = jsxHandlerBody('onImportResolved={(resolved) => {');
    const cleanupIdx = body.indexOf('closeAllToolbarLaunchedUi();');
    const openIdx = body.indexOf('setIsImageEditorOpen(true);');
    expect(cleanupIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(cleanupIdx);
    // The redundant explicit setIsImportBrowserOpen(false) that used to sit
    // here is now subsumed by closeAllToolbarLaunchedUi() -- confirm it
    // wasn't left behind as dead duplicate cleanup.
    expect(body).not.toMatch(/setIsImportBrowserOpen\(false\);\s*closeAllToolbarLaunchedUi/);
  });

  it('Scheduler onEditContainer (shares isContainerEditorOpen/padletToEdit with every other layout)', () => {
    const body = jsxHandlerBody('onEditContainer={(p) => {');
    expect(body.indexOf('closeAllToolbarLaunchedUi();')).toBeLessThan(body.indexOf('setIsContainerEditorOpen(true);'));
  });
});

describe('Partial-cleanup call sites now use the full canonical cleanup', () => {
  it('openImagePostEditor: upgraded from closeAllToolbars({ imageToolbar: true }) to closeAllToolbarLaunchedUi()', () => {
    const body = bodyFrom('const openImagePostEditor = (padlet: Padlet) => {');
    // Checks for the active statement (trailing `;`) so this doesn't false-fail
    // on the explanatory comment that legitimately mentions the old call.
    expect(body).not.toContain('closeAllToolbars({ imageToolbar: true });');
    const cleanupIdx = body.indexOf('closeAllToolbarLaunchedUi();');
    const setIdx = body.indexOf('setImageToolbarPadletId(padlet.id);');
    expect(cleanupIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeGreaterThan(cleanupIdx);
  });

  it('Wall layout onPadletEdit: upgraded from closeAllToolbars() to closeAllToolbarLaunchedUi()', () => {
    const body = jsxHandlerBody('onPadletEdit={(padlet) => {');
    expect(body).not.toMatch(/closeAllToolbars\(\);/);
    expect(body.indexOf('closeAllToolbarLaunchedUi();')).toBeLessThan(body.indexOf('setIsContainerEditorOpen(true);'));
  });

  it('Drawing layout onEditPadletAsPost: cleanup upgraded, but still opens Note editor (not rerouted to executePadletTypeEditor)', () => {
    const body = jsxHandlerBody('onEditPadletAsPost={(padlet) => {');
    expect(body).not.toMatch(/closeAllToolbars\(\);/);
    expect(body.indexOf('closeAllToolbarLaunchedUi();')).toBeLessThan(body.indexOf('setIsNoteEditorOpen(true);'));
    // Deliberately does NOT call executePadletTypeEditor as a statement (that
    // would route a container padlet to setIsContainerEditorOpen instead) --
    // the comment mentioning it by name for documentation is fine.
    expect(body).not.toContain('executePadletTypeEditor(padlet)');
  });
});

describe('Library Icon-replace coexistence is intentionally left unchanged', () => {
  it('onClipartClick has no cleanup call -- it is only reachable in the non-replace path, which already started from a clean state', () => {
    const body = jsxHandlerBody('onClipartClick={(svgUrl, title) => {');
    expect(body).not.toContain('closeAllToolbarLaunchedUi');
    // LibraryPanel only fires onClipartClick when isIconReplaceMode is false
    // (it fires onSelectClipart instead when true) -- and isIconReplaceMode
    // is exactly !!iconReplaceTargetPadlet || isClipartDraftReplaceMode.
    expect(canvasClientSrc).toContain('isIconReplaceMode={!!iconReplaceTargetPadlet || isClipartDraftReplaceMode}');
  });

  it('onSelectClipart (the icon-replace path) updates in place and never opens a competing editor', () => {
    const body = jsxHandlerBody('onSelectClipart={async (svgUrl, title) => {');
    expect(body).not.toMatch(/setIsNoteEditorOpen|setIsTodoEditorOpen|setIsClipartDraftModalOpen\(true\)|setImageToolbarPadletId|setCardToolbarPadletId/);
  });
});

describe('Canonical safe paths are unchanged by this patch', () => {
  it('executePadletTypeEditor still cleans up before every type-branch setter', () => {
    const body = bodyFrom('const executePadletTypeEditor = (post: Padlet) => {');
    const cleanupIdx = body.indexOf('closeAllToolbarLaunchedUi();');
    expect(cleanupIdx).toBeGreaterThan(-1);
    for (const setter of [
      'setIsTodoEditorOpen(true)', 'setIsLinkEditorOpen(true)', 'setIsTableEditorOpen(true)',
      'setIsContainerEditorOpen(true)', 'setIsCommentEditorOpen(true)', 'setIsDrawingEditorOpen(true)',
      'setIsAIComponentEditorOpen(true)', 'setIsNoteEditorOpen(true)',
    ]) {
      const setterIdx = body.indexOf(setter);
      expect(setterIdx, `${setter} not found in executePadletTypeEditor`).toBeGreaterThan(-1);
      expect(setterIdx).toBeGreaterThan(cleanupIdx);
    }
  });
});
