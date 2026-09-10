import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKnowledgeSourceNoteDraft } from '../../domain/knowledge/knowledgeSourceNoteDraft';
import { canEditWorkspace } from '@/lib/workspace/context';

/**
 * PDF_SELECTION_TO_NOTE_1 governance seam.
 *
 * The write itself lives in CanvasClient, a 10k-line controller no render test
 * can mount, so the transaction-like guarantees are pinned here as source
 * invariants: what the command builds, in what ORDER it writes, and what it
 * does when the second write fails. Written to survive reformatting -- call
 * shapes and ordering, never line breaks.
 *
 * Line comments only, as the sibling suites do: a block-comment strip would
 * swallow JSX and string literals and turn every "not found" assertion into a
 * false pass.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
}

const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
const readerDrawer = sourceOf('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const details = sourceOf('components/collabboard/KnowledgeDocumentDetails.tsx');

/** The body of the one command this gate adds. */
const command = (() => {
  const start = canvasClient.indexOf('const saveKnowledgeSelectionAsNote = useCallback(');
  expect(start, 'saveKnowledgeSelectionAsNote must exist').toBeGreaterThan(-1);
  const end = canvasClient.indexOf('/** The one completion point for any Note finalised out of a placement draft. */', start);
  expect(end).toBeGreaterThan(start);
  return canvasClient.slice(start, end);
})();

