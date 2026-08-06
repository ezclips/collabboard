import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const documentEditorSrc = read('components/collabboard/editors/DocumentEditor.tsx');
const usePadletSaveSrc = read('hooks/canvas/usePadletSave.ts');
const discardDialogSrc = read('components/collabboard/editors/DiscardChangesDialog.tsx');

describe('PATCH-149B2-i: temporary save-on-close lifecycle is fully removed', () => {
  it('DocumentEditor no longer contains handleSaveAndClose in any form', () => {
    expect(documentEditorSrc).not.toContain('handleSaveAndClose');
  });

  it('no window.confirm is used for discard', () => {
    expect(documentEditorSrc).not.toMatch(/window\.confirm\(/);
    expect(discardDialogSrc).not.toMatch(/window\.confirm\(/);
  });

  it('exactly one bounded Escape listener is registered, not duplicated', () => {
    expect((documentEditorSrc.match(/addEventListener\('keydown'/g) || []).length).toBe(1);
    expect((documentEditorSrc.match(/removeEventListener\('keydown'/g) || []).length).toBe(1);
  });
});

// PATCH-152 targeted correction: the PATCH-149B2-i explicit-Save-button +
// discard-confirmation lifecycle above is superseded for Freeform's benefit
// (a Document created directly on Freeform must persist on outside-click/X,
// not require a Save click or offer a Discard option). DocumentEditor itself
// has no layout awareness, so this lifecycle change is global to the editor;
// only the placement/routing logic downstream (saveCard, checkPlacementRequired)
// stays layout-specific and untouched.
describe('PATCH-152: close-always-saves lifecycle replaces the explicit Save button and discard dialog', () => {
  it('has no visible Save button', () => {
    expect(documentEditorSrc).not.toMatch(/aria-label="Save document"/);
    expect(documentEditorSrc).not.toMatch(/>\s*Save\s*</);
  });

  it('no longer imports or renders DiscardChangesDialog, and drops its confirm state entirely', () => {
    expect(documentEditorSrc).not.toContain('DiscardChangesDialog');
    expect(documentEditorSrc).not.toContain('showDiscardConfirm');
    expect(documentEditorSrc).not.toContain('handleKeepEditing');
    expect(documentEditorSrc).not.toContain('handleDiscardConfirmed');
  });

  it('attemptClose is the sole close path for backdrop, X and Escape, and awaits onSave before onClose when dirty', () => {
    expect((documentEditorSrc.match(/onClick=\{attemptClose\}/g) || []).length).toBe(1);
    expect(documentEditorSrc).toContain('onBackdropClick={attemptClose}');
    expect(documentEditorSrc).toContain('void attemptClose()');
    const fnStart = documentEditorSrc.indexOf('const attemptClose = async () => {');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = documentEditorSrc.slice(fnStart, documentEditorSrc.indexOf('\n  };', fnStart));
    expect(fnBody).toContain('await onSave(payload)');
    // The final onClose() (after a successful save) must come after the
    // await -- the earlier onClose() in the fast path is the deliberate
    // read-only/not-dirty early return, not a save-skipping close.
    expect(fnBody.indexOf('await onSave(payload)')).toBeLessThan(fnBody.lastIndexOf('onClose();'));
  });

  it('a failed save keeps the editor open instead of closing (no content loss)', () => {
    const fnStart = documentEditorSrc.indexOf('const attemptClose = async () => {');
    const fnBody = documentEditorSrc.slice(fnStart, documentEditorSrc.indexOf('\n  };', fnStart));
    const failedBranch = fnBody.slice(fnBody.indexOf("status === 'failed'"), fnBody.indexOf("if (status === 'saved')"));
    expect(failedBranch).toContain('return;');
    expect(failedBranch).not.toContain('onClose();');
  });

  it('read-only closes immediately without attempting a save', () => {
    const fnStart = documentEditorSrc.indexOf('const attemptClose = async () => {');
    const fnBody = documentEditorSrc.slice(fnStart, documentEditorSrc.indexOf('\n  };', fnStart));
    expect(fnBody).toContain('if (readOnly || !isDirty) { onClose(); return; }');
  });
});

describe('PATCH-149B2-i: SaveCardResult contract (§32.3)', () => {
  const saveCardStart = usePadletSaveSrc.indexOf('const saveCard = useCallback');
  const saveCardBody = usePadletSaveSrc.slice(
    saveCardStart,
    usePadletSaveSrc.indexOf(', [\n    canvasId,', saveCardStart),
  );

  it('saveCard returns a discriminated result on every path -- never throws', () => {
    expect(saveCardBody).toContain("{ status: 'skipped-blank' }");
    expect(saveCardBody).toContain("{ status: 'deferred-placement' }");
    expect(saveCardBody).toContain("{ status: 'saved' }");
    expect(saveCardBody).toMatch(/catch \(e\) \{[^}]*status: 'failed'/);
  });

  it('the catch/error path remains below the existing state-reset calls (draft recoverability, §32.3)', () => {
    const resetAt = saveCardBody.indexOf('setPadletToEdit(null);');
    const catchAt = saveCardBody.indexOf('} catch (e) {');
    expect(resetAt).toBeGreaterThan(-1);
    expect(catchAt).toBeGreaterThan(resetAt);
  });

  it('CanvasModals narrows the erased saveCard prop type instead of `(...args: any[]) => any`', () => {
    const canvasModalsSrc = read('components/collabboard/canvas/ui/CanvasModals.tsx');
    expect(canvasModalsSrc).toContain('saveCard: (data: SaveCardData) => Promise<SaveCardResult>;');
  });
});

describe('PATCH-149B2-i: scope boundary -- no B2-ii, PDF or clipart work', () => {
  it('DocumentEditor does not touch route switching, O4 owners, or PDF', () => {
    expect(documentEditorSrc).not.toMatch(/handleToolClick|closeDrawingEditorsBeforePadletEdit|documentModalDestination/);
    expect(documentEditorSrc).not.toMatch(/pdf/i);
    expect(documentEditorSrc).not.toMatch(/svgUrl|isClipart/);
  });

  it('the discard dialog owns no capability, persistence or routing logic', () => {
    expect(discardDialogSrc).not.toMatch(/canEditWorkspace|supabase|\.from\(|selectDocumentModalDestination/);
  });
});
