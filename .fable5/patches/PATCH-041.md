# PATCH-041 — hooks phase slice 4, strangler group 16: addFreeformCardPadlet onto the existing honest createPost under the program's FOURTH AUTHORIZED BEHAVIOR MICRO-CHANGE (thrown insert failures now roll the optimistic card back)

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4 acceptable** (Pattern K, sixteenth application — a single consumer swap of an already-pinned command; the authorized convergence is fully specified in §0.2; see §0.4)
**Pattern:** K reuse (§5.11), the THIRD ONE-FILE patch: zero domain changes, zero infra changes, zero test changes, zero new tests (fidelity net = the existing createPost pins + the suite re-run 214/25 green at authoring), zero import changes (both factories already imported since PATCH-040).
**Scope:** `components/collabboard/canvas/hooks/useCanvasData.ts` — **ONE file, ONE region.**
**Authored:** 2026-07-11 (Fable 5 CTO). Census regenerated at commit `bbbb0d9`; the CTO simulation applied the canonical file to the working tree and ran the REAL repo gates — `npx tsc --noEmit` CLEAN, `npm run check:boundaries` SILENT, `npx vitest run` **214 passed (214), 25 files** (unchanged — zero test changes) — then restored byte-exact via `git cat-file blob` (`w/lf` confirmed).

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. Phase B is the
> bound mechanical extractor in §3 (the PATCH-040 Amendment 1 procedure,
> now standard). §4's OLD/NEW pair is EXPLANATORY — do not hand-apply.
> Never edit a bound test; STOP and report instead (§8).

---

## 0. CTO rulings

### 0.1 The owner-delegated ruling: CONVERGENCE AUTHORIZED

The owner delegated the `addFreeformCardPadlet` decision (preserve the
split failure contract, or authorize convergence). **Ruling: AUTHORIZE
CONVERGENCE — the program's FOURTH behavior micro-change** (after 024,
032 Ruling 2 extended by 033, and 034).

The legacy split, verified against the live tree at `bbbb0d9`:

- RESOLVED insert error → the hook's own branch rolls the optimistic
  card back (`setPadlets(prev => prev.filter(...))`), silently.
- THROWN network error → the rejection escapes the hook, propagates
  through `handleFreeformCardDrop` (CanvasClient L4902–4930, which has
  NO catch), and lands in the JSX drop handler's catch at L6384
  (`console.error('❌ Failed to create card from SVG:', err)`) — the
  optimistic card is NEVER rolled back. The user sees a card that was
  never persisted; it silently evaporates on the next refetch/reload.

That stranded ghost card is dishonest UI and lost user work (P3) —
the same harm class 034's rollback convergence repaired on the position
family. The repair converges the thrown channel onto the EXISTING
resolved-error rollback branch: after this patch BOTH failure channels
behave exactly as the legacy resolved channel did (silent rollback, no
ghost).

Consumer analysis (exhaustive — ONE consumer): `handleFreeformCardDrop`
is invoked exactly once (CanvasClient L6381), inside the drop handler's
try/catch. Nothing chains on or branches by its rejection. Disclosed
consequences of the authorized change:

1. A thrown insert failure now rolls the optimistic card back.
2. The outer `'❌ Failed to create card from SVG'` catch NO LONGER
   fires for insert failures on this path (it still serves its other
   duties: JSON.parse errors and the drawing branch above it).
3. `handleFreeformCardDrop`'s promise now always resolves.

CanvasClient itself is NOT touched.

### 0.2 The port (confirm, don't re-justify)

Honest EXISTING `canvas.createPost` (029, pinned by 3 tests) +
`if (!result.ok) { rollback }` with NO rethrow: a resolved repository
error returns err('unavailable') → rollback (exact legacy resolved
behavior); a thrown network error is converted by defineCommand to
err('unknown', {cause}) → the SAME rollback branch (the authorized
convergence). The four-line AUTHORIZED CONVERGENCE comment lives at the
call site because the fact is call-site-specific (the seam command is
generic) — the 037 comment-placement doctrine.

Validation-channel note (029 acceptance, repeated): `newPadlet` is a
`Padlet`-typed object literal — `postRowSchema` (any non-null object)
cannot reject it; the row passes through verbatim, no timestamps added
(the command adds no fields).

### 0.3 Behavior preservation (everything except the authorized change)