describe('a PDF selection becomes one source-linked Note', () => {
  it('4: provenance comes from the existing draft authority, never from this command', () => {
    // The command never assembles a source reference of its own: the one
    // builder that already decides what an exact span means does it, so the
    // offsets, the selected text and the "no client quote" rule cannot drift.
    expect(command).toContain('const draft = buildKnowledgeSourceNoteDraft(request);');
    expect(command).toContain('draft.sourceReference,');
    // Nothing here invents provenance from anything else.
    for (const forbidden of [
      'originalFilename:', 'pageText', 'indexOf(', 'search(', 'toLowerCase()',
      'charStart:', 'charEnd:', 'quoteText:', 'selectedText:',
    ]) {
      expect(command, forbidden).not.toContain(forbidden);
    }
  });

  it('4: and the draft it relies on carries the exact span, with no client quote', () => {
    // The behaviour the assertion above depends on, proved rather than assumed.
    const draft = buildKnowledgeSourceNoteDraft({
      sourceDocumentId: 'doc-1',
      originalFilename: 'paper.pdf',
      pageNumber: 7,
      pageText: 'alpha beta gamma',
      selection: { charStart: 6, charEnd: 10, selectedText: 'beta' },
      topStripColor: null,
    });
    expect(draft.sourceReference).toEqual({
      sourceDocumentId: 'doc-1',
      pageStart: 7,
      pageEnd: 7,
      // An exact span sends no client quote: the server slices its own page.
      quoteText: null,
      charStart: 6,
      charEnd: 10,
      selectedText: 'beta',
      region: null,
      appliedRotation: null,
    });
    // 3: the selection, and only the selection, is the Note's body.
    expect(draft.content).toBe('<p>beta</p>');
    expect(draft.title).toBe('paper.pdf');
  });

  it('3: an ordinary board-local text Note, with the selection as its body', () => {
    expect(command).toContain("type: 'text'");
    expect(command).toContain('title: draft.title');
    expect(command).toContain('content: draft.content');
    // Standard creation and placement -- no PDF-relative geometry.
    expect(command).toContain('getNewPostPosition(width, height)');
    expect(command).toContain('await insertPostAndSelectOrThrow(note as any)');
    // Not promoted anywhere, and no second Note species is introduced.
    for (const forbidden of ['library', 'Library', 'promote', 'research', 'quote:', 'kind:']) {
      expect(command, forbidden).not.toContain(forbidden);
    }
  });

  it('6/E: the second write failing removes the Note, and still reports failure', () => {
    // One source-reference authority, and no toast of its own: this caller is
    // transactional, so it passes the null message and owns the rollback.
    expect(command).toContain('await persistKnowledgeSourceReference(');
    expect(command).toMatch(/persistKnowledgeSourceReference\(\s*created\.id,\s*draft\.sourceReference,\s*null,\s*\)/);
    expect(command).toContain('await deletePostOrThrow(created.id);');
    expect(command).toContain("throw new Error('source_link_failed')");
    // A rollback that itself fails is still a failure -- never a success.
    expect(command).toContain("throw new Error('source_link_failed_rollback_failed')");

    const insert = command.indexOf('await insertPostAndSelectOrThrow');
    const persist = command.indexOf('await persistKnowledgeSourceReference');
    const rollback = command.indexOf('await deletePostOrThrow(created.id);');
    const publish = command.indexOf('setPadlets((current) => [...current, created])');
    expect(insert).toBeLessThan(persist);
    expect(persist).toBeLessThan(rollback);
    // The board only learns about the Note once its provenance exists.
    expect(rollback).toBeLessThan(publish);
    // And a failed save never claims one was made.
    expect(command.indexOf("toast.success('Note saved')")).toBeGreaterThan(publish);
  });

  it('F: the browser never writes the reference itself, and opens no editor', () => {
    // No second write path: no direct fetch, no Supabase call, no editor.
    for (const forbidden of ['fetch(', 'supabase', 'setIsNoteEditorOpen', 'setPadletToEdit', 'setSourceNoteReference']) {
      expect(command, forbidden).not.toContain(forbidden);
    }
    // The one route that verifies a span against stored page text is the one
    // persistKnowledgeSourceReference posts to, and it sends selectedText as
    // evidence rather than as the stored quote.
    const persist = canvasClient.slice(
      canvasClient.indexOf('const persistKnowledgeSourceReference = useCallback('),
      canvasClient.indexOf('const savePdfAssistantAnswerAsNote = useCallback('),
    );
    expect(persist).toContain('/knowledge/references');
    expect(persist).toContain('selectedText: sourceReference.selectedText');
  });

  it('7: the saved Note reaches PDF Library Notes through the existing projection', () => {
    // No new index and no reload: the same source-reference projection every
    // other source Note is found through is the one this write updates.
    const persist = canvasClient.slice(
      canvasClient.indexOf('const persistKnowledgeSourceReference = useCallback('),
      canvasClient.indexOf('const savePdfAssistantAnswerAsNote = useCallback('),
    );
    expect(persist).toContain('setSourceReferencesByPadletId');
    expect(command).not.toContain('loadKnowledge');
    expect(command).not.toContain('router.refresh');
  });

  it('8: its source click is the canonical navigation, unchanged', () => {
    // The Note carries no navigation of its own: it is an ordinary Note with a
    // source reference, so the board's one source-open authority handles it --
    // the same one that already reveals the source and mints a fresh intent.
    expect(canvasClient).toContain('onOpenSourceReference={requestKnowledgeSourceOpen}');
    const request = canvasClient.slice(
      canvasClient.indexOf('const requestKnowledgeSourceOpen = useCallback('),
      canvasClient.indexOf('const requestKnowledgeSourceOpen = useCallback(') + 700,
    );
    expect(request).toContain('buildKnowledgeSourceOpenRequest(knowledgeSourceRequestIdRef.current, reference, {');
    expect(request).toContain('revealSource: true,');
    expect(request).toContain('knowledgeSourceRequestIdRef.current += 1;');
  });

  it('2/7: editor authority decides the control, on the same rule as the editor path', () => {
    expect(canvasClient).toContain('onSaveSelectionAsNote={canUseFreeformEditButton ? saveKnowledgeSelectionAsNote : undefined}');
    expect(command).toContain("if (!canvasId || !canUseFreeformEditButton) throw new Error('note_save_not_allowed');");
    // Exact spans only: a page-only or region request keeps its own path.
    expect(command).toContain("if (!request.selection) throw new Error('selection_required');");

    // Forwarded untouched through the drawer to the surface that owns the
    // selection toolbar -- the drawer builds nothing and writes nothing.
    expect(readerDrawer).toContain('onSaveSelectionAsNote?: (request: KnowledgeSourcePageRequest) => Promise<void>;');
    expect(readerDrawer).toContain('onSaveSelectionAsNote={onSaveSelectionAsNote}');
    expect(details).toContain('onSaveSelectionAsNote?: (request: KnowledgeSourcePageRequest) => Promise<void>;');
  });

  it('5: the at-most-once guard is the selection itself, claimed before the write', () => {
    const save = details.slice(
      details.indexOf('const saveActiveSelectionAsNote = useCallback('),
      details.indexOf('useEffect(() => {\n    setActiveMatchIndex(0);'),
    );
    expect(save).toContain("if (claimed === 'pending' || claimed === 'saved') return;");
    expect(save.indexOf("writeSelectionSaveStatus(key, 'pending');"))
      .toBeLessThan(save.indexOf('await onSaveSelectionAsNote('));
    // Scoped to one selection, and to nothing else.
    expect(details).toContain('knowledgeSelectionSaveIdentity(documentId, activeSelection)');
    for (const forbidden of ['localStorage', 'sessionStorage', 'Date.now', 'Math.random']) {
      expect(save, forbidden).not.toContain(forbidden);
    }
  });

  it('10: the AI answer save is left exactly as it was', () => {
    // This gate adds a sibling command; it does not fold the closed AI->Note
    // slice into a shared helper, so that contract still reads as its own.
    const ai = canvasClient.slice(
      canvasClient.indexOf('const savePdfAssistantAnswerAsNote = useCallback('),
      canvasClient.indexOf('const saveKnowledgeSelectionAsNote = useCallback('),
    );
    expect(ai).toContain("title: 'AI Note'");
    expect(ai).toContain('knowledgeSourceSelectionToNoteHtml(request.content)');
    expect(ai).toContain('pageStart: request.pageNumber');
    expect(ai).toContain('await deletePostOrThrow(created.id);');
    expect(ai).toContain("throw new Error('source_link_failed')");
    expect(canvasClient).toContain('onSaveAssistantAsNote={enableBoardAiChat && canUseCanvasToolbar ? savePdfAssistantAnswerAsNote : undefined}');
  });

  it('9: Note Post and Ask AI keep their own, unchanged routes', () => {
    expect(details).toContain('buildSelectionSourceRequest(documentId, originalFilename, pages, activeSelection, selectionColor)');
    expect(canvasClient).toContain('onCreateNoteFromPage={handleCreateNoteFromKnowledgePage}');
    expect(details).toContain('onAiFromSelection(');
  });
});

