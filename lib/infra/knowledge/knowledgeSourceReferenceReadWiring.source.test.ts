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
