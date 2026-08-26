import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P6J-F6-B1 -- board-scoped source-reference read wiring.
 *
 * CanvasClient is ~400KB of TSX with no test seam, so these invariants are
 * pinned against its source.
 *
 * Line comments only. A block-comment strip is NOT safe here: CanvasClient's
 * JSX and string literals make the naive /\/\*[\s\S]*?\*\//g regex swallow
 * ~130KB of real code, which silently turns every "not found" assertion into a
 * false pass. F5 proved that the hard way.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/^\s*\/\/.*$/gm, '');
}

const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
const postCardContent = sourceOf('components/collabboard/PostCardContent.tsx');
const noteEditor = sourceOf('components/collabboard/editors/NoteEditor.tsx');
const canvasModals = sourceOf('components/collabboard/canvas/ui/CanvasModals.tsx');
const canvasSidebar = sourceOf('components/collabboard/canvas/ui/CanvasSidebar.tsx');
const documentsList = sourceOf('components/collabboard/KnowledgeDocumentsList.tsx');
const documentDetails = sourceOf('components/collabboard/KnowledgeDocumentDetails.tsx');
const referenceContext = sourceOf('components/collabboard/KnowledgeSourceReferenceContext.tsx');

/** A window starting at an anchor, failing loudly when the anchor is gone. */
function after(source: string, anchor: string, count = 900): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

const REFERENCE_STATE = 'const [sourceReferencesByPadletId, setSourceReferencesByPadletId] =';
const readBlock = () => after(canvasClient, REFERENCE_STATE, 4200);
const persistBlock = () => after(canvasClient, 'const persistKnowledgeSourceReference = useCallback(async (', 2400);

