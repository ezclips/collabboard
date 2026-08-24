import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P6J-F5 governance seam. CanvasClient is a 9k-line legacy controller with six
 * different Note placement families; no single render test can show that every
 * one of them completes its source reference, and only after a real row id
 * exists. These are source invariants, deliberately written to survive
 * reformatting -- they pin call shapes and ordering, never line breaks.
 */
/**
 * Line comments only. A block-comment strip is NOT safe here: CanvasClient's
 * JSX and string literals make the naive regex swallow ~130KB of real code,
 * which would silently turn every "not found" assertion into a false pass.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
}

const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
const padletSave = sourceOf('hooks/canvas/usePadletSave.ts');
const gridSave = sourceOf('hooks/canvas/useGridPadletSave.ts');
const details = sourceOf('components/collabboard/KnowledgeDocumentDetails.tsx');
const sidebar = sourceOf('components/collabboard/canvas/ui/CanvasSidebar.tsx');

/** Everything between an anchor and the next `count` characters of source. */
function after(source: string, anchor: string, count = 900): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

describe('P6J-F5 source note wiring', () => {
  it('A: routes the Knowledge page request into the ordinary Note editor', () => {
    expect(sidebar).toContain('onCreateNoteFromKnowledgePage');
    // The sidebar closes its own modal and forwards; it creates nothing.
    expect(after(sidebar, 'onCreateNoteFromPage={onCreateNoteFromKnowledgePage')).toContain('setKnowledgeOpen(false)');
    expect(sidebar).not.toContain('padlets');
    expect(sidebar).not.toContain('knowledge/references');

    expect(canvasClient).toContain('onCreateNoteFromKnowledgePage={handleCreateNoteFromKnowledgePage}');
    const handler = after(canvasClient, 'const handleCreateNoteFromKnowledgePage', 1200);
    expect(handler).toContain('buildKnowledgeSourceNoteDraft(request)');
    expect(handler).toContain('setIsNoteEditorOpen(true)');
    expect(handler).toContain("id: 'new'");
    expect(handler).toContain("type: 'text'");
    // Gated on the same capability as the creation toolbar, and fails closed.
    expect(handler).toMatch(/if \(!canUseCanvasToolbar\) return;/);
    // Nothing is written here.
    expect(handler).not.toContain('.insert(');
    expect(handler).not.toContain('knowledge/references');
  });

  it('B: opens the editor with the builder title and blank content', () => {
    const handler = after(canvasClient, 'const handleCreateNoteFromKnowledgePage', 1200);
    expect(handler).toContain('title: draft.title');
    expect(handler).toContain('content: draft.content');
    // The page text never becomes authorship.
    expect(handler).not.toContain('pageText');
    expect(handler).not.toContain('request.pageText');
  });

  it('C: keeps provenance out of every padlet row and metadata object', () => {
    // The Note insert payload in the direct save path names no provenance.
    const insert = after(padletSave, "const { data: newPadlet, error } = await supabase", 800);
    expect(insert).toContain("type: 'text'");
    expect(insert).not.toContain('sourceReference');

    // Nowhere does either file put the draft into a metadata object.
    for (const source of [canvasClient, padletSave, gridSave]) {
      expect(source).not.toMatch(/metadata:\s*\{[^}]*sourceReference/);
      expect(source).not.toMatch(/sourceReference[^\n]*metadata\s*:/);
    }
    expect(canvasClient).not.toContain('locator');
  });

  it('D: transfers provenance onto the placement draft when placement defers', () => {
    const placement = after(padletSave, 'const placementNeeded = checkPlacementRequired(', 700);
    expect(placement).toContain('sourceReference: sourceNoteReference');
    // The source title survives placement; ordinary Notes keep their existing
    // title-less draft.
    expect(placement).toContain('title: data.title');
    expect(placement).toMatch(/sourceNoteReference\s*\n?\s*\?/);
    expect(placement).toMatch(/:\s*\{ kind: 'note', content: data\.content, metadata \}/);

    // Grid/columns/wall spread the draft whole, so the field rides along.
    expect(gridSave).toContain("sourceReference?: PendingPostDraft['sourceReference']");
    expect((gridSave.match(/\.\.\.draft,/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('E: completes the reference only after the insert has produced a real id', () => {
    const saveNoteIndex = padletSave.indexOf('const saveNote = useCallback');
    const insertIndex = padletSave.indexOf('.insert({', saveNoteIndex);
    const throwIndex = padletSave.indexOf('if (error) throw error;', insertIndex);
    const completionIndex = padletSave.indexOf('onSourceNoteCreated?.(', throwIndex);

    expect(insertIndex).toBeGreaterThan(saveNoteIndex);
    expect(throwIndex).toBeGreaterThan(insertIndex);
    // Strictly after the failure check: a rejected insert never reports one.
    expect(completionIndex).toBeGreaterThan(throwIndex);
    expect(after(padletSave, 'onSourceNoteCreated?.(', 120)).toContain('newPadlet.id');
    // Guarded on a real id, not on the draft alone.
    expect(padletSave).toContain('if (sourceNoteReference && newPadlet?.id)');
  });

  it('F: posts to the existing same-origin F4-B references route', () => {
    const helper = after(canvasClient, 'const persistKnowledgeSourceReference', 1500);
    expect(helper).toContain('/knowledge/references');
    expect(helper).toContain("method: 'POST'");
    expect(helper).toContain('encodeURIComponent(canvasId)');
    expect(helper).not.toContain('supabase');
  });

  it('G: sends exactly the five client-owned body fields', () => {
    const body = after(canvasClient, 'body: JSON.stringify({', 420);
    for (const allowed of ['targetPadletId', 'sourceDocumentId', 'pageStart', 'pageEnd', 'quoteText']) {
      expect(body, allowed).toContain(allowed);
    }
    for (const forbidden of ['boardId', 'userId', 'quoteHash', 'charStart', 'charEnd', 'locator', 'createdAt']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });

  it('H: adds no elevated Supabase authority anywhere on the path', () => {
    for (const [name, source] of [['CanvasClient', canvasClient], ['usePadletSave', padletSave], ['details', details], ['sidebar', sidebar]] as const) {
      for (const forbidden of ['getSupabaseAdmin', 'lib/supabase/admin', 'service_role', 'SUPABASE_SERVICE_ROLE_KEY']) {
        expect(source, `${name}:${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('I: a failed reference keeps the Note and only tells the user', () => {
    const helper = after(canvasClient, 'const persistKnowledgeSourceReference', 1500);
    const failure = helper.slice(helper.indexOf('} catch'));
    expect(failure).toContain('toast.error');
    expect(failure).toContain('Note created, but source link could not be saved');
    // No rollback of any kind, and nothing rethrown into the creation path.
    for (const forbidden of ['delete', 'setPadlets', 'fetchData', 'filter', 'throw']) {
      expect(failure, forbidden).not.toContain(forbidden);
    }
  });

  it('J: every placement family finalises through the shared completion helper', () => {
    // One shared finaliser, kind-gated so only Notes ever reach the route.
    const finaliser = after(canvasClient, 'const completeSourceReferenceForDraft', 700);
    expect(finaliser).toContain("draft.kind !== 'note'");
    expect(finaliser).toContain('persistKnowledgeSourceReference(targetPadletId, draft.sourceReference)');

    // Columns/wall/timeline "add to existing" -- the shared container finaliser.
    expect(after(canvasClient, 'const createRealPostFromDraft', 2000)).toContain('completeSourceReferenceForDraft(newId, draft)');
    // Wall "create new container".
    expect(after(canvasClient, 'const handleCreateWallContainerWithDraft', 2600)).toContain('completeSourceReferenceForDraft(childData.id, wallPendingPostDraft)');
    // Timeline horizontal-all "create new container".
    expect(after(canvasClient, 'const handleCreateHorizontalAllTimelineContainerWithDraft', 2600)).toContain('completeSourceReferenceForDraft(childData.id, currentDraft)');
    // Grid/columns "create new container".
    expect(after(canvasClient, 'const handleCreateNewContainerWithDraft', 3000)).toContain('completeSourceReferenceForDraft(childData.id, currentDraft)');
    // Scheduler ghost drop onto an empty slot.
    expect(after(canvasClient, 'const placeDraftInNewSchedulerContainer', 2600)).toContain('completeSourceReferenceForDraft(postId, draft)');
    // Drawing "new container".
    expect(after(canvasClient, 'const handleDrawingNewContainer', 3200)).toContain('completeSourceReferenceForDraft(childId,');
    // Drawing "add to existing": the ghost's drop payload is rebuilt elsewhere,
    // so the controller carries the draft and consumes it exactly once.
    expect(after(canvasClient, 'const handleDrawingAddToExisting', 900)).toContain('drawingGhostSourceReferenceRef.current =');
    const drawingAdd = after(canvasClient, 'const handleDrawingLayoutAddPadlet', 1400);
    expect(drawingAdd).toContain('const created = await addDrawingLayoutPadlet(newPadlet, newId)');
    expect(drawingAdd).toContain('drawingGhostSourceReferenceRef.current = null');
    expect(drawingAdd).toContain('if (created && pendingSource)');

    // Six deferred-placement commit sites, plus the drawing ghost's own
    // consume-once completion and the direct-save callback in usePadletSave.
    expect((canvasClient.match(/\n\s*completeSourceReferenceForDraft\(/g) ?? []).length).toBe(6);
  });

  it('K: ordinary Note creation carries no source reference at all', () => {
    // The toolbar path builds its draft with no provenance and clears any
    // abandoned source workflow first.
    expect(after(canvasClient, 'const executeToolAction', 400)).toContain('setSourceNoteReference(null)');
    // Closing the editor for any reason ends the workflow.
    expect(canvasClient).toMatch(/if \(!isNoteEditorOpen\) setSourceNoteReference\(null\);/);

    // The toolbar's own new-Note draft, identified by its stock title.
    const toolbarNote = after(canvasClient, "title: 'New Note',", 700);
    expect(toolbarNote).toContain('setIsNoteEditorOpen(true)');
    expect(toolbarNote).not.toContain('sourceReference');
    expect(toolbarNote).not.toContain('sourceDocumentId');

    // Editing an existing Note never reports a creation.
    const update = after(padletSave, '} else if (padletToEdit) {', 700);
    expect(update).not.toContain('onSourceNoteCreated');
  });

  it('exposes the page action only with a real document id and a create capability', () => {
    expect(details).toContain('onCreateNoteFromPage && documentId ?');
    const action = after(details, 'onClick={() => onCreateNoteFromPage({', 420);
    expect(action).toContain('sourceDocumentId: documentId');
    // Never the filename or an index as identity.
    expect(action).not.toContain('sourceDocumentId: originalFilename');
    expect(action).toContain('pageNumber: page.pageNumber');
    expect(action).toContain('pageText: page.text');
    // The reader surface never writes anything itself.
    expect(details).not.toContain('knowledge/references');
    expect(details).not.toContain('supabase');
  });
});