- **Loading / retry / cache / realtime:** none exists at this site;
  none added; `markPadletLocallyModified` census 5→5 (this site never
  called it — the realtime INSERT dedup guard handles the echo);
  the channel untouched.
- **Fallback / rollback:** the rollback filter itself is BYTE-KEPT
  (same `prev.filter(p => p.id !== newPadlet.id)` statement) — only its
  guard changes from `if (error)` to `if (!result.ok)` per §0.2.
- **Ordering:** optimistic add (in CanvasClient, untouched) → insert →
  conditional rollback. Unchanged.
- **Everything else in the hook:** BYTE-UNTOUCHED — §5 census pins
  fetchData, the section-recovery cluster, all line sites, the three
  already-extracted sites (039/040), `updateDrawingLayoutPadlet`, and
  the four raw passthroughs.

### 0.4 Model + census effects

**GPT-5.4 acceptable**: single consumer swap of a pinned command; the
CTO compiled and ran the exact post-edit bytes in the working tree
(tsc clean, boundaries silent, 214/214 green — zero test changes),
then restored byte-exact. ZERO new casts, ZERO new tests, ZERO import
edits. Hook census: `.from('padlets')` 8→7 (CORRECTED 2026-07-11 at
review — authoring mis-stated this baseline as 7→6, an off-by-one
against the true pre-edit tree; the fence hash was never wrong and the
implementation is correct — see §1/§5.1 and CTO review record); see §5
for the exact bound numbers (`.from(` 16, `supabase` 22). Hook 634→639 (+5: the
four-line authorized-convergence comment + one statement line — under
the 800 ceiling). Grandfather stays 2. Remaining after this patch:
Family 5 remainder = `updateDrawingLayoutPadlet` + the 4 raw
passthroughs; Families 1/2/4; FreeformGraphRepo; FreeformPadletCards
LAST; realtime CTO-only.

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # bbbb0d9 (or a descendant touching none of the scoped/must-not-change files)
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts   # 2cd6f9c71261804b6bf94c9eb0e536864df44e1f
```

MUST-NOT-CHANGE hashes (re-checked after the edit in §5):

```bash
git hash-object lib/domain/canvas/posts.ts                                      # fdc5fd153b5a4689a29c086652fc9411f9074b09
git hash-object lib/domain/canvas/posts.test.ts                                 # affd371dacd6607be415304f981ec938d6fb6be8
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 57a56ef8595c8ebc4b655a1fd811904049bbd155
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts           # cff23229dcbeb76a93d46d75b6b13a6aa351f07a
```

Hook census (measured 2026-07-11):

```bash
H="components/collabboard/canvas/hooks/useCanvasData.ts"
wc -l "$H"                                # 634
grep -c '^[[:space:]]*$' "$H"             # 78
grep -c "\.from('padlets')" "$H"          # 8   (CORRECTED at review from a stale 7 - authoring off-by-one, fence hash unaffected)
grep -c "\.from(" "$H"                    # 17
grep -c "supabase" "$H"                   # 23
grep -c "markPadletLocallyModified" "$H"  # 5
grep -c "createCreatePostCommand" "$H"    # 2
grep -c "createPostsRepository" "$H"      # 5
grep -c "userId: null" "$H"               # 4
grep -c "addFreeformCardPadlet" "$H"      # 2
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 25 files, 214 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE — `components/collabboard/canvas/hooks/useCanvasData.ts` (whole file, exact, 639 lines; post-edit hash `96671b64cbcd63704bb64dd781f33b6c07b618f3`)

Replace the file with exactly:

