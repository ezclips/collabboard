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
