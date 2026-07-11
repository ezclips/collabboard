# PATCH-042 — hooks phase slice 5, strangler group 17: the RAW-PASSTHROUGH FAMILY onto a fenced Pattern-J infra module (postsRaw.ts) — Family 5 fully dispositioned, useCanvasData's padlets surface reduced to Families 1/2

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4 acceptable** (Pattern K, seventeenth application — five delegation swaps with raw shapes flowing through unchanged; zero behavior deltas of any kind; see §0.4)
**Pattern:** K + the PATCH-021 Pattern-J raw-passthrough exception: ONE new fenced infra module (4 functions, no tests — the workspaceMembers precedent: one-line builder returns, the table is the validator, e2e covers), five hook regions swapped to delegations, ZERO domain changes, ZERO test changes, ZERO behavior authorizations.
**Scope:** TWO files — `lib/infra/supabase/postsRaw.ts` (NEW) + `components/collabboard/canvas/hooks/useCanvasData.ts`.
**Authored:** 2026-07-11 (Fable 5 CTO). Census regenerated FRESH from the tree at commit `f328f6c` (per the PATCH-041 census lesson — every bound number below re-grepped, none recalled); the CTO simulation applied both canonical files to the working tree and ran the REAL repo gates — `npx tsc --noEmit` CLEAN (the critical gate: consumer typing now flows through the typed `SupabaseClient`), `npm run check:boundaries` SILENT, `npx vitest run` **214 passed (214), 25 files** (unchanged — zero test changes) — then restored byte-exact via `git cat-file blob`.

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. Phase B is the
> bound mechanical extractor in §4 (standard since PATCH-040 Amendment 1);
> it writes BOTH files. §5's OLD/NEW pairs are EXPLANATORY — do not
> hand-apply. Never edit a bound test; STOP and report instead (§8).

---

## 0. CTO rulings

### 0.1 The contract ruling: the raws stay RAW, behind a fence

The four raw passthroughs (`insertPadlet`, `insertPadletAndSelectSingle`,
`updatePadletById`, `deletePadletByIdRaw`) have ~25 CanvasClient call
sites plus one JSX prop hand-off (`updatePadletById={updatePadletById}`,
L5903 — a child component consumes the raw shape too). EVERY consumer
destructures raw supabase `{ error }` / `{ data, error }` shapes.
Translating them to Result would rewrite two dozen consumer contracts
inside the over-ceiling monolith — not a behavior-preserving extraction.

**Ruling:** the PATCH-021 `workspaceMembers.ts` exception applies
verbatim — a DELIBERATE house-style exception module returning RAW
supabase shapes, with a header fence: SHRINK-ONLY, no consumers beyond
`useCanvasData.ts`, each function dying when its CanvasClient consumers
are later extracted onto proper canvas commands. P6 is satisfied
because `lib/domain/canvas/posts.ts` remains the ONLY surface for NEW
callers; the raw module is a transitional quarantine, not a second
implementation for new work. Rows and update payloads pass through
verbatim — the table is the shape's only validator (the 029 insert
fact, extended to the dynamic update).

### 0.2 updateDrawingLayoutPadlet rides for free — NO behavior ruling needed

Its DB statement is the SAME raw dynamic-update shape as
`updatePadletById`. It swaps onto `updatePostRowById(id, updates)` and
destructures `{ error }` exactly as before, so its ENTIRE contract is
byte-kept: optimistic merge, resolved error → silent rollback, thrown →
`console.error('Failed to update padlet:', err)` + rollback — the
channel split that blocked every command-based port (visible in the
041-era deferral notes) simply never arises, because the raw shape
flows through unchanged. This also dissolves the dynamic-`updates: any`
schema problem: no zod, no command, no column-shape ruling.

### 0.3 Behavior preservation (ALL axes — this patch has NO authorized change)

- **Client identity:** the hook's `supabase` singleton and the module's
  `createBrowserSupabaseClient()` both wrap `createClientComponentClient`
  (itself a singleton) — the PATCH-025 identity fact, already load-bearing
  in workspaceMembers.ts and authState.ts. Same session, same RLS.