```ts
"use client";

/**
 * useCanvasData — owns canvas entity data state + all supabase CRUD for
 * canvas, padlets, lines, and sections (PR5 scope).
 *
 * Auth supabase calls (workspace_members, supabase.auth) intentionally
 * remain in CanvasClient — they are session-scoped, not canvas-data-scoped.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import {
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import type { Canvas, Padlet, CanvasLine, BoardSection } from '@/types/collabboard';
import { generateAndSaveThumbnail, updateLastVisited } from '@/lib/collabboard/thumbnailGenerator';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import { toast } from 'sonner';
import type { CanvasAction } from '../store/actions';

interface UseCanvasDataParams {
  canvasId?: string;
  dispatch: React.Dispatch<CanvasAction>;
}

export function useCanvasData({ canvasId, dispatch }: UseCanvasDataParams) {
  // Cookie-authenticated client — must match the session the dashboard/rest of
  // the app uses, or RLS-gated queries silently return zero rows (see
  // lib/supabase/browser.ts vs lib/supabase.ts).
  const supabase = supabaseBrowser();
  // ── Data state ──────────────────────────────────────────────────────────────
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [padlets, setPadlets] = useState<Padlet[]>([]);
  const [lines, setLines] = useState<CanvasLine[]>([]);
  const [sections, setSections] = useState<BoardSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  // Track IDs of padlets we've just modified locally, to skip redundant refetch from realtime
  const locallyModifiedPadletsRef = useRef<Set<string>>(new Set());
  // Track IDs of lines we've just modified locally
  const locallyModifiedLinesRef = useRef<Set<string>>(new Set());
  // Track padlets for thumbnail generation on cleanup
  const padletsRef = useRef<Padlet[]>([]);

  // Keep padletsRef in sync with padlets state
  useEffect(() => {
    padletsRef.current = padlets;
  }, [padlets]);

  // ── fetchData ───────────────────────────────────────────────────────────────
  // === BEGIN DATA REGION: SUPABASE + REALTIME ===
  const fetchData = useCallback(async (showLoading = false) => {
    if (!canvasId) {
      setError("Missing canvas ID");
      if (showLoading) setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const { data: canvasData, error: canvasError } = await supabase
        .from('boards')
        .select('*')
        .eq('id', canvasId)
        .maybeSingle();

      const { data: padletData, error: padletError } = await supabase
        .from('padlets')
        .select('*')
        .eq('board_id', canvasId);

      // Fetch lines (may not exist yet - graceful fallback)
      const { data: lineData, error: lineError } = await supabase
        .from('canvas_lines')
        .select('*')
        .eq('board_id', canvasId);

      // Fetch sections for columns layout
      const { data: sectionData, error: sectionError } = await supabase
        .from('board_sections')
        .select('*')
        .eq('board_id', canvasId);

      if (canvasError) {
        console.error('Error fetching canvas:', canvasError);
        throw canvasError;
      }
      if (padletError) {
        console.error('Error fetching padlets:', padletError);
        throw padletError;
      }
      // Don't throw on lineError - table may not exist yet

      setCanvas(canvasData);

      let nextSections = sectionData || [];
      let nextPadlets = padletData || [];

      const shouldRecoverMissingSections =
        (canvasData?.layout === 'grid' || canvasData?.layout === 'columns') &&
        nextPadlets.length > 0;

      if (shouldRecoverMissingSections) {
        const existingSectionIds = new Set(nextSections.map((section) => String(section.id)));
        const missingSectionIds = Array.from(
          new Set(
            nextPadlets
              .map((padlet) => (padlet.metadata as any)?.sectionId)
              .filter((sectionId): sectionId is string => !!sectionId && !existingSectionIds.has(String(sectionId)))
          )
        );

        if (missingSectionIds.length > 0) {
          const maxPosition = nextSections.reduce(
            (max, section) => Math.max(max, Number(section.position) || 0),
            -1
          );

          try {
            const recoveryPayload = missingSectionIds.map((_, index) => ({
              board_id: canvasId,
              title: `Recovered Section ${index + 1}`,
              description: '',
              position: maxPosition + index + 1,
            }));

            const { data: recoveredSections, error: recoveryError } = await supabase
              .from('board_sections')
              .insert(recoveryPayload)
              .select('*');

            if (recoveryError) throw recoveryError;

            const remap = new Map<string, string>();
            (recoveredSections || []).forEach((section, index) => {
              const oldId = missingSectionIds[index];
              if (oldId) remap.set(oldId, String(section.id));
            });

            await Promise.all(
              nextPadlets
                .filter((padlet) => remap.has(String((padlet.metadata as any)?.sectionId)))
                .map((padlet) => {
                  const oldSectionId = String((padlet.metadata as any)?.sectionId);
                  const nextSectionId = remap.get(oldSectionId);
                  if (!nextSectionId) return Promise.resolve();
                  return supabase
                    .from('padlets')
                    .update({
                      metadata: {
                        ...(padlet.metadata as any),
                        sectionId: nextSectionId,
                      },
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', padlet.id);
                })
            );

            nextSections = [...nextSections, ...((recoveredSections as BoardSection[]) || [])];
            nextPadlets = nextPadlets.map((padlet) => {
              const oldSectionId = String((padlet.metadata as any)?.sectionId || '');
              const nextSectionId = remap.get(oldSectionId);
              if (!nextSectionId) return padlet;
              return {
                ...padlet,
                metadata: {
                  ...(padlet.metadata as any),
                  sectionId: nextSectionId,
                },
              };
            });

            toast.warning('Recovered missing row/grid sections for this canvas.');
          } catch (recoveryError) {
            console.error('Failed to recover missing sections:', recoveryError);

            const syntheticSections = missingSectionIds.map((oldId, index) => ({
              id: Number(oldId) || -(index + 1),
              board_id: canvasId,
              title: `Recovered Section ${index + 1}`,
              description: '',
              position: maxPosition + index + 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })) as unknown as BoardSection[];

            nextSections = [...nextSections, ...syntheticSections];
          }
        }
      }

      setSections(nextSections);
      if (nextPadlets.length > 0) {
        // Filter out empty note/text padlets
        const validPadlets = nextPadlets.filter(p => {
          if (p.type === 'note' || p.type === 'text') {
            // Robust check: strip HTML tags, HTML entities like &nbsp;, and whitespace
            const strippedContent = p.content
              ? p.content
                .replace(/<[^>]*>/g, '') // Remove tags
                .replace(/&nbsp;/g, ' ') // Replace non-breaking space with space
                .replace(/&#160;/g, ' ') // Replace code for nbsp
                .trim()
              : '';
            const hasContent = strippedContent.length > 0;
            return hasContent;
          }
          return true;
        });
        setPadlets(validPadlets);
      } else {
        setPadlets([]);
      }
      // Normalize: rows written before the layer_plane column existed arrive as null.
      // Treat them as 'front' at runtime; the DB default handles new inserts.
      setLines((lineData || []).map(l => ({
        ...l,
        layer_plane: l.layer_plane ?? 'front',
      })));
    } catch (e) {
      console.error('fetchData failed:', e);
      setError('Failed to load canvas.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [canvasId]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  const handleRealtimePadletChange = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const padletId = newRecord?.id || oldRecord?.id;
    debugCanvasLogger('realtimeUpdate', { eventType, padletId });

    // Skip if this was a local modification (we already have the update)
    if (padletId && locallyModifiedPadletsRef.current.has(padletId)) {
      locallyModifiedPadletsRef.current.delete(padletId);
      return;
    }

    if (eventType === 'INSERT' && newRecord) {
      setPadlets(prev => {
        if (prev.some(p => p.id === newRecord.id)) return prev;
        return [...prev, newRecord as Padlet];
      });
    } else if (eventType === 'UPDATE' && newRecord) {
      setPadlets(prev => prev.map(p =>
        p.id === newRecord.id ? { ...p, ...newRecord } : p
      ));
    } else if (eventType === 'DELETE' && oldRecord) {
      setPadlets(prev => prev.filter(p => p.id !== oldRecord.id));
    }
  }, []);

  useEffect(() => {
    if (!canvasId) return;
    fetchData(true);

    // Update last visited timestamp
    updateLastVisited(canvasId);

    const channel = supabase.channel(`canvas-${canvasId}`);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'padlets',
          filter: `board_id=eq.${canvasId}`
        },
        handleRealtimePadletChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);

      // Generate and save thumbnail when leaving the canvas
      // Using the ref to get current padlets without causing re-runs
      const currentPadlets = padletsRef.current;
      if (canvasId && currentPadlets.length > 0) {
        generateAndSaveThumbnail(canvasId, currentPadlets.map(p => ({
          id: p.id,
          position_x: p.position_x || 0,
          position_y: p.position_y || 0,
          width: p.width || 200,
          height: p.height || 150,
          type: p.type,
          title: p.title,
          content: p.content,
          metadata: p.metadata as any
        })));
      }
    };
  }, [canvasId, handleRealtimePadletChange, fetchData]);

  /* -------------------------------------------------------------------------- */
  /*                                Optimized Update                               */
  /* -------------------------------------------------------------------------- */

  // Helper to mark a padlet as locally modified (skips redundant realtime refetch)
  const markPadletLocallyModified = useCallback((padletId: string) => {
    locallyModifiedPadletsRef.current.add(padletId);
    // Auto-clear after a short window (in case realtime event never arrives)
    setTimeout(() => {
      locallyModifiedPadletsRef.current.delete(padletId);
    }, 3000);
  }, []);

  // Helper to mark a line as locally modified
  const markLineLocallyModified = useCallback((lineId: string) => {
    locallyModifiedLinesRef.current.add(lineId);
    setTimeout(() => {
      locallyModifiedLinesRef.current.delete(lineId);
    }, 3000);
  }, []);
  // === END DATA REGION: SUPABASE + REALTIME ===

  // ── Line CRUD ───────────────────────────────────────────────────────────────

  // Fast local-only update (no DB call) - used during dragging
  const updateLineLocal = useCallback((lineId: string, updates: Partial<CanvasLine>) => {
    setLines(prev => prev.map(l =>
      l.id === lineId
        ? { ...l, ...updates }
        : l
    ));
  }, []);

  // Save line to database - called when drag ends
  const saveLineToDb = useCallback(async (lineId: string) => {
    if (lineId.startsWith('temp-')) return;

    const line = lines.find(l => l.id === lineId);
    if (!line) return;

    debugCanvasLogger('saveStart', { op: 'saveLineToDb', lineId });
    try {
      const { error } = await supabase
        .from('canvas_lines')
        .update({
          start_x: line.start_x,
          start_y: line.start_y,
          control_x: line.control_x,
          control_y: line.control_y,
          end_x: line.end_x,
          end_y: line.end_y,
          points: line.points, // PERSIST POINTS
          start_post_id: line.start_post_id,
          end_post_id: line.end_post_id,
          // Styling and Label
          color: line.color,
          stroke_width: line.stroke_width,
          dashed: line.dashed,
          start_arrow: line.start_arrow,
          end_arrow: line.end_arrow,
          label: line.label,
          label_position: line.label_position,
          z_index: line.z_index,
          layer_plane: line.layer_plane ?? 'front',
          label_text_color: line.label_text_color,
          label_background_color: line.label_background_color,
          updated_at: new Date().toISOString()
        })
        .eq('id', lineId);

      if (error) { }
      else { debugCanvasLogger('saveEnd', { op: 'saveLineToDb', lineId }); }
    } catch (e) {
    }
  }, [lines]);

  // Update line with DB save (for toolbar changes)
  const updateLine = useCallback(async (lineId: string, updates: Partial<CanvasLine>) => {
    // Optimistic update
    setLines(prev => prev.map(l =>
      l.id === lineId
        ? { ...l, ...updates, updated_at: new Date().toISOString() }
        : l
    ));

    // Skip DB update for temp lines
    if (lineId.startsWith('temp-')) return;

    debugCanvasLogger('saveStart', { op: 'updateLine', lineId });
    try {
      const { error } = await supabase
        .from('canvas_lines')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', lineId);

      if (error) { }
      else { debugCanvasLogger('saveEnd', { op: 'updateLine', lineId }); }
    } catch (e) {
    }
  }, []);

  const deleteLine = useCallback(async (lineId: string) => {
    // Optimistic update
    setLines(prev => prev.filter(l => l.id !== lineId));
    dispatch({ type: 'SELECTION_PATCH', payload: { selectedLineId: null } });

    // Skip DB delete for temp lines
    if (lineId.startsWith('temp-')) return;

    try {
      const { error } = await supabase
        .from('canvas_lines')
        .delete()
        .eq('id', lineId);

      if (error) { }
    } catch (e) {
    }
  }, [dispatch]);

  const handleChangeLineLayer = useCallback((lineId: string, action: 'front' | 'back' | 'forward' | 'backward') => {
    const targetLine = lines.find(l => l.id === lineId);
    if (!targetLine) return;

    const currentPlane = targetLine.layer_plane ?? 'front';
    const currentZ = targetLine.z_index ?? 0;

    if (action === 'front') {
      // Move to front plane: place above all current front-plane lines
      const frontZIndexes = lines
        .filter(l => (l.layer_plane ?? 'front') === 'front')
        .map(l => l.z_index ?? 0);
      const maxFrontZ = frontZIndexes.length > 0 ? Math.max(...frontZIndexes) : 0;
      updateLine(lineId, { layer_plane: 'front', z_index: maxFrontZ + 1 });

    } else if (action === 'back') {
      // Move to back plane: place below all current back-plane lines
      const backZIndexes = lines
        .filter(l => (l.layer_plane ?? 'front') === 'back')
        .map(l => l.z_index ?? 0);
      const minBackZ = backZIndexes.length > 0 ? Math.min(...backZIndexes) : 0;
      updateLine(lineId, { layer_plane: 'back', z_index: minBackZ - 1 });

    } else if (action === 'forward') {
      // Reorder within the current plane only — do not change layer_plane
      updateLine(lineId, { z_index: currentZ + 1 });

    } else if (action === 'backward') {
      // Reorder within the current plane only — do not change layer_plane
      updateLine(lineId, { z_index: currentZ - 1 });
    }
  }, [lines, updateLine]);

  // Duplicate a line (for context menu)
  const duplicateLine = useCallback(async (lineId: string) => {
    const line = lines.find(l => l.id === lineId);
    if (!line || !canvasId) return;

    try {
      const newLineId = crypto.randomUUID();
      const offset = 20; // Offset for duplicated line

      const newLine: CanvasLine = {
        ...line,
        id: newLineId,
        start_x: line.start_x + offset,
        start_y: line.start_y + offset,
        end_x: line.end_x + offset,
        end_y: line.end_y + offset,
        control_x: line.control_x + offset,
        control_y: line.control_y + offset,
        points: line.points?.map(p => ({ ...p, x: p.x + offset, y: p.y + offset })),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Optimistic update
      setLines(prev => [...prev, newLine]);
      dispatch({ type: 'SELECTION_PATCH', payload: { selectedLineId: newLineId } });

      // Save to database
      const { error } = await supabase
        .from('canvas_lines')
        .insert(newLine);

      if (error) {
        // Rollback on error
        setLines(prev => prev.filter(l => l.id !== newLineId));
      }
    } catch (e) {
    }
  }, [lines, canvasId, dispatch]);

  // ── Padlet content/title mutations ──────────────────────────────────────────

  const updatePadletContent = async (padletId: string, content: string) => {
    try {
      const updatePostContentBestEffort = createUpdatePostContentBestEffortCommand(createPostsRepository());
      const result = await updatePostContentBestEffort({ postId: padletId, content }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
      setPadlets((prev) =>
        prev.map((p) => (p.id === padletId ? { ...p, content } : p))
      );
    } catch (err) {
      console.error('Failed to update padlet content:', err);
    }
  };

  const updatePadletTitle = async (padletId: string, title: string) => {
    markPadletLocallyModified(padletId);
    try {
      const updatePostTitle = createUpdatePostTitleCommand(createPostsRepository());
      const result = await updatePostTitle({ postId: padletId, title }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;

      // Optimistic local update
      setPadlets(prev => prev.map(p =>
        p.id === padletId ? { ...p, title } : p
      ));
    } catch (e) {
      console.error('Failed to update padlet title:', e);
    }
  };

  const addPadletFromLibraryItem = useCallback(async (payload: any) => {
    const createPostBestEffort = createCreatePostBestEffortCommand(createPostsRepository());
    const result = await createPostBestEffort({ row: payload }, { userId: null });
    if (!result.ok) throw result.error.cause ?? result.error;
    fetchData();
  }, [fetchData]);

  const addFreeformCardPadlet = useCallback(async (newPadlet: Padlet) => {
    // AUTHORIZED CONVERGENCE (PATCH-041, the program's fourth behavior
    // micro-change): a THROWN insert failure previously escaped to the drop
    // handler's catch and left the optimistic card stranded (ghost work,
    // P3); both failure channels now take the SAME rollback branch below.
    const createPost = createCreatePostCommand(createPostsRepository());
    const result = await createPost({ row: newPadlet }, { userId: null });
    if (!result.ok) {
      setPadlets((prev) => prev.filter((p) => p.id !== newPadlet.id));
    }
  }, []);

  const addDrawingLayoutPadlet = useCallback(async (newPadlet: any, newId: string) => {
    try {
      const createPost = createCreatePostCommand(createPostsRepository());
      const result = await createPost({ row: newPadlet }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
      return newPadlet;
    } catch (err) {
      console.error('Failed to create drawing padlet:', err);
      setPadlets(prev => prev.filter(p => p.id !== newId));
      return null;
    }
  }, []);

  const updateDrawingLayoutPadlet = useCallback(async (id: string, updates: any) => {
    const previousPadlet = padletsRef.current.find((p) => p.id === id);
    if (!previousPadlet) return;

    markPadletLocallyModified(id);
    setPadlets((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));

    try {
      const { error } = await supabase.from('padlets').update(updates).eq('id', id);
      if (error) {
        setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
      }
    } catch (err) {
      console.error('Failed to update padlet:', err);
      setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
    }
  }, [markPadletLocallyModified]);

  const insertPadlet = useCallback(async (payload: any) => {
    return await supabase.from('padlets').insert(payload);
  }, []);

  const insertPadletAndSelectSingle = useCallback(async (payload: any) => {
    return await supabase
      .from('padlets')
      .insert(payload)
      .select()
      .single();
  }, []);

  const updatePadletById = useCallback(async (id: string, updates: any) => {
    return await supabase
      .from('padlets')
      .update(updates)
      .eq('id', id);
  }, []);

  const deletePadletByIdRaw = useCallback(async (id: string) => {
    return await supabase
      .from('padlets')
      .delete()
      .eq('id', id);
  }, []);

  // ── Return ──────────────────────────────────────────────────────────────────
  return {
    // Data state (exposed for CanvasClient read + optimistic updates)
    canvas,
    padlets,
    setPadlets,
    lines,
    setLines,
    sections,
    setSections,
    loading,
    error,
    // Core data operations
    fetchData,
    markPadletLocallyModified,
    markLineLocallyModified,
    // Line CRUD
    updateLineLocal,
    saveLineToDb,
    updateLine,
    deleteLine,
    duplicateLine,
    handleChangeLineLayer,
    // Padlet mutations
    updatePadletContent,
    updatePadletTitle,
    addPadletFromLibraryItem,
    addFreeformCardPadlet,
    addDrawingLayoutPadlet,
    updateDrawingLayoutPadlet,
    insertPadlet,
    insertPadletAndSelectSingle,
    updatePadletById,
    deletePadletByIdRaw,
  };
}
```

