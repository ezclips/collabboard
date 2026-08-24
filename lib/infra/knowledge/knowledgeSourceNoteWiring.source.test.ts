import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKnowledgeSourceNoteDraft } from '../../domain/knowledge/knowledgeSourceNoteDraft';

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
const drawingLayout = sourceOf('components/collabboard/canvas/layouts/DrawingLayout.tsx');

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
    // Drawing "new container": provenance-gated, not kind-gated (see the F5-B2
    // suite below for why the kind-gated finaliser cannot serve this path).
    expect(after(canvasClient, 'const handleDrawingNewContainer', 3600)).toContain('void persistKnowledgeSourceReference(childId, droppedSourceReference)');
    // Drawing "add to existing": provenance travels on the dropped payload
    // itself (see the dedicated F5-B1 suite below).
    const drawingAdd = after(canvasClient, 'const handleDrawingLayoutAddPadlet', 1600);
    expect(drawingAdd).toContain('const created = await addDrawingLayoutPadlet(newPadlet, newId)');
    expect(drawingAdd).toContain('if (created && droppedSourceReference) void persistKnowledgeSourceReference(newId, droppedSourceReference)');

    // Five kind-gated deferred-placement sites; both Drawing paths complete on
    // provenance presence instead, and the direct save reports through
    // usePadletSave's callback.
    expect((canvasClient.match(/\n\s*completeSourceReferenceForDraft\(/g) ?? []).length).toBe(5);
    // Three direct persists: the shared finaliser's own, plus the two Drawing
    // paths whose rebuilt payloads have no `kind` to gate on.
    expect((canvasClient.match(/void persistKnowledgeSourceReference\(/g) ?? []).length).toBe(3);
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

  // ==========================================================================
  // P6J-F5-B1 -- Drawing ghost provenance isolation
  // ==========================================================================
  // The original F5-B implementation parked the draft in a controller ref while
  // the ghost was in flight. An abandoned ghost then left that value live, and
  // the next unrelated library drop consumed it -- a durable source_references
  // row pointing at the wrong post. Provenance now travels ON the dropped
  // payload, so there is no carrier left to go stale.
  describe('drawing ghost provenance', () => {
    const drawingAdd = () => after(canvasClient, 'const handleDrawingLayoutAddPadlet', 1600);

    it('carries provenance on the ghost payload itself', () => {
      // The ghost serialises the whole draft, so the field rides the drop.
      expect(drawingLayout).toContain("e.dataTransfer.setData('application/collabboard-library', JSON.stringify(ghostDraft))");
      // Both payload rebuilds forward it, each keyed to its OWN parsed payload.
      expect(drawingLayout).toContain('...(libData.sourceReference ? { sourceReference: libData.sourceReference } : {})');
      expect(drawingLayout).toContain('...(item.sourceReference ? { sourceReference: item.sourceReference } : {})');
      // A payload without the field contributes no key at all.
      expect(drawingLayout).not.toMatch(/sourceReference:\s*(libData|item)\.sourceReference\s*\|\|/);
      expect(drawingLayout).toContain("sourceReference?: PendingPostDraft['sourceReference']");
    });

    it('resolves provenance only from the payload currently being dropped', () => {
      const body = drawingAdd();
      expect(body).toContain('const droppedSourceReference = (postData as { sourceReference?: KnowledgeSourceReferenceDraft }).sourceReference ?? null');
      // The only NAMED provenance carriers this handler may mention are the
      // local derived from postData and the persistence helper. Any other
      // identifier -- a ref, a module value, a captured state variable -- is
      // exactly the defect this correction removes.
      const carriers = body.match(/\b[A-Za-z_$][A-Za-z0-9_$]*SourceReference[A-Za-z0-9_$]*\b/g) ?? [];
      expect(carriers.length).toBeGreaterThan(0);
      const allowed = new Set(['droppedSourceReference', 'persistKnowledgeSourceReference', 'KnowledgeSourceReferenceDraft']);
      expect([...new Set(carriers)].filter((name) => !allowed.has(name))).toEqual([]);
    });

    it('leaves no controller-held fallback anywhere in the controller', () => {
      // The whole class of defect: any ref/module value remembering a draft.
      expect(canvasClient).not.toContain('drawingGhostSourceReferenceRef');
      expect(canvasClient).not.toMatch(/useRef<[^>]*KnowledgeSourceReferenceDraft/);
      expect(canvasClient).not.toMatch(/[A-Za-z0-9_]*[sS]ourceReference[A-Za-z0-9_]*\.current/);
      // The one retained piece of source state belongs to the open editor and
      // is cleared whenever it closes.
      expect(canvasClient).toMatch(/if \(!isNoteEditorOpen\) setSourceNoteReference\(null\);/);
    });

    it('persists only after a real created row, using that row id', () => {
      const body = drawingAdd();
      const createdIndex = body.indexOf('const created = await addDrawingLayoutPadlet(newPadlet, newId)');
      const persistIndex = body.indexOf('persistKnowledgeSourceReference(newId, droppedSourceReference)');
      expect(createdIndex).toBeGreaterThan(-1);
      // Strictly after the insert, and guarded on it having produced a row.
      expect(persistIndex).toBeGreaterThan(createdIndex);
      expect(body).toContain('if (created && droppedSourceReference)');
      // Never a placeholder identity.
      expect(body).not.toContain("persistKnowledgeSourceReference('new'");
      expect(body).not.toContain('persistKnowledgeSourceReference(droppedSourceReference.sourceDocumentId');
    });

    it('never lets provenance reach the padlet row', () => {
      const body = drawingAdd();
      expect(body).toContain('delete newPadlet.sourceReference');
      const deleteIndex = body.indexOf('delete newPadlet.sourceReference');
      const insertIndex = body.indexOf('await addDrawingLayoutPadlet');
      expect(deleteIndex).toBeGreaterThan(-1);
      // Stripped before the row is ever written.
      expect(insertIndex).toBeGreaterThan(deleteIndex);
      expect(drawingLayout).not.toMatch(/metadata:\s*\{[^}]*sourceReference/);
    });

    it('survives the ghost payload JSON round trip byte for byte', () => {
      // The ghost crosses a dataTransfer boundary as JSON, so the draft must be
      // plain serialisable data -- a non-serialisable field would vanish here.
      const draft = buildKnowledgeSourceNoteDraft({
        sourceDocumentId: 'doc-source-a',
        originalFilename: 'a.pdf',
        pageNumber: 3,
        pageText: '  spaced\r\nquote  ',
      }).sourceReference;

      const ghost = { kind: 'note', title: 'a.pdf', content: '', metadata: {}, sourceReference: draft };
      const roundTripped = JSON.parse(JSON.stringify(ghost)) as { sourceReference: typeof draft };

      expect(roundTripped.sourceReference).toEqual(draft);
      expect(roundTripped.sourceReference.quoteText).toBe('  spaced\r\nquote  ');
      expect(Object.keys(roundTripped.sourceReference).sort()).toEqual([
        'pageEnd', 'pageStart', 'quoteText', 'sourceDocumentId',
      ]);
    });

    it('isolates three drafts with no shared carrier between them', () => {
      // A -> SOURCE-A, B (no provenance) -> nothing, C -> SOURCE-C. The forward
      // is a conditional spread off each payload, so B can produce no key even
      // when it is processed between A and C.
      const forward = (payload: Record<string, unknown>) => ({
        title: 'x',
        ...(payload.sourceReference ? { sourceReference: payload.sourceReference } : {}),
      });

      const a = forward({ sourceReference: { sourceDocumentId: 'SOURCE-A', pageStart: 1, pageEnd: 1, quoteText: null } });
      const b = forward({});
      const c = forward({ sourceReference: { sourceDocumentId: 'SOURCE-C', pageStart: 2, pageEnd: 2, quoteText: null } });

      expect((a.sourceReference as { sourceDocumentId: string }).sourceDocumentId).toBe('SOURCE-A');
      expect(b).not.toHaveProperty('sourceReference');
      expect(JSON.stringify(b)).not.toContain('SOURCE-A');
      expect((c.sourceReference as { sourceDocumentId: string }).sourceDocumentId).toBe('SOURCE-C');
    });
  });

  // ==========================================================================
  // P6J-F5-B2 -- Drawing "new container" after an empty-canvas ghost drop
  // ==========================================================================
  // A ghost dropped on empty canvas is rebuilt by DrawingLayout, re-enters the
  // container prompt, and is stored as drawingPendingDraft. That rebuild keeps
  // `type` and the provenance but drops `kind`, so the kind-gated finaliser
  // silently refused it: the Note was created and its source link vanished with
  // no error. Completion on this path keys off provenance presence instead.
  describe('drawing new-container completion', () => {
    const newContainer = () => after(canvasClient, 'const handleDrawingNewContainer', 3600);

    /** The payload shape DrawingLayout actually hands back, derived from its source. */
    function rebuiltPayload(sourceDocumentId: string | null) {
      const canvasDrop = after(drawingLayout, 'const item = JSON.parse(libData);', 1200);
      // Verified against the real rebuild: `kind` is not among the forwarded keys.
      expect(canvasDrop).toContain("type: (item.type || item.kind || 'note')");
      expect(canvasDrop).not.toMatch(/\n\s+kind:/);
      expect(canvasDrop).toContain('...(item.sourceReference ? { sourceReference: item.sourceReference } : {})');
      return {
        type: 'note',
        title: 'a.pdf',
        content: '',
        metadata: { forceContainerPrompt: true },
        ...(sourceDocumentId
          ? { sourceReference: { sourceDocumentId, pageStart: 3, pageEnd: 3, quoteText: 'page three' } }
          : {}),
      } as Record<string, unknown>;
    }

    it('proves the rebuilt payload is kind-less yet still carries provenance', () => {
      const payload = rebuiltPayload('SOURCE-A');

      expect('kind' in payload).toBe(false);
      expect(payload.sourceReference).toEqual({
        sourceDocumentId: 'SOURCE-A', pageStart: 3, pageEnd: 3, quoteText: 'page three',
      });
      // This is exactly why a kind test cannot serve this path and a provenance
      // test can -- the defect and its fix, side by side.
      expect((payload as { kind?: string }).kind === 'note').toBe(false);
      expect(Boolean(payload.sourceReference)).toBe(true);
    });

    it('completes on provenance presence, never on kind', () => {
      const body = newContainer();
      const completion = body.slice(body.indexOf('await insertPostOrThrow(childPadlet)'));

      expect(completion).toContain('const droppedSourceReference = (drawingPendingDraft as { sourceReference?: KnowledgeSourceReferenceDraft }).sourceReference');
      expect(completion).toContain('if (droppedSourceReference) void persistKnowledgeSourceReference(childId, droppedSourceReference)');
      // The kind-gated finaliser is gone from this handler: it could never
      // admit a rebuilt payload, and leaving it would double-complete.
      expect(completion).not.toContain('completeSourceReferenceForDraft');
      expect(completion).not.toContain('kind');
    });

    it('persists exactly once, after the child insert, with the real child id', () => {
      const body = newContainer();
      const containerInsert = body.indexOf('await insertPostOrThrow(containerPadlet)');
      const childInsert = body.indexOf('await insertPostOrThrow(childPadlet)');
      const persist = body.indexOf('void persistKnowledgeSourceReference(childId, droppedSourceReference)');

      expect(containerInsert).toBeGreaterThan(-1);
      expect(childInsert).toBeGreaterThan(containerInsert);
      // Strictly after the child row exists.
      expect(persist).toBeGreaterThan(childInsert);
      expect((body.match(/persistKnowledgeSourceReference\(/g) ?? []).length).toBe(1);
      // The child Note is the target -- never its container.
      expect(body).not.toContain('persistKnowledgeSourceReference(containerId');
      expect(body).toContain('const childId = crypto.randomUUID()');
    });

    it('skips a failed child insert and a payload with no provenance', () => {
      const body = newContainer();
      // Both inserts throw on failure, and the completion sits inside the same
      // try, so a failed child can never reach it.
      const tryIndex = body.indexOf('try {');
      const catchIndex = body.indexOf('} catch');
      const persist = body.indexOf('void persistKnowledgeSourceReference(childId, droppedSourceReference)');
      expect(persist).toBeGreaterThan(tryIndex);
      expect(persist).toBeLessThan(catchIndex);
      // And the guard is presence, so a provenance-free rebuild does nothing.
      expect(rebuiltPayload(null)).not.toHaveProperty('sourceReference');
      expect(body).toContain('if (droppedSourceReference)');
    });

    it('keeps the child row free of provenance', () => {
      const body = newContainer();
      const childRow = body.slice(body.indexOf('const childPadlet'), body.indexOf('setPadlets(prev => [...prev, containerPadlet, childPadlet])'));

      // The row is built from named fields, so nothing spreads provenance in.
      expect(childRow).not.toContain('sourceReference');
      expect(childRow).toContain('metadata: { ...childMetadata, parentId: containerId }');
    });
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