- **Shapes:** every delegated function returns the SAME builder/promise
  the hook previously built inline — `{ data, error }` resolution
  identical; `insertPostRowReturning` preserves the `.select().single()`
  chain. CanvasClient and the JSX prop receiver are BYTE-UNTOUCHED.
- **Rollback / fallback / ordering:** updateDrawingLayoutPadlet's
  try/catch, both rollback statements, and the console.error are
  byte-kept (§0.2); the four raws have no control flow to preserve —
  they are single return statements.
- **Cache / loading / retry / realtime:** `markPadletLocallyModified`
  census 5→5 (the drawing site's call byte-kept; the raws never called
  it); the channel, fetchData, the section-recovery cluster, and the
  039/040/041 extracted sites all BYTE-UNTOUCHED (§6 census + diff
  gates).
- **Standing rulings honored:** workspace hand-off still rides the
  future lines-family patch; FreeformPadletCards stays last.

### 0.4 Model + census effects

**GPT-5.4 acceptable**: five delegation swaps + one new 48-line module;
the CTO compiled and ran the exact post-edit bytes in the working tree
(tsc clean — proving the raw shapes type-check through the typed
`SupabaseClient`'s default `any` schema generics exactly as they did
through the hook's `createClientComponentClient<any>` — boundaries
silent, 214/214 green), then restored byte-exact. ZERO new casts, ZERO
tests (the workspaceMembers no-test precedent for one-line builder
returns), ZERO domain changes. Hook: 639→635 lines; `.from('padlets')`
7→2 (ONLY Family 1's fetchData read and Family 2's recovery loop
remain); `.from(` 16→11; `supabase` lines 22→18 — NOT 17: the new
import path `@/lib/infra/supabase/postsRaw` contains the substring
(instrument disclosure, the escaped-dot lesson's cousin). Grandfather
stays 2. **Family 5 is fully dispositioned after this patch** (6 sites
extracted onto commands across 039–041, 5 statements quarantined here).
Remaining: Families 1/2 (fetchData quartet + recovery, after the
canvas_lines-aggregate ruling), Family 4 (lines, carries the workspace
rider), FreeformGraphRepo, FreeformPadletCards LAST, realtime CTO-only.

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # f328f6c (or a descendant touching none of the scoped/must-not-change files)
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts   # 96671b64cbcd63704bb64dd781f33b6c07b618f3
ls lib/infra/supabase/postsRaw.ts 2>/dev/null   # must NOT exist
```

MUST-NOT-CHANGE hashes (re-checked after the edit in §6):

```bash
git hash-object lib/domain/canvas/posts.ts                                      # fdc5fd153b5a4689a29c086652fc9411f9074b09
git hash-object lib/domain/canvas/posts.test.ts                                 # affd371dacd6607be415304f981ec938d6fb6be8
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028
git hash-object lib/infra/supabase/workspaceMembers.ts                          # 8d62ca5e5f33c5df5faa8407cb9d4b5fc8dbdd57
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 57a56ef8595c8ebc4b655a1fd811904049bbd155
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts           # cff23229dcbeb76a93d46d75b6b13a6aa351f07a
```

Hook census (measured FRESH 2026-07-11 at `f328f6c`):

```bash
H="components/collabboard/canvas/hooks/useCanvasData.ts"
wc -l "$H"                                # 639
grep -c '^[[:space:]]*$' "$H"             # 78
grep -c "\.from('padlets')" "$H"          # 7
grep -c "\.from(" "$H"                    # 16
grep -c "supabase" "$H"                   # 22
grep -c "markPadletLocallyModified" "$H"  # 5
grep -c "insertPostRow\|updatePostRowById\|deletePostRowById\|postsRaw" "$H"   # 0
```

Collision gate (must print nothing — the new names are globally fresh):

```bash
grep -rn "insertPostRow\|updatePostRowById\|deletePostRowById\|postsRaw" lib components app --include="*.ts" --include="*.tsx" | grep -v excalidraw_fork
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 25 files, 214 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE — `lib/infra/supabase/postsRaw.ts` (NEW, whole file, exact, 48 lines; post-edit hash `9aa0f6eacd8d3b9b5f95614f9d831f6a10a5bcf5`)

```ts
import { createBrowserSupabaseClient } from './browserClient';

/**
 * PATCH-042: narrow raw-passthrough wrappers for the canvas hook's four
 * legacy padlets-table raw operations plus the drawing-layout dynamic
 * update statement. All calls run on the STANDARD cookie/browser client -
 * the same client-component singleton the hook previously used (the
 * PATCH-025 identity fact).
 *
 * DELIBERATE house-style exception (same ruling as workspaceMembers.ts /
 * legacyToken.ts / passwordSecurity.ts): these return RAW supabase shapes,
 * not Result - the ~25 CanvasClient call sites (and one JSX prop receiver)
 * destructure `{ data, error }` directly through useCanvasData's unchanged
 * return surface, and a behavior-preserving extraction must not translate
 * them. Rows and update payloads pass through verbatim - the table is the
 * shape's only validator, exactly as before (the PATCH-029 insert fact,
 * extended to the dynamic update).
 *
 * SHRINK-ONLY: do not add consumers beyond useCanvasData.ts. Each function
 * dies when its CanvasClient consumers are extracted onto canvas commands -
 * lib/domain/canvas/posts.ts remains the ONLY surface for new callers.
 */

export function insertPostRow(row: object) {
    return createBrowserSupabaseClient().from('padlets').insert(row);
}

export function insertPostRowReturning(row: object) {
    return createBrowserSupabaseClient()
        .from('padlets')
        .insert(row)
        .select()
        .single();
}

export function updatePostRowById(id: string, fields: object) {
    return createBrowserSupabaseClient()
        .from('padlets')
        .update(fields)
        .eq('id', id);
}

export function deletePostRowById(id: string) {
    return createBrowserSupabaseClient()
        .from('padlets')
        .delete()
        .eq('id', id);
}
```

## 3. BOUND FILE — `components/collabboard/canvas/hooks/useCanvasData.ts` (whole file, exact, 635 lines; post-edit hash `794d3efc856e391e79c5edbc10d38f4037f7e453`)

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
import {
  deletePostRowById,
  insertPostRow,
  insertPostRowReturning,
  updatePostRowById,
} from '@/lib/infra/supabase/postsRaw';
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
      const { error } = await updatePostRowById(id, updates);
      if (error) {
        setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
      }
    } catch (err) {
      console.error('Failed to update padlet:', err);
      setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
    }
  }, [markPadletLocallyModified]);

  const insertPadlet = useCallback(async (payload: any) => {
    return await insertPostRow(payload);
  }, []);

  const insertPadletAndSelectSingle = useCallback(async (payload: any) => {
    return await insertPostRowReturning(payload);
  }, []);

  const updatePadletById = useCallback(async (id: string, updates: any) => {
    return await updatePostRowById(id, updates);
  }, []);

  const deletePadletByIdRaw = useCallback(async (id: string) => {
    return await deletePostRowById(id);
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

## 4. Phase B — the BOUND MECHANICAL EXTRACTOR (standard; writes BOTH files)

Run from the repo root with `python3`. It extracts the §2 and §3 fences
from THIS spec, hash-asserts each BEFORE writing, writes LF bytes, and
re-verifies with `git hash-object`. Any assert = STOP and report.
Verify hashes ONLY with `git hash-object`; never with a raw sha1 of
file bytes (CRLF divergence — LESSONS_LEARNED 2026-07-11).

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-042.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-042.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)
targets = [
    ("lib/infra/supabase/postsRaw.ts", "9aa0f6eacd8d3b9b5f95614f9d831f6a10a5bcf5"),
    ("components/collabboard/canvas/hooks/useCanvasData.ts", "794d3efc856e391e79c5edbc10d38f4037f7e453"),
]
for i, (path, want) in enumerate(targets):
    content = fences[i]
    got = blob(content.encode("utf-8"))
    assert got == want, f"fence {i} hashes to {got}, expected {want} - STOP, report"
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    check = subprocess.run(["git", "hash-object", path], capture_output=True, text=True).stdout.strip()
    assert check == want, f"{path}: git hash-object {check} != {want} - STOP, report"
    print(path, check, "OK")
print("BOTH BOUND FILES WRITTEN AND HASH-VERIFIED")
```

## 5. The hook's edits, for review (six regions — EXPLANATORY; §4 is how you implement)

### §5a — import block (directly after the postsRepository import)

OLD:

```ts
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
```

NEW:

```ts
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import {
  deletePostRowById,
  insertPostRow,
  insertPostRowReturning,
  updatePostRowById,
} from '@/lib/infra/supabase/postsRaw';
```

### §5b — updateDrawingLayoutPadlet's statement (try/catch, both rollbacks, and the console.error BYTE-KEPT)

OLD:

```ts
      const { error } = await supabase.from('padlets').update(updates).eq('id', id);
```

NEW:

```ts
      const { error } = await updatePostRowById(id, updates);
```

### §5c — insertPadlet delegation

OLD:

```ts
  const insertPadlet = useCallback(async (payload: any) => {
    return await supabase.from('padlets').insert(payload);
  }, []);
```

NEW:

```ts
  const insertPadlet = useCallback(async (payload: any) => {
    return await insertPostRow(payload);
  }, []);
```

### §5d — insertPadletAndSelectSingle delegation

OLD:

```ts
  const insertPadletAndSelectSingle = useCallback(async (payload: any) => {
    return await supabase
      .from('padlets')
      .insert(payload)
      .select()
      .single();
  }, []);
```

NEW:

```ts
  const insertPadletAndSelectSingle = useCallback(async (payload: any) => {
    return await insertPostRowReturning(payload);
  }, []);
```

### §5e — updatePadletById delegation

OLD:

```ts
  const updatePadletById = useCallback(async (id: string, updates: any) => {
    return await supabase
      .from('padlets')
      .update(updates)
      .eq('id', id);
  }, []);
```

NEW:

```ts
  const updatePadletById = useCallback(async (id: string, updates: any) => {
    return await updatePostRowById(id, updates);
  }, []);
```

### §5f — deletePadletByIdRaw delegation

OLD:

```ts
  const deletePadletByIdRaw = useCallback(async (id: string) => {
    return await supabase
      .from('padlets')
      .delete()
      .eq('id', id);
  }, []);
```

NEW:

```ts
  const deletePadletByIdRaw = useCallback(async (id: string) => {
    return await deletePostRowById(id);
  }, []);
```

---

## 6. Post-edit gates (hashes FIRST; any mismatch = STOP)

### 6.0 Byte-identity (PRIMARY)

```bash
git hash-object lib/infra/supabase/postsRaw.ts                          # 9aa0f6eacd8d3b9b5f95614f9d831f6a10a5bcf5
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts   # 794d3efc856e391e79c5edbc10d38f4037f7e453
git hash-object lib/domain/canvas/posts.ts                                      # fdc5fd153b5a4689a29c086652fc9411f9074b09   (MUST-NOT-CHANGE)
git hash-object lib/domain/canvas/posts.test.ts                                 # affd371dacd6607be415304f981ec938d6fb6be8   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028   (MUST-NOT-CHANGE)
git hash-object lib/infra/supabase/workspaceMembers.ts                          # 8d62ca5e5f33c5df5faa8407cb9d4b5fc8dbdd57   (MUST-NOT-CHANGE)
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 57a56ef8595c8ebc4b655a1fd811904049bbd155   (MUST-NOT-CHANGE)
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065   (MUST-NOT-CHANGE)
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts           # cff23229dcbeb76a93d46d75b6b13a6aa351f07a   (MUST-NOT-CHANGE)
git ls-files --eol -- components/collabboard/canvas/hooks/useCanvasData.ts
# i/lf    w/lf
```

### 6.1 Censuses (simulation-measured; plain `grep -c`, substring counting disclosed)

```bash
H="components/collabboard/canvas/hooks/useCanvasData.ts"
wc -l "$H"                                # 635
grep -c '^[[:space:]]*$' "$H"             # 78
grep -c "\.from('padlets')" "$H"          # 2   (ONLY Family 1's fetchData read + Family 2's recovery loop)
grep -c "\.from(" "$H"                    # 11
grep -c "supabase" "$H"                   # 18  (NOT 17 — the new import PATH contains the substring; disclosed §0.4)
grep -c "markPadletLocallyModified" "$H"  # 5
grep -c "insertPostRow" "$H"              # 4   (substring counting: the 2 import lines incl. Returning + 2 uses)
grep -c "insertPostRowReturning" "$H"     # 2   (1 import + 1 use)
grep -c "updatePostRowById" "$H"          # 3   (1 import + 2 uses — the drawing site AND the raw delegation)
grep -c "deletePostRowById" "$H"          # 2   (1 import + 1 use)
R="lib/infra/supabase/postsRaw.ts"
wc -l "$R"                                # 48
grep -c "\.from('padlets')" "$R"          # 4
grep -c "createBrowserSupabaseClient" "$R"   # 5   (1 import + 4 uses)
grep -c "export function" "$R"            # 4
```

### 6.2 Scope + untouched gates

```bash
git status --short   # exactly TWO paths: M the hook + ?? (then A) postsRaw.ts; ANY other path = STOP
git diff --stat -- lib/domain lib/infra/canvas lib/infra/supabase/workspaceMembers.ts components/collabboard/canvas/hooks/useCanvasLines.ts components/collabboard/canvas/hooks/useCanvasInteractions.ts "app/dashboard/canvas/\[id\]/CanvasClient.tsx" eslint.boundaries.config.mjs   # nothing
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 7. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** run the §4 extractor (writes both files), then the §6 gates (hashes first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **214 passed (214), 25 files** (UNCHANGED — zero test changes); full Playwright warmed → **27 passed** (board-lifecycle exercises insert/update/delete through the delegated raws); stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` all green.

## 8. Commit ritual

```bash
git add lib/infra/supabase/postsRaw.ts components/collabboard/canvas/hooks/useCanvasData.ts
git status --short   # exactly 2 staged lines (1 A + 1 M); anything else = STOP
git commit -m "refactor(canvas): quarantine the raw-passthrough family onto fenced postsRaw.ts -- Pattern J exception per 021, updateDrawingLayoutPadlet rides byte-kept, Family 5 fully dispositioned, hooks slice 5, Pattern K (PATCH-042)" -- lib/infra/supabase/postsRaw.ts components/collabboard/canvas/hooks/useCanvasData.ts
```

## 9. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
casts, message strings, test counts. Pre-declared (confirm, don't
re-justify): NO behavior change anywhere (raw shapes flow through);
the `supabase` census landing on 18 not 17 (§0.4 import-path substring);
substring counting on `insertPostRow` (§6.1); the new module ships
WITHOUT tests (workspaceMembers precedent); 4-space indent in
postsRaw.ts (mirrors its Pattern-J sibling, not the 2-space repo
majority); wc 639→635; ZERO new casts; ZERO test changes.

STOP if: any §1 gate mismatches (incl. postsRaw.ts already existing);
the §4 extractor asserts; any §6.0 hash mismatches; `git status --short`
shows ANY path beyond the two scoped files; any MUST-NOT-CHANGE hash
moved; tsc/boundaries/unit/e2e fail beyond the stale-`.next/types` cure.

Do NOT: touch fetchData, the section-recovery cluster, the realtime
channel, any line site, the 039/040/041 extracted sites, CanvasClient,
useCanvasLines, useCanvasInteractions, workspaceMembers.ts, or any
domain file; convert any raw shape to Result; add tests to postsRaw.ts;
add consumers to postsRaw.ts beyond the hook; rename the hook's exported
legacy function names (`insertPadlet` etc. are pre-existing surface —
P7 governs NEW naming only); edit any existing test; create files beyond
the one; de-lint types; chase the grandfather list (stays 2).
