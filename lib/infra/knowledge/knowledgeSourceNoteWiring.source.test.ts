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
// P6J-F7-B1: the reader moved out of the sidebar into a shell-level drawer, so
// the create-Note callback now travels CanvasClient -> drawer directly.
const readerDrawer = sourceOf('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const documentsList = sourceOf('components/collabboard/KnowledgeDocumentsList.tsx');
const freeformCards = sourceOf('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

/** Everything between an anchor and the next `count` characters of source. */
function after(source: string, anchor: string, count = 900): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

describe('P6J-F5 source note wiring', () => {
  /**
   * P6J-F7-B1 RETIRES three presentation premises this test used to hold, and
   * ONLY those three. Each is obsolete because the reader left the sidebar:
   *
   *   1. `CanvasSidebar` contains `onCreateNoteFromKnowledgePage` -- it no
   *      longer sees the callback at all; CanvasClient hands it to the drawer.
   *   2. The sidebar closes Knowledge via `setKnowledgeOpen(false)` BEFORE
   *      forwarding -- F7 requires the opposite: the reader stays open, so the
   *      source sits beside the Note being drafted from it.
   *   3. The callback is routed specifically THROUGH `CanvasSidebar`.
   *
   * Everything about the durable WRITE path below is untouched, and the
   * replacements below are inversions rather than deletions, so none of the
   * retired behaviour can quietly return.
   */
  it('A: routes the Knowledge page request into the ordinary Note editor', () => {
    // The sidebar is out of this path entirely, and still writes nothing.
    expect(sidebar).not.toContain('onCreateNoteFromKnowledgePage');
    expect(sidebar).not.toContain('onCreateNoteFromPage');
    expect(sidebar).not.toContain('padlets');
    expect(sidebar).not.toContain('knowledge/references');

    // F7 wiring: CanvasClient -> KnowledgeSourceReaderDrawer -> the same handler.
    expect(canvasClient).toContain('<KnowledgeSourceReaderDrawer');
    expect(after(canvasClient, '<KnowledgeSourceReaderDrawer', 400))
      .toContain('onCreateNoteFromPage={handleCreateNoteFromKnowledgePage}');
    // The drawer forwards the callback verbatim: no wrapper, and above all no
    // close. Closing here is precisely what F7 removed.
    expect(readerDrawer).toContain('onCreateNoteFromPage={onCreateNoteFromPage}');
    const forward = after(readerDrawer, 'onCreateNoteFromPage={onCreateNoteFromPage}', 120);
    expect(forward).not.toContain('closeReader');
    expect(readerDrawer).not.toContain('setKnowledgeOpen');

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

  /**
   * P6J-F7-B1. Moving the reader must not have moved the WRITE. CanvasClient is
   * still the only layer that may persist a source reference; every Knowledge
   * presentation surface -- drawer, library, sidebar -- forwards and nothing
   * more. A drawer that could POST would be a second write path, and the
   * ordering guarantees in E and J would no longer describe the whole system.
   */
  it('A2: the reader surfaces forward create-Note only -- CanvasClient keeps the write', () => {
    for (const [name, source] of [
      ['KnowledgeSourceReaderDrawer', readerDrawer],
      ['KnowledgeDocumentsList', documentsList],
      ['CanvasSidebar', sidebar],
      ['KnowledgeDocumentDetails', details],
    ] as const) {
      for (const forbidden of [
        'knowledge/references',
        'persistKnowledgeSourceReference',
        'completeSourceReferenceForDraft',
        'sourceReferencesByPadletId',
        '.insert(',
        '.upsert(',
        'supabase',
      ]) {
        expect(source, `${name} must not ${forbidden}: the write is CanvasClient's`).not.toContain(forbidden);
      }
    }

    // The drawer issues no mutating request of any kind -- it reads pages.
    expect(readerDrawer).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
    // The library's only POSTs are the prewarm and the semantic search, both
    // reads in every sense that matters here.
    const listPosts = documentsList.match(/method:\s*'POST'/g) ?? [];
    expect(listPosts).toHaveLength(2);
    expect(documentsList).toContain('/knowledge/warm`, { method: \'POST\'');
    expect(after(documentsList, '/knowledge/search`, {', 60)).toContain("method: 'POST'");

    // And the write path itself still lives in exactly one place.
    expect((canvasClient.match(/knowledge\/references/g) ?? []).length).toBe(1);
    expect(canvasClient).toContain('const persistKnowledgeSourceReference = useCallback(async (');
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

  it('C5/C6/G: sends exactly the ten client-owned body fields', () => {
    // B4-B2B added the char offsets and the selected text; F9-B2 added the
    // rectangle and the rotation it was transformed with.
    const body = after(canvasClient, 'body: JSON.stringify({', 800);
    for (const allowed of ['targetPadletId', 'sourceDocumentId', 'pageStart', 'pageEnd', 'quoteText',
      'charStart', 'charEnd', 'selectedText', 'region', 'appliedRotation']) {
      expect(body, allowed).toContain(allowed);
    }
    // Identity, the hash and the locator remain server-owned and unreachable.
    // 'id' is deliberately not substring-checked here -- it occurs inside
    // targetPadletId and sourceDocumentId; the route suite's exact key-set
    // assertion is what pins id and createdAt out of the command input.
    for (const forbidden of ['boardId', 'userId', 'quoteHash', 'locator', 'createdAt']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
    // C5: the rectangle is forwarded from the draft, never rebuilt or measured
    // here, and no page or image dimension travels beside it.
    expect(body).toContain('region: sourceReference.region');
    expect(body).toContain('appliedRotation: sourceReference.appliedRotation');
    for (const forbidden of ['naturalWidth', 'naturalHeight', 'widthPoints', 'heightPoints',
      'clientWidth', 'getBoundingClientRect', 'storagePath', 'bucket', '.webp']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });

  /**
   * P6J-F9-B2. A region Note is an ordinary source Note: it must reach the
   * SAME builder, the SAME route and the SAME ordering, or B2 has quietly
   * grown a second write path that nothing else in this suite guards.
   */
  it('C7/C9/C10: a region uses the one Note writer and the one reference writer', () => {
    // C9: three entry points now -- the F8 clip drop, the page/region request,
    // and KNI-R2's existing-Note drop -- all reaching the ONE builder.
    expect(canvasClient.match(/buildKnowledgeSourceNoteDraft\(/g) ?? []).toHaveLength(3);
    // Nothing hand-builds provenance: the only value ever stashed is a draft's.
    expect(canvasClient.match(/setSourceNoteReference\((?!null\))/g) ?? []).toHaveLength(1);
    expect(canvasClient).toContain('setSourceNoteReference(draft.sourceReference)');
    // C10: one POST to the references route, in one helper.
    expect(canvasClient.match(/knowledge\/references/g) ?? []).toHaveLength(1);
    expect(canvasClient.match(/const persistKnowledgeSourceReference/g) ?? []).toHaveLength(1);
    // C7: the reference is still written from the completion helpers, which run
    // only once a real padlet id exists -- never from the request handler.
    const handler = after(canvasClient, 'const handleCreateNoteFromKnowledgePage', 700);
    expect(handler).toContain('buildKnowledgeSourceNoteDraft(request)');
    expect(handler).toContain('setSourceNoteReference(draft.sourceReference)');
    expect(handler).not.toContain('persistKnowledgeSourceReference');
  });

  it('C8: the reader adds no second failure channel for regions', () => {
    // The confirm control calls the existing callback and returns; the reference
    // outcome is reported exactly where every other mode reports it.
    const confirm = after(details, 'Create Note from area', 200);
    expect(confirm).not.toContain('fetch(');
    expect(confirm).not.toContain('toast');
    for (const forbidden of ['fetch(', 'supabase', 'knowledge/references']) {
      expect(details, `details:${forbidden}`).not.toContain(forbidden);
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
    // Window only: the failure path itself is byte-for-byte unchanged, but the
    // B4-B2B body pushed the catch block past the original 1500.
    const helper = after(canvasClient, 'const persistKnowledgeSourceReference', 1900);
    const failure = helper.slice(helper.indexOf('} catch'));
    expect(failure).toContain('toast.error');
    // KNI-R2: the message is now a defaulted parameter, unchanged for every pre-existing caller.
    expect(failure).toContain('toast.error(onSaveFailedMessage)');
    expect(helper).toContain("onSaveFailedMessage: string = 'Note created, but source link could not be saved'");
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
    // Five direct persists: the shared finaliser's own, the two Drawing paths
    // (no `kind` to gate on), the P6J-F8-B1 freeform source-clip drop, and
    // KNI-R2's existing-Note append -- none of the last three has a placement draft.
    expect((canvasClient.match(/void persistKnowledgeSourceReference\(/g) ?? []).length).toBe(5);
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
      // Widened at B4-B2B and again at F9-B2. Still an EXACT key set: a
      // page-only draft carries the span AND region fields as explicit nulls,
      // which survive the JSON round trip, and nothing server-owned joins them.
      expect(Object.keys(roundTripped.sourceReference).sort()).toEqual([
        'appliedRotation', 'charEnd', 'charStart', 'pageEnd', 'pageStart', 'quoteText',
        'region', 'selectedText', 'sourceDocumentId',
      ]);
      expect(roundTripped.sourceReference).toMatchObject({
        charStart: null, charEnd: null, selectedText: null, region: null, appliedRotation: null });
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

// ==========================================================================
// P6J-F8-B1 -- the dragged text source clip
// ==========================================================================
// The drag adds a GESTURE, not a write path. Everything below exists to prove
// that: one dedicated transfer type, parsed fail-closed, authorised again at
// the point of writing, and finishing through the same two creation paths that
// already existed. A render test cannot show any of it -- the drop handlers sit
// inside a 9k-line controller's JSX -- so these are source invariants.
describe('P6J-F8-B1 source clip drop', () => {
  const dropHandler = () => after(canvasClient, 'const handleKnowledgeSourceClipDrop', 3200);

  it('reads one dedicated transfer type and never text/plain', () => {
    const handler = dropHandler();
    expect(handler).toContain('parseKnowledgeSourceClipPayload(');
    expect(handler).toContain('event.dataTransfer.getData(KNOWLEDGE_SOURCE_CLIP_MIME)');
    // text/plain accompanies every drag on the system. Reading it here would
    // let any dropped text impersonate a citation.
    expect(handler).not.toContain("getData('text/plain')");
    expect(handler).not.toContain('text/plain');
    // The type is the domain constant, never a re-typed string literal that
    // could drift away from the one the reader publishes.
    expect(canvasClient).toContain("from '@/lib/domain/knowledge/knowledgeSourceClipPayload'");
    for (const name of ['KNOWLEDGE_SOURCE_CLIP_MIME', 'knowledgeSourceClipPageRequest', 'parseKnowledgeSourceClipPayload']) {
      expect(canvasClient, name).toContain(name);
    }
    expect(canvasClient).not.toContain("'application/collabboard-knowledge-clip'");
  });

  it('refuses an unparseable payload before anything else happens', () => {
    const handler = dropHandler();
    const parseIndex = handler.indexOf('parseKnowledgeSourceClipPayload(');
    const bailIndex = handler.indexOf('if (!payload) return false;');
    const buildIndex = handler.indexOf('buildKnowledgeSourceNoteDraft(');
    expect(bailIndex).toBeGreaterThan(parseIndex);
    // Nothing is built, and no post is inserted, until the payload is proven.
    expect(buildIndex).toBeGreaterThan(bailIndex);
  });

  it('re-checks the creation capability at the point of writing', () => {
    const handler = dropHandler();
    // The SAME signal the creation toolbar and the click path are gated on.
    expect(handler).toContain('if (!canUseCanvasToolbar || !canvasId) return true;');
    const capabilityIndex = handler.indexOf('if (!canUseCanvasToolbar');
    const insertIndex = handler.indexOf('insertPostAndSelectOrThrow(');
    const drawingIndex = handler.indexOf('handleDrawingLayoutAddPadletWithContainerCheck(');
    // Both creation routes sit behind it: a forged DataTransfer from a viewer
    // reaches neither, so the absent chip is defence in depth, not the defence.
    expect(insertIndex).toBeGreaterThan(capabilityIndex);
    expect(drawingIndex).toBeGreaterThan(capabilityIndex);
  });

  it('creates the Note first and completes the reference only after', () => {
    const handler = dropHandler();
    const insertIndex = handler.indexOf('await insertPostAndSelectOrThrow(');
    const idGuardIndex = handler.indexOf('if (created?.id)');
    const persistIndex = handler.indexOf('void persistKnowledgeSourceReference(created.id');
    expect(insertIndex).toBeGreaterThan(-1);
    // Guarded on a REAL persisted id, and strictly after the insert resolves.
    expect(idGuardIndex).toBeGreaterThan(insertIndex);
    expect(persistIndex).toBeGreaterThan(idGuardIndex);
    // A throwing insert never reaches the persist: it is inside the try.
    expect(handler.indexOf('} catch (err)')).toBeGreaterThan(persistIndex);
    // Drawing defers to the path that already owns this ordering.
    expect(handler).toContain('sourceReference: draft.sourceReference,');
  });

  it('adds no write path, no route and no elevated authority of its own', () => {
    const handler = dropHandler();
    for (const forbidden of ['knowledge/references', 'supabase', '.insert(', '.upsert(', 'fetch(',
      'getSupabaseAdmin', 'service_role']) {
      expect(handler, forbidden).not.toContain(forbidden);
    }
    // Still exactly one references POST in the whole controller.
    expect((canvasClient.match(/knowledge\/references/g) ?? []).length).toBe(1);
  });

  it('reuses the one existing draft builder rather than a second one', () => {
    const handler = dropHandler();
    expect(handler).toContain('buildKnowledgeSourceNoteDraft(knowledgeSourceClipPageRequest(payload))');
    // The Note is an ordinary blank Note; the passage stays source evidence.
    expect(handler).toContain('content: draft.content,');
    expect(handler).toContain('title: draft.title,');
    expect(handler).toContain("type: 'text',");
    // The selected text is never written into the row.
    expect(handler).not.toContain('selectedText,');
    expect(handler).not.toMatch(/content:\s*payload\./);
    expect(handler).not.toMatch(/metadata:\s*\{[^}]*source/);
  });

  it('creates at the real drop point in freeform, and refuses coordinate-less layouts', () => {
    const handler = dropHandler();
    // The existing conversion and the existing bound, not a second geometry.
    expect(handler).toContain('getCanvasPointFromClient(event.clientX, event.clientY)');
    expect(handler).toContain('clampRectPositionToFreeformBounds({');
    // Wall/columns/grid/timeline/map have no world coordinate; the clip is
    // refused there rather than stacked at the origin.
    expect(handler).toContain('if (!isFreeformLayout) {');
    const refusal = handler.slice(handler.indexOf('if (!isFreeformLayout) {'));
    expect(refusal.slice(0, 400)).toContain('return true;');
    expect(handler).not.toMatch(/position_x:\s*0,\s*\n\s*position_y:\s*0,/);
  });

  it('owns the drop outright, so one gesture cannot create twice', () => {
    const handler = dropHandler();
    // stopPropagation is SYNCHRONOUS and before any await: the drop finishes
    // dispatching the moment the handler yields, so a deferred one would be a
    // no-op and the outer CanvasViewport handler would create a second Note.
    const stopIndex = handler.indexOf('event.stopPropagation();');
    expect(stopIndex).toBeGreaterThan(-1);
    expect(handler.slice(0, stopIndex)).not.toContain('await');
    // Both drop surfaces consult it first and return the moment it claims one.
    const callSite = 'if (handleKnowledgeSourceClipDrop(e)) return;';
    expect((canvasClient.match(/if \(handleKnowledgeSourceClipDrop\(e\)\) return;/g) ?? []).length).toBe(2);

    /**
     * Ahead of every pre-existing branch on BOTH surfaces. Measured inside each
     * call site's own forward window rather than by global index: several
     * unrelated handlers elsewhere in this 9k-line file read the same transfer
     * types, and a whole-file indexOf would compare against one of those.
     */
    const viewportSite = canvasClient.indexOf(callSite);
    const layerSite = canvasClient.lastIndexOf(callSite);
    expect(viewportSite).toBeGreaterThan(-1);
    expect(layerSite).toBeGreaterThan(viewportSite);
    // CanvasViewport: the padlet reposition read follows the clip check.
    expect(canvasClient.slice(viewportSite, layerSite))
      .toContain("const padletId = e.dataTransfer.getData('text/padlet-id');");
    // PadletLayer: the SVG and library branches follow it too.
    const layerWindow = canvasClient.slice(layerSite, layerSite + 4000);
    expect(layerWindow).toContain("e.dataTransfer.getData('application/collabboard-svg')");
    expect(layerWindow).toContain("e.dataTransfer.getData('application/collabboard-library')");
    // The scheduler's own drop guard still runs before the clip check.
    const beforeLayerSite = canvasClient.slice(viewportSite, layerSite);
    expect(beforeLayerSite).toContain(".closest?.('.scheduler-wrapper, .rbc-calendar')");
  });

  it('keeps the reader free of drop, creation and persistence concerns', () => {
    // The chip publishes a payload; it never learns what a canvas is.
    for (const forbidden of ['getCanvasPointFromClient', 'clampRectPositionToFreeformBounds',
      'insertPostAndSelectOrThrow', 'padlets', 'board_id', 'position_x', 'onDrop']) {
      expect(details, forbidden).not.toContain(forbidden);
    }
    // It builds the transfer with the shared builder and reads no selection of
    // its own at drag time -- the captured state is the authority.
    expect(details).toContain('buildKnowledgeSourceClipTransfer({');
    const dragStart = after(details, 'onDragStart={(event) => {', 700);
    expect(dragStart).toContain('pageSelection.charStart');
    expect(dragStart).toContain('pageSelection.charEnd');
    expect(dragStart).toContain('pageSelection.selectedText');
    // window.getSelection() here would find nothing: pressing the chip collapses
    // the live range before dragstart fires.
    expect(dragStart).not.toContain('getSelection');
    expect(dragStart).not.toContain('captureExactSelection');
  });

  it('keeps the chip out of the canonical text root', () => {
    // Source-level companion to the rendered assertion in the reader suite:
    // the chip is emitted before the paragraph that owns the coordinate space,
    // in the page header, and the paragraph itself gains nothing.
    const chipIndex = details.indexOf('[CLIP_CHIP]: \'true\'');
    const rootIndex = details.indexOf('{...{ [PAGE_TEXT_ROOT]: page.pageNumber }}');
    expect(chipIndex).toBeGreaterThan(-1);
    expect(chipIndex).toBeLessThan(rootIndex);
    // Nothing was added between the root attribute and its rendered text.
    const rootElement = details.slice(rootIndex, rootIndex + 400);
    expect(rootElement).toContain('highlightedText(');
    expect(rootElement).not.toContain('CLIP_CHIP');
    expect(rootElement).not.toContain('draggable');
  });
});

// ==========================================================================
// KNI-R2 -- dropping a source clip onto an EXISTING ordinary Note
// ==========================================================================
describe('KNI-R2 existing-Note source clip drop', () => {
  const existingNoteHandler = () => after(canvasClient, 'const handleKnowledgeSourceClipDropOnExistingNote', 2000);

  it('parses the one dedicated clip, claims synchronously, then validates the target type', () => {
    const handler = existingNoteHandler();
    const parseIndex = handler.indexOf('parseKnowledgeSourceClipPayload(');
    const bailIndex = handler.indexOf('if (!payload) return false;');
    const stopIndex = handler.indexOf('event.stopPropagation();');
    const typeGuardIndex = handler.indexOf("targetPadlet.type !== 'text' && targetPadlet.type !== 'note'");
    const capabilityIndex = handler.indexOf('if (!canUseCanvasToolbar || !canvasId) return true;');
    expect(bailIndex).toBeGreaterThan(parseIndex);
    // Claimed before any await -- a deferred stopPropagation lets the same clip also create a second Note.
    expect(stopIndex).toBeGreaterThan(bailIndex);
    expect(handler.slice(0, stopIndex)).not.toContain('await');
    // Re-checked at the point of writing -- a viewer can synthesise a payload.
    expect(capabilityIndex).toBeGreaterThan(stopIndex);
    expect(typeGuardIndex).toBeGreaterThan(capabilityIndex);
    // And it never reaches the new-Note creation path.
    for (const forbidden of ['insertPostAndSelectOrThrow', 'handleDrawingLayoutAddPadletWithContainerCheck']) {
      expect(handler, forbidden).not.toContain(forbidden);
    }
  });

  it('updates the Note content before completing the reference, and only on success', () => {
    const handler = existingNoteHandler();
    const updateIndex = handler.indexOf('await updatePostFieldsOrThrow(targetPadlet.id');
    const persistIndex = handler.indexOf('void persistKnowledgeSourceReference(');
    const catchIndex = handler.indexOf('} catch (err)');
    expect(updateIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeGreaterThan(updateIndex);
    // Both sit inside the same try -- a rejected update jumps to catch instead.
    expect(persistIndex).toBeLessThan(catchIndex);
    expect(handler).toContain("'Text was added, but the source link could not be saved'");
    expect(handler).not.toContain('Note created, but source link could not be saved');
    // Reuses the one draft builder and the one append authority.
    expect(handler).toContain('buildKnowledgeSourceNoteDraft(knowledgeSourceClipPageRequest(payload))');
    expect(handler).toContain('appendKnowledgeSourceSelectionToNoteContent(');
  });

  it('is wired once on each of Freeform and Drawing, which forward and persist nothing themselves', () => {
    expect((canvasClient.match(/onKnowledgeSourceClipDropOnNote=\{handleKnowledgeSourceClipDropOnExistingNote\}/g) ?? []).length).toBe(2);
    for (const [name, source] of [['FreeformPadletCards', freeformCards], ['DrawingLayout', drawingLayout]] as const) {
      expect(source, name).toContain('onKnowledgeSourceClipDropOnNote?.(e, padlet)');
      for (const forbidden of ['parseKnowledgeSourceClipPayload', 'appendKnowledgeSourceSelectionToNoteContent', 'persistKnowledgeSourceReference']) {
        expect(source, `${name}:${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