## 3. Phase B — the BOUND MECHANICAL EXTRACTOR (the PATCH-040 Amendment 1 procedure, standard from this patch on)

Run from the repo root with `python3`. It extracts the §2 fence from
THIS spec, hash-asserts it BEFORE writing, writes LF bytes, and
re-verifies with `git hash-object`. Any assert = STOP and report.
Verify hashes ONLY with `git hash-object`; never with a raw sha1 of
file bytes (CRLF divergence — LESSONS_LEARNED 2026-07-11).

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-041.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-041.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)
path = "components/collabboard/canvas/hooks/useCanvasData.ts"
want = "96671b64cbcd63704bb64dd781f33b6c07b618f3"
content = fences[0]
got = blob(content.encode("utf-8"))
assert got == want, f"fence 0 hashes to {got}, expected {want} - STOP, report"
with open(path, "w", encoding="utf-8", newline="") as f:
    f.write(content)
check = subprocess.run(["git", "hash-object", path], capture_output=True, text=True).stdout.strip()
assert check == want, f"{path}: git hash-object {check} != {want} - STOP, report"
print(path, check, "OK")
print("BOUND FILE WRITTEN AND HASH-VERIFIED")
```

## 4. The edit, for review (ONE region — EXPLANATORY; §2 via §3 is how you implement)

OLD:

```ts
  const addFreeformCardPadlet = useCallback(async (newPadlet: Padlet) => {
    const { error } = await supabase.from('padlets').insert(newPadlet);
    if (error) {
      setPadlets((prev) => prev.filter((p) => p.id !== newPadlet.id));
    }
  }, []);