describe('P6J-F6-B1 board-scoped source reference read wiring', () => {
  it('A: CanvasClient reads through the F3 adapter rather than a hand-rolled query', () => {
    expect(canvasClient).toContain(
      "import { SupabaseKnowledgeSourceReferenceReader } from '@/lib/infra/knowledge/knowledgeSourceReferenceAdapters'",
    );
    expect(readBlock()).toContain('new SupabaseKnowledgeSourceReferenceReader(');
    // No second, ad-hoc path to the same table.
    expect(canvasClient).not.toContain("from('source_references')");
  });

  it('B: the board\'s existing authenticated browser client is what gets injected', () => {
    const block = readBlock();

    expect(block).toContain('supabase as unknown as KnowledgeSourceReferenceSupabaseClient');
    // That client is the memoised browser singleton the rest of the board uses.
    expect(canvasClient).toContain('const supabase = useMemo(() => supabaseBrowser(), [])');
  });

  it('C: no admin or service-role authority is introduced', () => {
    for (const forbidden of ['getSupabaseAdmin', 'SERVICE_ROLE', 'service_role', 'createClient(']) {
      expect(canvasClient).not.toContain(forbidden);
    }
  });

  it('D: the batch read is the one used, with the whole target set at once', () => {
    const block = readBlock();

    expect(block).toContain('reader.listReferencesByTargetPadletIds(targetIds.map(asPostId))');
    expect((block.match(/listReferencesByTargetPadletIds\(/g) ?? []).length).toBe(1);
  });

  it('E: the single-target read is never called from CanvasClient, let alone in a loop', () => {
    // The per-card read is exactly the N+1 this patch exists to avoid.
    expect(canvasClient).not.toContain('listReferencesByTargetPadletId(');
    for (const loop of [
      'for (const padlet of padlets)',
      'padlets.map(async',
      'Promise.all(padlets',
      'padletIds.map(async',
    ]) {
      expect(readBlock()).not.toContain(loop);
    }
  });

  it('F: the read waits for a resolved, authenticated, board-scoped session', () => {
    const block = readBlock();
    const gate = block.indexOf('if (!sourceReferenceScopeKey) return;');
    const request = block.indexOf('listReferencesByTargetPadletIds');

    expect(gate).toBeGreaterThan(-1);
    // The gate precedes the request, and the effect re-runs when scope resolves.
    expect(request).toBeGreaterThan(gate);
    expect(block).toContain('}, [sourceReferenceScopeKey, sourceReferenceTargetKey, supabase]);');
  });

  it('G: the trigger is a stable id-set key, not full padlet object identity', () => {
    const key = after(canvasClient, 'const sourceReferenceTargetKey = useMemo(', 400);

    // Sorted + unique: the same set in a different order is the same key, and
    // moving or renaming a post does not re-issue the query.
    expect(key).toContain('Array.from(new Set(padlets.map((padlet) => String(padlet.id)))).sort().join(\',\')');
    expect(key).toContain('[padlets],');
    expect(readBlock()).toContain('sourceReferenceTargetKey.split(\',\')');
  });

  it('G2: an empty target set clears the index without querying', () => {
    const block = readBlock();
    const emptyBranch = block.indexOf('if (targetIds.length === 0) {');
    const request = block.indexOf('listReferencesByTargetPadletIds');

    expect(emptyBranch).toBeGreaterThan(-1);
    expect(emptyBranch).toBeLessThan(request);
    expect(block.slice(emptyBranch, request)).toContain('setSourceReferencesByPadletId(EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX)');
    expect(block.slice(emptyBranch, request)).toContain('return;');
  });

  it('H: a stale in-flight result cannot overwrite a newer post set', () => {
    const block = readBlock();
    const request = block.indexOf('await reader.listReferencesByTargetPadletIds');
    const guard = block.indexOf('if (isStale()) return;');
    const commit = block.indexOf('setSourceReferencesByPadletId(buildKnowledgeSourceReferenceIndex(result.value))');

    expect(block).toContain('let cancelled = false;');
    expect(block).toContain('return () => { cancelled = true; };');
    // Cancellation is one of the two staleness reasons -- see the B1H suite
    // below for the mutation-generation half.
    expect(block).toContain('cancelled || startedAtMutation !== knowledgeReadGenerationRef.current');
    // The guard sits between awaiting the result and committing it.
    expect(guard).toBeGreaterThan(request);
    expect(commit).toBeGreaterThan(guard);
    // Per-effect local state only -- no module-level mutable cache.
    expect(canvasClient).not.toContain('const knowledgeSourceReferenceCache');
  });

  it('I: a failed read degrades to an empty index instead of reaching the user or the render', () => {
    const block = readBlock();
    const failure = block.slice(block.indexOf('if (!result.ok) {'));

    expect(block).toContain('if (!result.ok) {');
    expect(failure).toContain('setSourceReferencesByPadletId(EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX)');
    // Developer warning only: no toast, no throw, and no provider text.
    expect(failure).toContain('console.warn(');
    expect(failure.slice(0, failure.indexOf('setSourceReferencesByPadletId'))).not.toContain('toast.');
    expect(failure.slice(0, failure.indexOf('setSourceReferencesByPadletId'))).not.toContain('throw ');
    // An unexpected rejection still cannot escape into the board.
    expect(block).toContain('void load().catch(() => {');
  });

  it('J: a successful write indexes the reference the route returned', () => {
    const block = persistBlock();

    expect(block).toContain('parseKnowledgeSourceReference(');
    expect(block).toContain('.then((payload) => (payload as { reference?: unknown } | null)?.reference)');
    expect(block).toContain('setSourceReferencesByPadletId((current) => upsertKnowledgeSourceReference(current, created))');
  });

  it('K: the index update happens only after a 2xx, and never on failure', () => {
    const block = persistBlock();
    const okGate = block.indexOf('if (!response.ok) throw new Error(');
    const upsert = block.indexOf('upsertKnowledgeSourceReference(current, created)');
    const catchIndex = block.indexOf('} catch (err) {');

    expect(okGate).toBeGreaterThan(-1);
    // Strictly after the non-2xx guard, and strictly before the catch: a
    // rejected write can never reach it.
    expect(upsert).toBeGreaterThan(okGate);
    expect(upsert).toBeLessThan(catchIndex);
    expect(block).toContain('if (created) {');
  });

  it('K2: a 2xx whose body cannot be parsed is not reported as a failed save', () => {
    const block = persistBlock();
    const okGate = block.indexOf('if (!response.ok) throw new Error(');
    const parseFallback = block.indexOf('.catch(() => null)');
    const elseBranch = block.indexOf('} else {');
    const catchIndex = block.indexOf('} catch (err) {');
    const failureToast = block.indexOf("toast.error('Note created, but source link could not be saved')");

    // Reading the body absorbs its own rejection, so it cannot fall into the
    // F5 catch and claim the durable write failed.
    expect(parseFallback).toBeGreaterThan(okGate);
    expect(parseFallback).toBeLessThan(catchIndex);
    // The unparseable-body branch warns; the user-facing failure toast stays
    // behind the catch where F5 put it.
    expect(block.slice(elseBranch, catchIndex)).toContain('console.warn(');
    expect(block.slice(elseBranch, catchIndex)).not.toContain('toast.');
    expect(failureToast).toBeGreaterThan(catchIndex);
  });

  it('K3: F5 failure semantics are untouched -- one toast, no rollback', () => {
    const block = persistBlock();
    const failure = block.slice(block.indexOf('} catch (err) {'));

    expect((failure.match(/toast\./g) ?? []).length).toBe(1);
    expect(failure).toContain("toast.error('Note created, but source link could not be saved')");
    for (const rollback of ['delete', 'setPadlets', 'rollback']) {
      expect(failure).not.toContain(rollback);
    }
  });

  it('L: no source-reference state is copied into a padlet row or its metadata', () => {
    const block = readBlock();

    for (const leak of ['metadata: { ...', 'setPadlets(', 'sourceReferences:', 'markPadletLocallyModified']) {
      expect(block).not.toContain(leak);
    }
    expect(persistBlock()).not.toContain('setPadlets(');
    // The index is transient read state, held only in this one hook.
    // Empty-target clear, failure clear, load commit, catch clear, scope clear,
    // and the optimistic upsert.
    expect((canvasClient.match(/setSourceReferencesByPadletId\(/g) ?? []).length).toBe(6);
  });

  // ==========================================================================
  // P6J-F6-B1H -- scope clearing, no anonymous read, optimistic-race guard
  // ==========================================================================
  describe('hardened lifecycle', () => {
    const scopeKey = () => after(canvasClient, 'const sourceReferenceScopeKey =', 260);
    const clearEffect = () => after(canvasClient, 'const knowledgeReadGenerationRef = useRef(0);', 420);

    it('N: scope is board identity AND authenticated user identity together', () => {
      const scope = scopeKey();

      // Both halves, and only when the session has actually resolved.
      expect(scope).toContain('sessionReady && canvasId && user?.id');
      expect(scope).toContain('`${canvasId}:${user.id}`');
      // Null scope is what the load gate refuses on.
      expect(scope).toContain(': null;');
    });

    it('O: a resolved-but-signed-out session yields no scope, so no query', () => {
      const block = readBlock();
      const gate = block.indexOf('if (!sourceReferenceScopeKey) return;');
      const request = block.indexOf('await reader.listReferencesByTargetPadletIds');

      // Without a user id the scope key is null and the effect returns before
      // constructing a reader at all -- no anonymous read is ever issued.
      expect(gate).toBeGreaterThan(-1);
      expect(block.indexOf('new SupabaseKnowledgeSourceReferenceReader(')).toBeGreaterThan(gate);
      expect(request).toBeGreaterThan(gate);
      // The old latched-forever gate must not be what guards this.
      expect(block).not.toContain('if (!sessionReady) return;');
    });

    it('P: a scope change clears the index in its own effect', () => {
      const clear = clearEffect();

      expect(clear).toContain('setSourceReferencesByPadletId(EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX)');
      // Keyed on the scope itself, so a board switch or a user switch clears --
      // never on a coincidental padlet-id difference.
      expect(clear).toContain('}, [sourceReferenceScopeKey]);');
    });

    it('Q: the same scope change also retires any request already in flight', () => {
      const clear = clearEffect();
      const bump = clear.indexOf('knowledgeReadGenerationRef.current += 1;');
      const wipe = clear.indexOf('setSourceReferencesByPadletId(EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX)');

      expect(bump).toBeGreaterThan(-1);
      // Bumped with the clear, so an old-scope load cannot re-populate after it.
      expect(wipe).toBeGreaterThan(bump);
      expect(canvasClient).toContain('const knowledgeReadGenerationRef = useRef(0);');
    });

    it('R: a load captures the mutation generation BEFORE awaiting', () => {
      const block = readBlock();
      const capture = block.indexOf('const startedAtMutation = knowledgeReadGenerationRef.current;');
      const request = block.indexOf('await reader.listReferencesByTargetPadletIds');

      expect(capture).toBeGreaterThan(-1);
      // Captured at effect-run time, which is strictly before the request.
      expect(capture).toBeLessThan(request);
      expect(block).toContain('const isStale = () => cancelled || startedAtMutation !== knowledgeReadGenerationRef.current;');
    });

    it('S: the captured generation is re-checked before the index is replaced', () => {
      const block = readBlock();
      const request = block.indexOf('await reader.listReferencesByTargetPadletIds');
      const check = block.indexOf('if (isStale()) return;');
      const commit = block.indexOf('setSourceReferencesByPadletId(buildKnowledgeSourceReferenceIndex(result.value))');
      const failureClear = block.indexOf('console.warn(\'Knowledge source references unavailable:');

      // Between awaiting and committing -- both the success and failure paths.
      expect(check).toBeGreaterThan(request);
      expect(commit).toBeGreaterThan(check);
      expect(failureClear).toBeGreaterThan(check);
      // The unexpected-throw fallback is guarded by the same predicate, so it
      // cannot wipe an optimistic upsert either.
      expect(block).toContain('if (!isStale()) setSourceReferencesByPadletId(EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX);');
    });

    it('T: a successful write advances the generation before it upserts', () => {
      const block = persistBlock();
      const okGate = block.indexOf('if (!response.ok) throw new Error(');
      const bump = block.indexOf('knowledgeReadGenerationRef.current += 1;');
      const upsert = block.indexOf('upsertKnowledgeSourceReference(current, created)');

      // Only inside the `if (created)` success branch, after the 2xx gate.
      expect(bump).toBeGreaterThan(okGate);
      expect(bump).toBeGreaterThan(block.indexOf('if (created) {'));
      // Advanced FIRST: an in-flight load whose snapshot predates this row is
      // invalidated before the row is added, so it cannot commit over it.
      expect(bump).toBeLessThan(upsert);
    });

    it('U: the generation is advanced only by a real local mutation', () => {
      // Two sites total: the scope clear and the successful-write upsert.
      // Anything else advancing it would silently discard valid loads.
      expect((canvasClient.match(/knowledgeReadGenerationRef\.current \+= 1;/g) ?? []).length).toBe(2);
      const failure = persistBlock().slice(persistBlock().indexOf('} catch (err) {'));
      expect(failure).not.toContain('knowledgeReadGenerationRef');
      // The unparseable-2xx branch does not advance it either: nothing was
      // added locally, so an in-flight load is still valid.
      const elseBranch = persistBlock().slice(persistBlock().indexOf('} else {'), persistBlock().indexOf('} catch (err) {'));
      expect(elseBranch).not.toContain('knowledgeReadGenerationRef');
    });

    it('W: the scope-clear effect is declared BEFORE the reference-load effect', () => {
      const clearDeps = canvasClient.indexOf('}, [sourceReferenceScopeKey]);');
      const loadDeps = canvasClient.indexOf('}, [sourceReferenceScopeKey, sourceReferenceTargetKey, supabase]);');

      expect(clearDeps).toBeGreaterThan(-1);
      expect(loadDeps).toBeGreaterThan(-1);
      // React runs effect bodies in declaration order. If these were swapped,
      // the load would capture generation N and the clear would immediately
      // bump to N+1, so every post-scope-change load would be discarded as
      // stale and the index would never populate.
      expect(clearDeps).toBeLessThan(loadDeps);
    });

    it('V: no source-reference realtime subscription was introduced', () => {
      const block = readBlock();
      for (const forbidden of ['postgres_changes', '.channel(', 'removeChannel']) {
        expect(block).not.toContain(forbidden);
      }
      expect(canvasClient).not.toContain("table: 'source_references'");
    });
  });

  it('M: B1 adds no read or fetch to any card or editor UI', () => {
    for (const [name, source] of [['PostCardContent', postCardContent], ['NoteEditor', noteEditor]] as const) {
      for (const forbidden of [
        'SupabaseKnowledgeSourceReferenceReader',
        'listReferencesByTargetPadletIds',
        'knowledgeSourceReferenceIndex',
        'source_references',
      ]) {
        expect(source, `${name} must stay free of ${forbidden}`).not.toContain(forbidden);
      }
    }
    // The index exists but is not handed to UI yet -- that is F6-B2.
    expect(canvasClient).not.toContain('sourceReferences={');
    expect(canvasClient).not.toContain('sourceReferencesByPadletId={');
  });
});

// ============================================================================
// P6J-F6-B2 -- visible provenance and source navigation
// ============================================================================
describe('P6J-F6-B2 source marker and navigation wiring', () => {
  it('A: CanvasClient is still the only owner of the reference index', () => {
    // The provider carries the owner's values; it never holds state of its own.
    // B3 added the derived `backlinks` prop to this same tag -- still one owner.
    expect(canvasClient).toContain(
      '<KnowledgeSourceReferenceProvider index={sourceReferencesByPadletId} backlinks={knowledgeSourceBacklinkIndex}>',
    );
    expect(referenceContext).not.toContain('useState');
    expect(referenceContext).not.toContain('listReferencesByTargetPadletIds');
  });

  it('B: the provider is read-only and reaches no data layer', () => {
    for (const forbidden of ['fetch(', '@supabase', 'supabaseBrowser', 'getSupabaseAdmin', 'createClient(']) {
      expect(referenceContext).not.toContain(forbidden);
    }
    // Reuses the existing domain accessor rather than re-deriving buckets.
    expect(referenceContext).toContain('knowledgeSourceReferencesFor(index, padletId)');
  });

  it('C: PostCardContent reads the context and performs no read of its own', () => {
    expect(postCardContent).toContain('useKnowledgeSourceReferencesForPadlet(padletId)');
    expect(postCardContent).toContain('knowledgeSourceCardLabel(references)');
    for (const forbidden of ['fetch(', '@supabase', 'listReferencesByTargetPadletIds', 'source_references']) {
      expect(postCardContent).not.toContain(forbidden);
    }
  });

  it('D: the card marker is non-interactive', () => {
    const marker = after(postCardContent, 'function KnowledgeSourceMarker(', 900);

    expect(marker).toContain('data-knowledge-source-marker="true"');
    // No click surface of any kind: the clickable affordance is the editor's.
    for (const forbidden of ['onClick', 'onPointerDown', 'onMouseDown', '<button', '<a ', 'pointer-events-auto', 'role="button"']) {
      expect(marker).not.toContain(forbidden);
    }
  });

  it('E: the marker renders inside the untouched pointer-events-none wrapper', () => {
    const branch = after(postCardContent, '<div className="select-none pointer-events-none">', 1200);
    const wrapper = branch.indexOf('<div className="select-none pointer-events-none">');
    const marker = branch.indexOf('<KnowledgeSourceMarker padletId={padlet.id} />');

    // The drag-critical wrapper still exists and still encloses the marker.
    expect(wrapper).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(wrapper);
    expect(branch.slice(wrapper, marker)).not.toContain('pointer-events-auto');
  });

  it('E2: nothing renders when the Note has no references', () => {
    const marker = after(postCardContent, 'function KnowledgeSourceMarker(', 900);

    // A failed reference read yields an empty index, so this is also the
    // read-failure behaviour: no marker, no error.
    expect(marker).toContain('if (label === null) return null;');
  });

  it('F: CanvasModals resolves the edited Note references, excluding a new Note', () => {
    const resolve = after(canvasModals, 'const noteSourceReferences = useKnowledgeSourceReferencesForPadlet(', 320);

    expect(resolve).toContain("padletToEdit?.id && padletToEdit.id !== 'new' ? String(padletToEdit.id) : null");
    expect(canvasModals).toContain('sourceReferences={noteSourceReferences}');
    expect(canvasModals).toContain('onOpenSourceReference={onOpenSourceReference}');
  });

  it('G: NoteEditor is presentational -- it never reads or writes provenance', () => {
    expect(noteEditor).toContain('sourceReferences?: readonly SourceReference[];');
    expect(noteEditor).toContain('onOpenSourceReference?: (reference: SourceReference) => void;');
    for (const forbidden of ['fetch(', '@supabase', 'supabaseBrowser', 'source_references', 'listReferencesByTargetPadletId']) {
      expect(noteEditor).not.toContain(forbidden);
    }
  });

  it('G2: a source click only requests navigation', () => {
    const control = after(noteEditor, 'data-knowledge-source-control="true"', 700);

    expect(control).toContain('onOpenSourceReference?.(reference)');
    // Never a save, a content change, or a close.
    for (const forbidden of ['onSave', 'setTitle', 'setContent', 'onClose', 'handleSaveAndClose']) {
      expect(control).not.toContain(forbidden);
    }
  });

  it('G3: multiple references render one control each, keyed by reference id', () => {
    const list = after(noteEditor, '{sourceReferences.length > 0 && (', 1400);

    expect(list).toContain('sourceReferences.map((reference, index) =>');
    // Row identity is the row id, so two citations of one document stay apart.
    expect(list).toContain('key={reference.id}');
    expect(list).toContain('knowledgeSourceEditorLabel(reference, index, sourceReferences.length)');
  });

  it('H: a source click becomes a request carrying document id and page range', () => {
    const request = after(canvasClient, 'const requestKnowledgeSourceOpen = useCallback(', 520);

    expect(request).toContain('buildKnowledgeSourceOpenRequest(knowledgeSourceRequestIdRef.current, reference)');
    expect(canvasClient).toContain('onOpenSourceReference={requestKnowledgeSourceOpen}');
  });

  it('I: every click mints a new request id so the same source can reopen', () => {
    const request = after(canvasClient, 'const requestKnowledgeSourceOpen = useCallback(', 520);
    const bump = request.indexOf('knowledgeSourceRequestIdRef.current += 1;');
    const build = request.indexOf('buildKnowledgeSourceOpenRequest(');

    expect(bump).toBeGreaterThan(-1);
    // Advanced before the request is built, so no two requests share an id.
    expect(build).toBeGreaterThan(bump);
  });

  it('J: a request is refused and cleared outside the current board/auth scope', () => {
    const request = after(canvasClient, 'const requestKnowledgeSourceOpen = useCallback(', 520);

    expect(request).toContain('if (!sourceReferenceScopeKey) return;');
    // The same hardened scope signal B1H clears the index on.
    expect(canvasClient).toContain('setKnowledgeSourceOpenRequest(null);');
    const clear = after(canvasClient, 'setKnowledgeSourceOpenRequest(null);', 120);
    expect(clear).toContain('}, [sourceReferenceScopeKey]);');
  });

  it('K: CanvasSidebar still owns knowledgeOpen', () => {
    expect(canvasSidebar).toContain('const [knowledgeOpen, setKnowledgeOpen] = useState(false);');
    // The normal trigger is untouched; the request only opens the same modal.
    expect(canvasSidebar).toContain('onClick={() => setKnowledgeOpen(true)}');
    expect(canvasSidebar).toContain('if (knowledgeSourceOpenRequest) setKnowledgeOpen(true);');
    expect(canvasClient).not.toContain('const [knowledgeOpen');
  });

  it('L: the reader opens by document id, once per request id', () => {
    // B4-B4 widened this call with the exact-arrival target; the document id
    // and page remain the first two arguments and the latch below is untouched.
    expect(documentsList).toContain('openDetailsByDocumentId(sourceOpenRequest.sourceDocumentId, sourceOpenRequest.pageStart, {');
    expect(documentsList).toContain('const known = entries.find((candidate) => candidate.id === documentId)');
    // Handled-once latch, so a manual reopen never replays a stale request.
    expect(documentsList).toContain('if (handledSourceRequestRef.current === sourceOpenRequest.requestId) return;');
    expect(documentsList).not.toMatch(/find\([^)]*originalFilename/);
  });

  /**
   * B4-B4 partially expires this test's B2 wording. The reader may now receive
   * the CITING ROW ID as well as the page -- that is a name, resolvable only
   * through the segments the reader already derives. What stays forbidden is
   * navigation authority in the form of coordinates or geometry: handed those,
   * the reader would scroll to stale numbers instead of the span B4-B1 decided
   * on, and would honour a citation the resolver refuses.
   */
  it('M: the reader receives the page and the citing row id, and no coordinate', () => {
    expect(documentsList).toContain('initialPageNumber={details.initialPageNumber}');
    expect(documentDetails).toContain('initialPageNumber?: number;');
    expect(documentDetails).toContain('data-page-number={page.pageNumber}');

    // The hint is forwarded, and it is a row id plus the repeat-intent id.
    expect(documentsList).toContain('initialSourceReferenceId={details.sourceTarget?.referenceId}');
    expect(documentsList).toContain('initialSourceRequestId={details.sourceTarget?.requestId}');
    expect(documentDetails).toContain('initialSourceReferenceId?: string;');
    expect(documentDetails).toContain('initialSourceRequestId?: number;');

    // The request type itself carries the five fields and nothing finer.
    const navigation = sourceOf('lib/domain/knowledge/knowledgeSourceNavigation.ts');
    const request = after(navigation, 'export interface KnowledgeSourceOpenRequest {', 320);
    expect(Array.from(request.matchAll(/readonly (\w+)/g)).map((match) => match[1]))
      .toEqual(['requestId', 'sourceDocumentId', 'sourceReferenceId', 'pageStart', 'pageEnd']);
    for (const forbidden of ['charStart', 'charEnd', 'quoteText', 'quoteHash', 'locator', 'bbox', 'targetPadletId']) {
      expect(navigation, `${forbidden} is navigation authority, not a hint`).not.toContain(forbidden);
    }
    // B4-B2B added exact-span CAPTURE here, so char offsets are now legitimate
    // in this file. Geometry and server-owned fields still are not.
    for (const forbidden of ['locator', 'bbox', 'quoteHash', 'quoteText']) {
      expect(documentDetails).not.toContain(forbidden);
    }
    // This prohibition did NOT expire at B4-B3; it changed meaning from "not
    // yet" to "not here". The reader now renders persisted spans, but it never
    // resolves them itself -- it delegates to the pure domain module, which is
    // the only consumer of the B4-B1 resolver. Keeping the guard pins that
    // layering; deleting it would have retired real protection for nothing.
    for (const forbidden of ['knowledgeSourceSpanResolver', 'resolveKnowledgeSourceSpan', 'useKnowledgeSourceReferencesForPadlet']) {
      expect(documentDetails, forbidden).not.toContain(forbidden);
    }
  });

  it('M2: B4-B3 highlight rendering is a pure read of the index already in memory', () => {
    // The reader projects the existing context and derives spans through the
    // pure module. Both are in-memory: nothing here can load or store.
    expect(documentDetails).toContain('useKnowledgeSourceReferencesForDocument(documentId)');
    expect(documentDetails).toContain('knowledgeSourceHighlightSegments(documentSourceReferences, page.pageNumber, page.text)');
    expect(documentDetails).toContain('data-knowledge-source-highlight');
    for (const forbidden of ['fetch(', 'supabase', 'createClient', '/api/', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']) {
      expect(documentDetails, forbidden).not.toContain(forbidden);
    }

    // The projection is a memo over the EXISTING context, not a second context
    // and not new state. Two contexts existed before B4-B3; there are still two.
    expect(referenceContext).toContain('export function useKnowledgeSourceReferencesForDocument');
    expect(referenceContext).toContain('useContext(KnowledgeSourceReferenceContext)');
    expect((referenceContext.match(/createContext</g) ?? []).length).toBe(2);
    for (const forbidden of ['fetch(', 'supabase', 'useState', 'useEffect', '.insert(', '.update(']) {
      expect(referenceContext, forbidden).not.toContain(forbidden);
    }

    // Resolver consumption lives in the pure module, and only there.
    const highlights = sourceOf('lib/domain/knowledge/knowledgeSourceHighlights.ts');
    expect(highlights).toContain("from './knowledgeSourceSpanResolver'");
    for (const forbidden of ['react', 'fetch(', 'supabase', 'locator', 'bbox']) {
      expect(highlights.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });

  it('N: the scheduler is untouched and gains no marker', () => {
    const scheduler = sourceOf('components/canvas/StandaloneSchedulerCanvas.tsx');

    for (const forbidden of ['KnowledgeSourceMarker', 'useKnowledgeSourceReferencesForPadlet', 'knowledgeSourceCardLabel']) {
      expect(scheduler).not.toContain(forbidden);
    }
  });

  it('O: no source -> Note navigation was added anywhere', () => {
    for (const source of [canvasClient, noteEditor, documentsList, documentDetails, referenceContext]) {
      // 'Used in Notes' moved to the B3 suite below: it is now expected in the
      // reader, and forbidden everywhere else. Navigation stays forbidden in
      // all five until B3N.
      for (const forbidden of ['listReferencesBySourceDocumentId', 'scrollToPadlet', 'centerOnPadlet']) {
        expect(source).not.toContain(forbidden);
      }
    }
    // openPadlet stays exactly the pre-existing share-link path (?openPadlet=id),
    // untouched by B2 and never repurposed as a source backlink.
    expect(canvasClient).toContain('if (!openPadletId || openPadletHandledRef.current || padlets.length === 0) return;');
    expect(canvasClient).not.toContain('openPadletId={');
  });

  it('P: provenance still never reaches a padlet row or its metadata', () => {
    const request = after(canvasClient, 'const requestKnowledgeSourceOpen = useCallback(', 520);

    for (const forbidden of ['setPadlets(', 'metadata:', 'updatePadletById']) {
      expect(request).not.toContain(forbidden);
    }
    for (const source of [postCardContent, noteEditor, referenceContext]) {
      expect(source).not.toContain('sourceReferences:');
    }
  });

  it('Q: B2 introduces no elevated authority and no new endpoint', () => {
    for (const source of [postCardContent, noteEditor, canvasModals, canvasSidebar, referenceContext]) {
      for (const forbidden of ['getSupabaseAdmin', 'service_role', 'SERVICE_ROLE', '@supabase/']) {
        expect(source).not.toContain(forbidden);
      }
    }
    // The reader still speaks only to the endpoints it already used.
    expect((documentsList.match(/fetch\(/g) ?? []).length).toBe(4);
  });
});

// ============================================================================
// P6J-F6-B3 -- reverse provenance ("Used in Notes"), DISPLAY ONLY
// ============================================================================
describe('P6J-F6-B3 used-in-notes wiring', () => {
  const backlinks = sourceOf('lib/domain/knowledge/knowledgeSourceBacklinks.ts');

  it('K: the reverse view is derived in memory, with no new read of any kind', () => {
    const derivation = after(canvasClient, 'const knowledgeSourceBacklinkIndex = useMemo(', 420);

    // Built from the two things CanvasClient already holds -- nothing fetched.
    expect(derivation).toContain('buildKnowledgeSourceBacklinkIndex(');
    expect(derivation).toContain('Array.from(sourceReferencesByPadletId.values()).flat()');
    expect(derivation).toContain('[sourceReferencesByPadletId, padlets],');
    for (const forbidden of ['fetch(', 'await ', 'reader.', 'supabase']) {
      expect(derivation, `derivation must stay free of ${forbidden}`).not.toContain(forbidden);
    }
  });

  // B3H: the backlink useMemo originally sat below CanvasClient's early
  // returns, so the loading render ran one fewer hook than the loaded render
  // and React aborted every board with "Rendered more hooks than during the
  // previous render". Ordering is the invariant, so ordering is what is pinned.
  it('K1b: derives Knowledge backlinks before CanvasClient early returns so hook order is stable across loading transitions', () => {
    const hook = canvasClient.indexOf('const knowledgeSourceBacklinkIndex = useMemo(');
    expect(hook, 'backlink useMemo not found in CanvasClient').toBeGreaterThanOrEqual(0);

    // Every conditional return that can end a render before the hooks below it.
    for (const earlyReturn of [
      'if (!hasMounted || loading)',
      'if (!canvasId) return <div',
      'if (error || !canvas) return <div',
    ]) {
      const guard = canvasClient.indexOf(earlyReturn);
      expect(guard, `early return not found: ${earlyReturn}`).toBeGreaterThanOrEqual(0);
      expect(hook, `backlink hook must precede \`${earlyReturn}\``).toBeLessThan(guard);
    }

    // One unconditional call site: a second copy would reintroduce the
    // imbalance this guard exists to prevent.
    expect((canvasClient.match(/const knowledgeSourceBacklinkIndex = useMemo\(/g) ?? []).length).toBe(1);
  });

  it('K2: no document-keyed or page-keyed server capability was introduced', () => {
    for (const source of [canvasClient, documentsList, documentDetails, referenceContext, backlinks]) {
      for (const forbidden of [
        'listReferencesBySourceDocumentId',
        'listReferencesByDocument',
        'knowledge/references?',
        "from('source_references')",
        'getSupabaseAdmin',
        'service_role',
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
    // The reader's endpoint count is unchanged from B2.
    expect((documentsList.match(/fetch\(/g) ?? []).length).toBe(4);
    // And the reader still performs no read of its own for backlinks.
    expect(documentDetails).not.toContain('fetch(');
    expect(documentDetails).toContain('useKnowledgeSourceBacklinksForDocument(documentId)');
  });

  it('K3: the domain helper is pure -- no React, no network, no persistence', () => {
    for (const forbidden of ['react', 'useMemo', 'fetch(', '@supabase', 'localStorage', 'document.']) {
      expect(backlinks, `backlinks helper must stay free of ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the context extension stays inert and stores nothing of its own', () => {
    expect(referenceContext).toContain('useKnowledgeSourceBacklinksForDocument');
    for (const forbidden of ['useState', 'useEffect', 'fetch(', '@supabase', 'supabaseBrowser']) {
      expect(referenceContext).not.toContain(forbidden);
    }
  });

  it('Notes are identified by the canonical padlet type, never by rendered text', () => {
    expect(backlinks).toContain("KNOWLEDGE_BACKLINK_NOTE_TYPES: readonly string[] = ['note', 'text']");
    // Type is the only classifier: no heuristic on what a card happens to show.
    for (const forbidden of ['innerText', 'textContent', 'metadata', 'file_url']) {
      expect(backlinks).not.toContain(forbidden);
    }
  });

  // B3N retired B3's display-only prohibition: the rows are controls now. What
  // survives from B3 is the property that actually mattered underneath it --
  // the row is addressed by padlet id, and the visible text addresses nothing.
  it('L: a backlink row is a real button that emits the target id, not its text', () => {
    const marker = after(documentDetails, 'function UsedInNotes(', 1400);

    expect(marker).toContain('data-knowledge-used-in-notes={scope}');
    // Identity still rides on the row itself, independent of what it renders.
    expect(marker).toContain('data-knowledge-backlink-target={row.targetPadletId}');
    // A real control, not a div wearing a click handler.
    expect(marker).toContain('<button');
    expect(marker).toContain('type="button"');
    // The id is what travels. `displayText` is presentation and must never be
    // the argument -- two Notes can render identical text.
    expect(marker).toContain('onOpen(row.targetPadletId)');
    expect(marker, 'the row must not emit its visible text').not.toContain('onOpen(row.displayText)');
    expect(marker).not.toContain('onOpen(row.label)');
    // Interaction stays inside the mounted canvas: no URL navigation, ever.
    for (const forbidden of ['<a ', 'href', 'router.', 'openPadlet=']) {
      expect(marker, `backlink row must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('L2: only CanvasClient resolves a backlink target; every other layer forwards it', () => {
    // The reader emits an id, the list closes and forwards, the context and the
    // domain helper stay out of it entirely. None of them may navigate.
    for (const source of [documentDetails, documentsList, referenceContext, backlinks]) {
      for (const forbidden of [
        'setSelectedPadletId',
        'openPadletInTypeEditor',
        'openPadlet=',
        'scrollIntoView(',
        'querySelector(\'[data-padlet',
        'padlets.find',
      ]) {
        expect(source, `${forbidden} belongs to CanvasClient, not this layer`).not.toContain(forbidden);
      }
    }

    // The list closes Knowledge BEFORE handing the target on: the reader is a
    // modal over the board, so the Note must not open behind it.
    const forward = after(documentsList, 'onOpenBacklinkTarget={onOpenBacklinkTarget', 400);
    expect(forward.indexOf('closeSurface();'), 'closeSurface() missing from the forward')
      .toBeGreaterThanOrEqual(0);
    expect(forward.indexOf('closeSurface();'))
      .toBeLessThan(forward.indexOf('onOpenBacklinkTarget(targetPadletId);'));

    // CanvasSidebar is plumbing: it forwards the callback and owns nothing.
    expect(canvasSidebar).toContain('onOpenBacklinkTarget={onOpenBacklinkTarget}');
    for (const forbidden of [
      'padlets.find', 'setSelectedPadletId', 'openPadletInTypeEditor', 'useState<string',
    ]) {
      expect(canvasSidebar, `CanvasSidebar must not ${forbidden}`).not.toContain(forbidden);
    }
    // And it still renders none of the backlink UI itself.
    expect(canvasSidebar).not.toContain('UsedInNotes');
  });

  // B3N's navigation handler: the four things that make the click safe.
  it('L4: CanvasClient resolves by id, fails closed, and reuses the existing editor', () => {
    const handler = after(canvasClient, 'const openKnowledgeBacklinkTarget = (targetPadletId: string) => {', 500);

    // Resolved against the board already loaded -- never fetched, never by name.
    expect(handler).toContain('padlets.find((padlet) => padlet.id === targetPadletId)');
    // A vanished target and a non-Note target both stop here.
    expect(handler).toContain('if (!target || !isKnowledgeBacklinkNote(target)) return;');
    // Then the pre-existing primitives, unchanged.
    expect(handler).toContain('setSelectedPadletId(target.id);');
    expect(handler).toContain('openPadletInTypeEditor(target);');

    for (const forbidden of [
      'fetch(', 'supabase', 'await ', 'setPadlets(', 'updatePadletById',
      'scrollIntoView', 'querySelector', 'router.', 'openPadlet=', '.title', '.label',
    ]) {
      expect(handler, `B3N navigation must stay free of ${forbidden}`).not.toContain(forbidden);
    }
    // Not a hook. B3's outage came from adding one below the early returns, and
    // this deliberately needs none.
    for (const hook of ['useMemo', 'useCallback', 'useEffect', 'useState']) {
      expect(handler, `the handler must not be or call ${hook}`).not.toContain(hook);
    }
  });

  it('L3: only the reader renders the backlink UI', () => {
    expect(documentDetails).toContain('Used in Notes');
    for (const source of [canvasClient, noteEditor, documentsList, canvasModals, canvasSidebar, postCardContent]) {
      expect(source).not.toContain('Used in Notes');
    }
  });

  it('provenance still never reaches a padlet row, and B2 markers are untouched', () => {
    const derivation = after(canvasClient, 'const knowledgeSourceBacklinkIndex = useMemo(', 420);

    for (const forbidden of ['setPadlets(', 'updatePadletById', 'metadata:']) {
      expect(derivation).not.toContain(forbidden);
    }
    // B2's forward marker and its single call site are unchanged.
    expect(postCardContent).toContain('export function KnowledgeSourceMarker({ padletId }: { padletId: string }) {');
    expect((canvasClient.match(/setSourceReferencesByPadletId\(/g) ?? []).length).toBe(6);
  });
});

// ============================================================================
// P6J-F6-B4-B4 -- bidirectional exact source interactions
// ============================================================================

describe('P6J-F6-B4-B4 exact source interaction wiring', () => {
  it('CanvasClient is untouched: the pure request builder carried the whole change', () => {
    // The full SourceReference was already in scope at the call site, so adding
    // the row id to the request needed nothing here. If a hook, state or an
    // effect had been added for provenance, this would catch it.
    expect(canvasClient).toContain('buildKnowledgeSourceOpenRequest(knowledgeSourceRequestIdRef.current, reference)');
    for (const forbidden of [
      'sourceReferenceId', 'initialSourceReferenceId', 'initialSourceRequestId',
      'data-knowledge-source-navigation-target', 'data-knowledge-source-choice',
    ]) {
      expect(canvasClient, `${forbidden} belongs to the reader, not CanvasClient`).not.toContain(forbidden);
    }
    // B2's request state remains exactly one slot, with no companion added.
    expect((canvasClient.match(/useState<KnowledgeSourceOpenRequest \| null>/g) ?? []).length).toBe(1);
  });

  it('the reader still delegates span resolution and adds no data access', () => {
    // Unchanged layering: segments come from the pure module, which is the sole
    // consumer of B4-B1. Interaction rides on what it already returned.
    expect(documentDetails).toContain('knowledgeSourceHighlightSegments(documentSourceReferences, page.pageNumber, page.text)');
    for (const forbidden of [
      'knowledgeSourceSpanResolver', 'resolveKnowledgeSourceSpan',
      'fetch(', 'supabase', 'createClient', '.insert(', '.update(', '.upsert(', '.rpc(',
    ]) {
      expect(documentDetails, forbidden).not.toContain(forbidden);
    }
    // Still two Knowledge source contexts; interaction introduced no third.
    expect((referenceContext.match(/createContext</g) ?? []).length).toBe(2);
  });

  it('target identity comes from the resolved spans, never from the DOM count attribute', () => {
    // The attribute survives for display and tests, and is emitted exactly
    // where B4-B3 put it -- but nothing READS it back to decide a destination.
    expect(documentDetails).toContain('data-knowledge-source-highlight-count={segment.spans.length}');
    for (const forbidden of [
      'dataset.knowledgeSourceHighlightCount',
      "getAttribute('data-knowledge-source-highlight-count')",
      'getAttribute("data-knowledge-source-highlight-count")',
    ]) {
      expect(documentDetails, `routing must not read ${forbidden}`).not.toContain(forbidden);
    }
    // Targets are derived from the segment's own spans.
    expect(documentDetails).toContain('eligibleTargetsOf(segment, interaction.eligibleTargets)');
    expect(documentDetails).toContain('for (const span of segment.spans) {');
  });

  it('a search match stays atomic and gains no source-navigation semantics', () => {
    // Anchored on the element's own key, NOT on the string '<mark': the
    // renderer's comment mentions "<mark>" first, and anchoring there windows
    // over prose instead of the JSX -- a guard that can never fail.
    const markKey = documentDetails.indexOf('key={`match-${match.start}`}');
    expect(markKey).toBeGreaterThan(-1);
    const mark = documentDetails.slice(markKey, markKey + 620);
    for (const forbidden of ['role=', 'tabIndex', 'onKeyDown', 'onClick']) {
      expect(mark, `a search match must not gain ${forbidden}`).not.toContain(forbidden);
    }
    // The whole match remains ONE element: its count is an aggregate, so a
    // click on it could not be attributed to any particular citation.
    expect(documentDetails).toContain('data-knowledge-source-highlight-count={sources > 0 ? sources : undefined}');
  });

  it('native text selection is never blocked, only used to suppress navigation', () => {
    expect(documentDetails).toContain('if (selection && !selection.isCollapsed) return;');
    // Blocking mousedown would break B4-B2B's drag-select entirely: there is no
    // mousedown handler at all, so nothing can cancel a selection starting.
    expect(documentDetails).not.toContain('onMouseDown');
    // Exactly one preventDefault exists, and it is the keyboard one that stops
    // Space scrolling the reader -- never a pointer-path default.
    expect((documentDetails.match(/preventDefault\(\)/g) ?? []).length).toBe(1);
    const keyHandler = after(documentDetails, "if (event.key !== 'Enter' && event.key !== ' ') return;", 200);
    expect(keyHandler).toContain('event.preventDefault();');
  });

  it('the chooser lives outside every page text root and routes by padlet id', () => {
    const chooser = after(documentDetails, 'data-knowledge-source-choice="true"', 900);
    expect(chooser).toContain('data-knowledge-source-choice-target={targetPadletId}');
    expect(chooser).toContain('onOpenBacklinkTarget(targetPadletId)');
    // The label is presentation and must never be the argument.
    expect(chooser).not.toMatch(/onOpenBacklinkTarget\((?!targetPadletId\))/);
    // Rendered after the pages container closes, so it cannot be inside a root.
    const rootIndex = documentDetails.indexOf('{...{ [PAGE_TEXT_ROOT]: page.pageNumber }}');
    const chooserIndex = documentDetails.indexOf('data-knowledge-source-choice="true"');
    expect(chooserIndex).toBeGreaterThan(rootIndex);
    expect(documentDetails.slice(rootIndex, chooserIndex)).toContain('</section>');
  });

  it('highlight -> Note reuses the one existing canvas navigation callback', () => {
    // No second navigation system. Two direct invocations -- the single-target
    // highlight and the chooser -- plus the backlink rows, which still reach the
    // same prop through UsedInNotes' `onOpen`.
    expect((documentDetails.match(/onOpenBacklinkTarget\(/g) ?? []).length).toBe(2);
    expect(documentDetails).toContain('onOpen(row.targetPadletId)');
    expect(documentDetails).toContain('onOpen={onOpenBacklinkTarget}');
    for (const forbidden of ['onOpenPadlet', 'onOpenSourceTarget', 'onNavigateToNote']) {
      expect(documentDetails, forbidden).not.toContain(forbidden);
    }
    // The card marker itself stays display-only (the rest of PostCardContent
    // is full of unrelated controls, so this is scoped to the marker).
    const marker = after(postCardContent, 'export function KnowledgeSourceMarker(', 700);
    for (const forbidden of ['onClick', 'role="button"', 'tabIndex', '<button']) {
      expect(marker, `the card marker must not gain ${forbidden}`).not.toContain(forbidden);
    }
  });
});