// ============================================================================
// PDF_SELECTION_TO_NOTE_CORRECTIONS_1 -- the authority that gates the write
// ============================================================================

describe('Save as Note is gated on this board edit capability', () => {
  /**
   * What "may edit this board" actually resolves to here.
   *
   * The controller boundary documents why: per-board collaborator roles are a
   * nav-orphaned vertical with no live data and no writers, so
   * `canEditWorkspace(currentWorkspaceRole)` IS the canonical board-edit
   * authority in this application -- the same one that gates creating,
   * editing and deleting posts and opening the mutation-capable editor. This
   * suite proves that derivation rather than inventing a second one.
   */
  it('8: the derivation is the app\'s one edit capability, exercised directly', () => {
    expect(canEditWorkspace('owner')).toBe(true);
    expect(canEditWorkspace('admin')).toBe(true);
    expect(canEditWorkspace('member')).toBe(true);
    // 'readonly' is this domain's read-only role -- there is no 'viewer'.
    expect(canEditWorkspace('readonly')).toBe(false);
    expect(canEditWorkspace(null)).toBe(false);
    expect(canEditWorkspace(undefined)).toBe(false);

    // ...and that this is what the controller resolves the capability from.
    expect(canvasClient).toContain('const canUseFreeformEditButton = canEditWorkspace(currentWorkspaceRole);');
  });

  it('8: the same capability every other shared post mutation is gated on', () => {
    // Create / edit / delete a post, and open the mutation-capable editor.
    expect(canvasClient).toContain('canEditPosts={canUseFreeformEditButton}');
    expect(canvasClient).toContain('isEditable={canUseFreeformEditButton}');
    expect(canvasClient).toContain('selectDocumentModalDestination(post, canUseFreeformEditButton)');
  });

  it('6/7: the handler is supplied iff this user may edit the board', () => {
    // A board editor gets the handler; a viewer gets `undefined`, so the
    // control is not rendered at all -- the reader renders it only when the
    // callback exists.
    expect(canvasClient).toContain('onSaveSelectionAsNote={canUseFreeformEditButton ? saveKnowledgeSelectionAsNote : undefined}');
    expect(details).toContain('{onSaveSelectionAsNote ? (');
    // And the command refuses on its own account too, not only in the UI.
    expect(command).toContain("if (!canvasId || !canUseFreeformEditButton) throw new Error('note_save_not_allowed');");
  });

  it('the toolbar alias is no longer what gates this mutation', () => {
    // `canUseCanvasToolbar` answers "does this surface get the creation
    // toolbar", not "may this user change this board". They hold the same
    // value today, which is exactly why the wrong one reads as correct --
    // so the write names the edit capability explicitly.
    expect(command).not.toContain('canUseCanvasToolbar');
    const wiring = canvasClient.slice(
      canvasClient.indexOf('onSaveSelectionAsNote={'),
      canvasClient.indexOf('onSaveSelectionAsNote={') + 120,
    );
    expect(wiring).not.toContain('canUseCanvasToolbar');
  });

  it('9/D: the private AI actions are not tied to board mutation authority', () => {
    // Ask AI and the page/selection handoff travel on the feature flag and
    // the reader's own availability -- never on the edit capability.
    expect(canvasClient).toContain('onBoardAiDraftContextChange={enableBoardAiChat ? setPdfAiDraftContextForDocument : undefined}');
    expect(readerDrawer).toContain('const boardAiAvailable = !!onBoardAiDraftContextChange;');
    expect(readerDrawer).toContain('onAddBoardAiContext={boardAiAvailable ? handOffToBoardAi : undefined}');
    expect(readerDrawer).not.toContain('onAddBoardAiContext={canUseFreeformEditButton');
  });

  it('1/A: the save claim is keyed and synchronous, not one current-save slot', () => {
    const save = details.slice(
      details.indexOf('const saveActiveSelectionAsNote = useCallback('),
      details.indexOf('useEffect(() => {\n    setActiveMatchIndex(0);'),
    );
    // The guard reads a keyed ref BEFORE the first await -- a state setter's
    // updater would not have run yet when a second click in the same tick
    // reads it.
    expect(details).toContain('useRef<Map<string, SelectionSaveStatus>>(new Map())');
    expect(save).toContain('const claimed = selectionSaveRef.current.get(key);');
    expect(save).toContain("if (claimed === 'pending' || claimed === 'saved') return;");
    expect(save.indexOf("writeSelectionSaveStatus(key, 'pending');"))
      .toBeLessThan(save.indexOf('await onSaveSelectionAsNote('));
    // Every write merges into the map: a completion for one selection can
    // never restate another's entry.
    expect(details).toContain('setSelectionSaveStates((current) => ({ ...current, [key]: status }))');
    // And no scalar current-save slot survives.
    expect(details).not.toContain('selectionSaveInFlightRef.current = null');
    expect(details).not.toContain('selectionSaveState?.key');
  });
});
