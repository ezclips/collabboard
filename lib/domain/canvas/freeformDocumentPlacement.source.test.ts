import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const usePadletSaveSrc = read('hooks/canvas/usePadletSave.ts');
const useGridPadletSaveSrc = read('hooks/canvas/useGridPadletSave.ts');

// PATCH-152 targeted correction: DocumentEditor's close-always-saves fix
// (documentSaveLifecycle.source.test.ts) is the actual root-cause fix -- a
// Document created on Freeform previously never reached saveCard at all when
// the user clicked outside, because close only saved via an explicit Save
// button. saveCard's own placement/persistence logic below was already
// correct and is UNCHANGED by that fix; these are new characterization tests
// proving it, so a future change can't silently regress Freeform placement
// stability while "fixing" something else.

describe('saveCard (Freeform): a new Document is placed directly on the canvas, never a container', () => {
  const saveCardStart = usePadletSaveSrc.indexOf('const saveCard = useCallback');
  const saveCardBody = usePadletSaveSrc.slice(
    saveCardStart,
    usePadletSaveSrc.indexOf(', [\n    canvasId,', saveCardStart),
  );

  it('skips checkPlacementRequired entirely when isFreeformLayout is true', () => {
    expect(saveCardBody).toContain('if (!isFreeformLayout && !(isMapLayout && padletToEdit.metadata?.parentId)) {');
    expect(saveCardBody).toContain('checkPlacementRequired(');
  });

  it('never forces a parentId on insert -- only carries one through if the draft already had one', () => {
    expect(saveCardBody).toContain(
      "...(padletToEdit.metadata?.parentId ? { parentId: padletToEdit.metadata.parentId } : {}),",
    );
  });

  it('the new-row insert carries title/content/metadata straight from the editor payload', () => {
    const insertAt = saveCardBody.indexOf('.insert({');
    expect(insertAt).toBeGreaterThan(-1);
    const insertBlock = saveCardBody.slice(insertAt, saveCardBody.indexOf('.select()', insertAt));
    expect(insertBlock).toContain('title: data.title,');
    expect(insertBlock).toContain('content: data.content,');
    expect(insertBlock).toContain('metadata: insertMetadata,');
  });

  it('appends the created row directly to padlets state -- no forced refetch, no timeout, no duplicate local copy', () => {
    const appendAt = saveCardBody.indexOf("if (padletToEdit.id === 'new') {\n        if (createdPadlet)");
    expect(appendAt).toBeGreaterThan(-1);
    const appendBlock = saveCardBody.slice(appendAt, appendAt + 200);
    expect(appendBlock).toContain('setPadlets(prev => [...prev, createdPadlet]);');
    expect(saveCardBody).not.toMatch(/setTimeout|setInterval/);
  });
});

describe('saveCard: updating an existing Document never touches id or position', () => {
  const saveCardStart = usePadletSaveSrc.indexOf('const saveCard = useCallback');
  const saveCardBody = usePadletSaveSrc.slice(
    saveCardStart,
    usePadletSaveSrc.indexOf(', [\n    canvasId,', saveCardStart),
  );
  const updateAt = saveCardBody.indexOf('} else {\n        const { error } = await supabase');
  const updateBlock = saveCardBody.slice(updateAt, saveCardBody.indexOf('setIsCardEditorOpen(false);', updateAt));

  it('the update payload is limited to title/content/metadata/updated_at', () => {
    expect(updateBlock).toContain('.update({');
    expect(updateBlock).toContain('title: data.title,');
    expect(updateBlock).toContain('content: data.content,');
    expect(updateBlock).toContain('metadata: data.metadata,');
    expect(updateBlock).not.toContain('position_x');
    expect(updateBlock).not.toContain('position_y');
    expect(updateBlock).not.toMatch(/\bid:\s*data\./);
  });

  it('the local state update spreads the existing padlet, preserving id/position, and only overrides title/content/metadata', () => {
    const mapAt = saveCardBody.indexOf('setPadlets(prev => prev.map(p =>\n          p.id === padletToEdit!.id\n            ? { ...p,');
    expect(mapAt).toBeGreaterThan(-1);
    const mapBlock = saveCardBody.slice(mapAt, mapAt + 200);
    expect(mapBlock).toContain('{ ...p, title: data.title, content: data.content, metadata: data.metadata }');
  });
});

describe('Other layouts still require container/section placement for a new card (unchanged by PATCH-152)', () => {
  it('Grid layout always requires a container for a new post', () => {
    expect(useGridPadletSaveSrc).toContain('if (isGridLayout && !hasParentId) {');
    expect(useGridPadletSaveSrc).toContain('setIsPlacementPromptOpen(true);');
  });

  it('Columns layout requires a section or container for a new post', () => {
    expect(useGridPadletSaveSrc).toContain('if (isColumnsLayout && !hasSectionId && !hasParentId) {');
  });

  it('Wall layout requires a container for a new post', () => {
    expect(useGridPadletSaveSrc).toContain('if (isWallLayout && !hasParentId) {');
    expect(useGridPadletSaveSrc).toContain('setWallPlacementPromptOpen(true);');
  });

  it('Drawing layout prompts placement for every new post outside a container', () => {
    const usePadletSaveCheckStart = usePadletSaveSrc.indexOf('const checkPlacementRequired = (');
    const checkBlock = usePadletSaveSrc.slice(usePadletSaveCheckStart, usePadletSaveSrc.indexOf('const withSchedulerDefaults'));
    expect(checkBlock).toContain('isDrawingLayout &&\n      !hasParentId');
    expect(checkBlock).toContain('onDrawingPlacementStart?.(drawingDraft);');
  });

  it('Timeline and Scheduler layouts still auto-place new posts without a modal (unchanged)', () => {
    const usePadletSaveCheckStart = usePadletSaveSrc.indexOf('const checkPlacementRequired = (');
    const checkBlock = usePadletSaveSrc.slice(usePadletSaveCheckStart, usePadletSaveSrc.indexOf('const withSchedulerDefaults'));
    expect(checkBlock).toContain('if (isTimelineLayout && !hasParentId) {');
    expect(checkBlock).toContain('if (isSchedulerLayout && !hasParentId) {');
  });
});