```

NEW:

```ts
  const addFreeformCardPadlet = useCallback(async (newPadlet: Padlet) => {
    // AUTHORIZED CONVERGENCE (PATCH-041, the program's fourth behavior
    // micro-change): a THROWN insert failure previously escaped to the drop
    // handler's catch and left the optimistic card stranded (ghost work,
    // P3); both failure channels now take the SAME rollback branch below.
    const createPost = createCreatePostCommand(createPostsRepository());
    const result = await createPost({ row: newPadlet }, { userId: null });
    if (!result.ok) {
      setPadlets((prev) => prev.filter((p) => p.id !== newPadlet.id));
    }
  }, []);
```

---

## 5. Post-edit gates (hash FIRST; any mismatch = STOP)

### 5.0 Byte-identity (PRIMARY)

```bash
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts   # 96671b64cbcd63704bb64dd781f33b6c07b618f3
git hash-object lib/domain/canvas/posts.ts                                      # fdc5fd153b5a4689a29c086652fc9411f9074b09   (MUST-NOT-CHANGE)
git hash-object lib/domain/canvas/posts.test.ts                                 # affd371dacd6607be415304f981ec938d6fb6be8   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028   (MUST-NOT-CHANGE)
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 57a56ef8595c8ebc4b655a1fd811904049bbd155   (MUST-NOT-CHANGE)
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065   (MUST-NOT-CHANGE)
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts           # cff23229dcbeb76a93d46d75b6b13a6aa351f07a   (MUST-NOT-CHANGE)
git ls-files --eol -- components/collabboard/canvas/hooks/useCanvasData.ts
# i/lf    w/lf
```

### 5.1 Hook census (simulation-measured)

```bash
H="components/collabboard/canvas/hooks/useCanvasData.ts"
wc -l "$H"                                # 639
grep -c '^[[:space:]]*$' "$H"             # 78
grep -c "\.from('padlets')" "$H"          # 7   (CORRECTED at review from a stale 6 - authoring off-by-one, fence hash unaffected)
grep -c "\.from(" "$H"                    # 16
grep -c "supabase" "$H"                   # 22
grep -c "markPadletLocallyModified" "$H"  # 5
grep -c "createCreatePostCommand" "$H"    # 3   (1 import + 2 uses)
grep -c "createPostsRepository" "$H"      # 6   (1 import + 5 uses)
grep -c "result.error.cause" "$H"         # 4   (UNCHANGED — the convergence has NO rethrow)
grep -c "userId: null" "$H"               # 5
grep -c "addFreeformCardPadlet" "$H"      # 2
grep -c "AUTHORIZED CONVERGENCE" "$H"     # 1
```

### 5.2 Scope + untouched gates

```bash
git status --short   # exactly ONE modified file: the hook; ANY other path = STOP
git diff --stat -- lib/domain lib/infra components/collabboard/canvas/hooks/useCanvasLines.ts components/collabboard/canvas/hooks/useCanvasInteractions.ts "app/dashboard/canvas/\[id\]/CanvasClient.tsx" eslint.boundaries.config.mjs   # nothing
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 6. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** run the §3 extractor, then the §5 gates (hash first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **214 passed (214), 25 files** (UNCHANGED — zero test changes); full Playwright warmed → **27 passed**; stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` all green.

## 7. Commit ritual

```bash
git add components/collabboard/canvas/hooks/useCanvasData.ts
git status --short   # exactly 1 staged M line; anything else = STOP
git commit -m "refactor(canvas): extract addFreeformCardPadlet onto the existing honest createPost -- fourth authorized behavior micro-change, thrown insert failures now roll back the optimistic card, hooks slice 4, Pattern K (PATCH-041)" -- components/collabboard/canvas/hooks/useCanvasData.ts
```

## 8. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
casts, message strings, test counts. Pre-declared (confirm, don't
re-justify): the AUTHORIZED convergence and its three disclosed
consequences (§0.1); the four-line call-site comment (§0.2); NO
timestamps (029 insert fact); wc 634→639; ZERO new casts; ZERO test
changes; ZERO import edits; the rollback filter byte-kept.

STOP if: any §1 gate mismatches; the §3 extractor asserts; any §5.0
hash mismatches; `git status --short` shows ANY path beyond the one
scoped file; any MUST-NOT-CHANGE hash moved; tsc/boundaries/unit/e2e
fail beyond the stale-`.next/types` cure.

Do NOT: touch `updateDrawingLayoutPadlet`, the four raw passthroughs,
fetchData, the section-recovery cluster, the realtime channel, any line
site, the 039/040 extracted sites, useCanvasLines, useCanvasInteractions,
CanvasClient (incl. its L6384 catch — it stays for its other duties), or
any domain/infra file; add a rethrow to the convergence branch; add
`markPadletLocallyModified`; edit any existing test; create files;
de-lint types; chase the grandfather list (stays 2).
