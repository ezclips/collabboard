# PATCH-049 — hooks slice 12: postsRaw's FIRST export death — the `deletePadletByIdRaw` family onto `canvas.deletePost` (three CanvasClient sites, two contract helpers)

**Status:** SPEC READY — implement exactly as bound below.
**Implementer:** GPT-5.4 acceptable (Pattern K, twenty-fourth application — zero new
domain surface; two whole-file fences plus five single-occurrence CanvasClient
replacements of established idioms).
**Authored:** 2026-07-12 at `3f8d71b` by the CTO (Fable 5). All censuses, hashes, and
simulation results below were measured fresh on that tree; the canonical files were
COMPILED AND RUN through the real repo gates before delegation (§0.6).

**Read first:** `.fable5/docs/SKILL.md`, `.fable5/docs/PATCH_REFERENCE.md` (§5.11
Pattern K), then this spec end to end. The LESSONS_LEARNED autocrlf rules apply:
never `git checkout/restore` a byte-fenced file; verify hashes ONLY with
`git hash-object`.

**Bound commit message (use EXACTLY, one commit):**

```
refactor(canvas): retire deletePostRowById via canvas.deletePost -- postsRaw's first export death, three CanvasClient delete sites onto two hook contract helpers (045 discrimination), CanvasClient 8384->8383 below the never-grow plateau, hooks slice 12, Pattern K (PATCH-049)
```

---

## 0. CTO rulings and contract analysis

### 0.1 The census-driven slice ruling

The live census of the four remaining raw passthroughs (fresh at `3f8d71b`):

| Passthrough | CanvasClient call sites | Entanglements |
|---|---|---|
| `insertPadlet` | 8 | none |
| `insertPadletAndSelectSingle` | 5 | none |
| `updatePadletById` | 7 | **+ the L5903 JSX prop hand-off to FreeformPadletCards (LAST)** |
| `deletePadletByIdRaw` | **3** | none |

**RULING: the delete family is the slice** — three call sites in exactly TWO
distinct legacy contracts, zero new domain surface needed (`canvas.deletePost`
landed at PATCH-028 and is fully test-pinned), and its retirement kills
`deletePostRowById` — **the first ACTUAL postsRaw export death**, exactly what
the module's SHRINK-ONLY fence exists for. The other three passthroughs and
the JSX prop STAY RAW and BYTE-UNTOUCHED (the 021/042 exception, re-affirmed;
`updatePadletById` is additionally entangled with FreeformPadletCards, which
stays LAST). No unrelated consumer is translated.

**The consumer contracts move INTO the hook** (the established direction:
useCanvasLines' createLine temp-line fallback, useCanvasData's
updateDrawingLayoutPadlet rollback — per-site semantics live in the data hook,
CanvasClient shrinks). Two helpers, one per contract (§0.2); CanvasClient's
three sites become one-line calls — the file goes **8,384 → 8,383, the first
shrink below the never-grow plateau** held at equality since PATCH-045.

### 0.2 The failure contracts (preserve EXACTLY — simulation-proven)

**Contract 1 — the compensating child delete (sites A ~L1879 and B ~L2480,
byte-identical semantics, B carries a legacy comment line):** legacy
`await deletePadletByIdRaw(childData.id);` bare inside a container-failure
branch, result IGNORED, followed by `throw containerResult...`.

| # | Channel | Legacy | Ported (`deletePostSwallowResolved`) |
|---|---------|--------|--------------------------------------|
| 1 | Resolved DB error | `{ error }` never read — silently swallowed; the pending container throw proceeds | repo `err('unavailable')` → `code !== 'unknown'` → helper returns void — the swallow PRESERVED at the call-site class (NOT command-internal; the command-internal family stays ELEVEN) |
| 2 | Thrown | the exception replaces the pending container throw; the catch logs the DELETE's error | defineCommand → `err('unknown', { cause })` → helper rethrows `cause` at the SAME position — the same catch receives the same original error; the container throw never runs, exactly as legacy |
| 3 | Success | nothing | `result.ok` → helper returns void |
| 4 | Validation (029 standing) | none | zod `postId: z.string()` — unreachable from live callers (ids are strings); 'validation' ≠ 'unknown' → the swallow branch, disclosed |

**Contract 2 — the map-pin container delete (site C ~L2766,
`deleteMapPinContainer`):** legacy
`const { error: containerError } = await deletePadletByIdRaw(containerId);
if (containerError) throw containerError;` — both channels ALREADY converge
on the same catch (the 038/040 check-and-throw shape).

| # | Channel | Legacy | Ported (`deletePostOrThrow`) |
|---|---------|--------|------------------------------|
| 1 | Resolved DB error | `throw containerError` — the RAW supabase error object | `err('unavailable', { cause })` → helper throws `cause` — the SAME raw object into the SAME catch |
| 2 | Thrown | the exception reaches the catch directly | `err('unknown', { cause })` → helper throws `cause` — the same exception |
| 3 | Success | falls through to the child delete (`canvas.deletePosts`, already extracted) then `toast.success` | byte-kept — only statement 1 is swapped; ordering identical |
| 4 | Validation (029 standing) | none | any `!result.ok` throws `cause ?? error`; unreachable from live callers, disclosed |

Wire statement: `canvas.deletePost` → `repository.deleteById` →
`.from('padlets').delete().eq('id', id)` — the byte-identical statement shape
`deletePostRowById` built. No payload, no stamp, nothing to preserve beyond
the WHERE shape (already pinned by the PATCH-028 tests).

### 0.3 The new hook surface (NO new domain/infra surface)

- `deletePostSwallowResolved(id)` — contract 1, serving sites A and B; the
  resolved-swallow carries a bound PRESERVED LEGACY SWALLOW comment.
- `deletePostOrThrow(id)` — contract 2, serving site C; deps arrays swap
  `deletePadletByIdRaw` → `deletePostOrThrow` (site C's `useCallback` is the
  only one that listed the old name; sites A/B live in plain async functions).
- Neutral naming per P7 (post, not padlet — the legacy-named passthroughs are
  grandfathered survivors, not precedent for NEW names).
- NO tests: zero new domain or infra surface — `canvas.deletePost` and
  `SupabasePostsRepository.deleteById` are already pinned (PATCH-028); hooks
  carry no unit tests in this program (e2e territory — board-lifecycle covers
  delete flows). Suite stays **251/28**.

### 0.4 Scope

THREE files: `components/collabboard/canvas/hooks/useCanvasData.ts` (whole
file), `lib/infra/supabase/postsRaw.ts` (whole file — the function dies, the
header fence doc records the death: leaving it stale would be a P0 doc bug,
the 047 graphRepo precedent), `app/dashboard/canvas/[id]/CanvasClient.tsx`
(FIVE single-occurrence replacements ONLY — the file is over-ceiling and is
edited exclusively by the bound extractor). NOT touched: the three surviving
passthroughs and their postsRaw builders, the L5903 JSX prop, posts.ts and
its whole 048 quartet, FreeformPadletCards, realtime, everything
lines/sections/graph.

### 0.5 Disclosures

- postsRaw census trap: plain `grep -c "deletePostRowById"` reads **1 → 1**
  (the definition line pre-edit; the header's retirement-record comment
  post-edit). The extinction instrument is `deletePostRowById(` WITH the
  paren: 2 → 0 repo-wide (definition + the hook's call).
- CanvasClient `createDeletePostCommand` stays 4 — the file already uses the
  command elsewhere; those sites are untouched (the hook's new import is its
  own).
- Hook `code === 'unknown'` 1 → 2 (updateDrawingLayoutPadlet's guard + the
  new contract-1 helper).
- CanvasClient `containerError` 6 → 4 (site C's two lines die; the surviving
  four are `insertPadlet`-family sites, untouched).
- Hook 647 → 677 (+30: two commented helpers replace the 3-line passthrough);
  677 < 800 — growth legal. postsRaw 48 → 44. CanvasClient 8,384 → **8,383**.
- The relocated swallow (contract 1) is CALL-SITE class, not command-internal:
  the command-internal family stays ELEVEN; no BestEffort sibling is created.

### 0.6 Simulation results (CTO, in-tree, this exact canonical content)

tsc `--noEmit` CLEAN; `npm run check:boundaries` SILENT; vitest
**251 passed (251), 28 files** — unchanged, zero pins broken. Tree restored
byte-exact via `git cat-file blob` + no-op `git add`.

### 0.7 One slice, no split

PATCH-050 is NOT drafted.

---

## 1. Pre-edit bindings (verify FIRST; any mismatch = STOP, report, do not improvise)

```bash
git status --short   # nothing
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts    # 810ea3a0b351c10efec4f6800abb0cf39c24c439   (647 lines)
git hash-object lib/infra/supabase/postsRaw.ts                          # 9aa0f6eacd8d3b9b5f95614f9d831f6a10a5bcf5   (48 lines)
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"            # 7acfa197623e39a8462adca29a321a9e64a12689   (8,384 lines)
```

MUST-NOT-CHANGE set (verify now AND after — all sixteen):

```bash
git hash-object lib/domain/canvas/posts.ts                                   # 5af51ef0cec14c014072529eda673e81a87c4b8b
git hash-object lib/domain/canvas/posts.test.ts                              # c4fcd7311644371023f29bb8689d2286e2e73fa1
git hash-object lib/infra/canvas/postsRepository.ts                          # 3a74731730ef047f023465dd65d86700fe878e74
git hash-object lib/infra/canvas/postsRepository.test.ts                     # 5610072a9f894a0f10a7822a740a920a8b9534a3
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx     # a405177da01176a260f7ce829f30f04549cf27c8
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts        # 8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object lib/infra/canvas/canvasViewReads.ts                          # a57714002bd65ea493776904ca01748d64bf3bed
git hash-object lib/infra/canvas/canvasViewReads.test.ts                     # d26385c24dcfdb10e8e0e6f705e1c1b5229ed40d
git hash-object lib/domain/canvas/sections.ts                                # 762c367186716749af21cfd3e9abf79cdafb74c0
git hash-object lib/infra/canvas/sectionsRepository.ts                       # 229655bd828a4b85aa85205e50c9bf6db56a8d85
git hash-object lib/domain/canvas/lines.ts                                   # 96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5
git hash-object lib/infra/canvas/linesRepository.ts                          # 1bb11907dfe58ed5ab116f94936304e9ca2ea1be
git hash-object lib/domain/core/command.ts                                   # 2e034d8d89acdade824c6f62751996961a8837d9
git hash-object lib/graph/graphRepo.ts                                       # bc82bd41e4e3c64d1752e8170ebdfdbb0559c9ac
git hash-object components/graph/FreeformGraphLayer.tsx                      # b439038ef21b471af8b1dc4fecbc5d12a5cfc9c0
```

Pre-edit censuses (plain `grep -c`, case-sensitive, LINE counts):

```bash
C="app/dashboard/canvas/[id]/CanvasClient.tsx"
grep -c "deletePadletByIdRaw" "$C"            # 5   (destructure + 3 sites + 1 deps array)
grep -c "deletePostSwallowResolved" "$C"      # 0
grep -c "deletePostOrThrow" "$C"              # 0
grep -c "createDeletePostCommand" "$C"        # 4   (pre-existing, untouched)
grep -c "containerError" "$C"                 # 6
grep -c "insertPadlet" "$C"                   # 17  (substring: includes insertPadletAndSelectSingle — the 042 disclosure)
grep -c "updatePadletById" "$C"               # 9   (incl. the L5903 JSX prop — untouched)
grep -c "supabase" "$C"                       # 27
wc -l "$C"                                    # 8384
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "deletePostRowById" "$H"              # 2   (import + the passthrough call)
grep -c "deletePadletByIdRaw" "$H"            # 2   (declaration + return entry)
grep -c "createDeletePostCommand" "$H"        # 0
grep -c "code === 'unknown'" "$H"             # 1
grep -c "insertPostRow" "$H"                  # 4
grep -c "updatePostRowById" "$H"              # 2
grep -c "supabase" "$H"                       # 8
grep -c "markPadletLocallyModified" "$H"      # 5
wc -l "$H"                                    # 647
R=lib/infra/supabase/postsRaw.ts
grep -c "deletePostRowById(" "$R"             # 1   (the paren instrument — see §0.5)
grep -c "export function" "$R"                # 4
wc -l "$R"                                    # 48
```

Collision gate (repo-wide, MUST be 0 pre-edit):

```bash
grep -rn "deletePostSwallowResolved\|deletePostOrThrow" --include="*.ts" --include="*.tsx" lib components app | grep -v node_modules | wc -l   # 0
```

---

## 2. BOUND FILE — `components/collabboard/canvas/hooks/useCanvasData.ts` (whole file, exact, 677 lines; post-edit hash `df0ecca9f284ba8656f620f7b29aa628c0830e98`)

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
  createCreateLineCommand,
  createDeleteLineCommand,
  createUpdateLineCommand,
} from '@/lib/domain/canvas/lines';
import {
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createDeletePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostFieldsCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createCreateSectionsCommand } from '@/lib/domain/canvas/sections';
import { createLinesRepository } from '@/lib/infra/canvas/linesRepository';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
import {
  insertPostRow,
  insertPostRowReturning,
  updatePostRowById,
} from '@/lib/infra/supabase/postsRaw';
import {
  findBoardById,
  findLinesByBoardId,
  findPostsByBoardId,
  findSectionsByBoardId,
} from '@/lib/infra/canvas/canvasViewReads';
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
      const canvasResult = await findBoardById(canvasId);

      const padletsResult = await findPostsByBoardId(canvasId);

      // Fetch lines (may not exist yet - graceful fallback)
      const linesResult = await findLinesByBoardId(canvasId);

      // Fetch sections for columns layout
      const sectionsResult = await findSectionsByBoardId(canvasId);

      if (!canvasResult.ok) {
        console.error('Error fetching canvas:', canvasResult.error.cause ?? canvasResult.error);
        throw canvasResult.error.cause ?? canvasResult.error;
      }
      if (!padletsResult.ok) {
        console.error('Error fetching padlets:', padletsResult.error.cause ?? padletsResult.error);
        throw padletsResult.error.cause ?? padletsResult.error;
      }
      // Don't throw on a failed lines read - table may not exist yet
      const canvasData = canvasResult.value as unknown as Canvas | null;
      const padletData = padletsResult.value as unknown as Padlet[];
      const lineData = linesResult.ok ? (linesResult.value as unknown as CanvasLine[]) : null;
      const sectionData = sectionsResult.ok ? (sectionsResult.value as unknown as BoardSection[]) : null;

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
              title: `Recovered Section ${index + 1}`,
              description: '',
              position: maxPosition + index + 1,
            }));

            const createSections = createCreateSectionsCommand(createSectionsRepository());
            const insertResult = await createSections(
              { boardId: canvasId, sections: recoveryPayload },
              { userId: null },
            );
            if (!insertResult.ok) throw insertResult.error.cause ?? insertResult.error;
            const recoveredSections = insertResult.value as unknown as BoardSection[] | null;

            const remap = new Map<string, string>();
            (recoveredSections || []).forEach((section, index) => {
              const oldId = missingSectionIds[index];
              if (oldId) remap.set(oldId, String(section.id));
            });

            const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
            await Promise.all(
              nextPadlets
                .filter((padlet) => remap.has(String((padlet.metadata as any)?.sectionId)))
                .map(async (padlet) => {
                  const oldSectionId = String((padlet.metadata as any)?.sectionId);
                  const nextSectionId = remap.get(oldSectionId);
                  if (!nextSectionId) return;
                  const result = await updatePostMetadataBestEffort(
                    {
                      postId: padlet.id,
                      metadata: {
                        ...(padlet.metadata as any),
                        sectionId: nextSectionId,
                      },
                    },
                    { userId: null },
                  );
                  if (!result.ok) throw result.error.cause ?? result.error;
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
    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - only a successful save logs saveEnd. The
    // updated_at stamp is command-internal (canvas.updateLine).
    const updateLineCmd = createUpdateLineCommand(createLinesRepository());
    const result = await updateLineCmd(
      {
        lineId,
        updates: {
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
        },
      },
      { userId: null },
    );
    if (result.ok) { debugCanvasLogger('saveEnd', { op: 'saveLineToDb', lineId }); }
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
    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - only a successful save logs saveEnd. The
    // updated_at stamp is command-internal (canvas.updateLine).
    const updateLineCmd = createUpdateLineCommand(createLinesRepository());
    const result = await updateLineCmd({ lineId, updates }, { userId: null });
    if (result.ok) { debugCanvasLogger('saveEnd', { op: 'updateLine', lineId }); }
  }, []);

  const deleteLine = useCallback(async (lineId: string) => {
    // Optimistic update
    setLines(prev => prev.filter(l => l.id !== lineId));
    dispatch({ type: 'SELECTION_PATCH', payload: { selectedLineId: null } });

    // Skip DB delete for temp lines
    if (lineId.startsWith('temp-')) return;

    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - the optimistic removal stands either way.
    const deleteLineCmd = createDeleteLineCommand(createLinesRepository());
    await deleteLineCmd({ lineId }, { userId: null });
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

      // Save to database. Channel split PRESERVED (no convergence
      // authorization): a RESOLVED insert error rolls back the optimistic
      // line (the legacy if (error) branch); a THROWN one carries code
      // 'unknown' out of defineCommand's catch and stays silent with the
      // optimistic line kept - exactly the legacy empty catch.
      const createLineCmd = createCreateLineCommand(createLinesRepository());
      const result = await createLineCmd({ row: newLine }, { userId: null });

      if (!result.ok && result.error.code !== 'unknown') {
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
      // Channel split PRESERVED (the PATCH-045 idiom): a THROWN failure
      // carries code 'unknown' out of defineCommand's catch and re-throws
      // its original cause into the catch below (the legacy console.error +
      // rollback); a RESOLVED error takes the silent rollback branch.
      const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
      const result = await updatePostFields({ postId: id, fields: updates }, { userId: null });
      if (!result.ok && result.error.code === 'unknown') {
        throw result.error.cause ?? result.error;
      }
      if (!result.ok) {
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

  // PATCH-049: the raw delete passthrough retired onto canvas.deletePost -
  // two helpers, one per legacy call-site contract (the 045 discrimination).

  /**
   * The container-creation compensating delete (two CanvasClient sites).
   * PRESERVED LEGACY SWALLOW (queued P3-family fix, do NOT repair here):
   * the legacy sites awaited the raw delete bare - a RESOLVED failure was
   * silently ignored and the pending container throw proceeded; only a
   * THROWN failure replaced it. Faithful port: code 'unknown' rethrows the
   * original cause; any other failure is deliberately ignored.
   */
  const deletePostSwallowResolved = useCallback(async (id: string) => {
    const deletePost = createDeletePostCommand(createPostsRepository());
    const result = await deletePost({ postId: id }, { userId: null });
    if (!result.ok && result.error.code === 'unknown') {
      throw result.error.cause ?? result.error;
    }
  }, []);

  /**
   * The map-pin container delete: BOTH legacy channels already converged
   * (the resolved `{ error }` was check-and-thrown into the same catch a
   * thrown failure reached), so ANY failure rethrows its original cause -
   * the 038/040 check-and-throw port, no behavior authorization needed.
   */
  const deletePostOrThrow = useCallback(async (id: string) => {
    const deletePost = createDeletePostCommand(createPostsRepository());
    const result = await deletePost({ postId: id }, { userId: null });
    if (!result.ok) {
      throw result.error.cause ?? result.error;
    }
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
    deletePostSwallowResolved,
    deletePostOrThrow,
  };
}
```

## 3. BOUND FILE — `lib/infra/supabase/postsRaw.ts` (whole file, exact, 44 lines; post-edit hash `fc7a159bdb067edd007669bf0b42b7b438c1e241`)

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
 * PATCH-049: deletePostRowById retired (its three CanvasClient consumers
 * moved onto canvas.deletePost) - the module's first export death.
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

```

## 4. BOUND REPLACEMENTS — `app/dashboard/canvas/[id]/CanvasClient.tsx` (FIVE single-occurrence swaps; pre `7acfa197623e39a8462adca29a321a9e64a12689` → post `42810831013fb3217cc943bed7382a5fdad0f5d4`, 8,384 → 8,383)

The file is over-ceiling: it is edited ONLY by the Phase B extractor below,
which asserts the pre-edit hash, applies each pair exactly once, and asserts
the post-edit hash. The pairs, in application order:

### 4.1 — the hook destructure (one line, the old name dies, both new names arrive)

OLD:

```ts
    insertPadlet, insertPadletAndSelectSingle, updatePadletById, deletePadletByIdRaw,
```

NEW:

```ts
    insertPadlet, insertPadletAndSelectSingle, updatePadletById, deletePostSwallowResolved, deletePostOrThrow,
```

### 4.2 — site A, the timeline compensating child delete (line-neutral; unique WITHOUT a comment line — site B's block carries one)

OLD:

```ts
      if (!containerResult.ok) {
        await deletePadletByIdRaw(childData.id);
        throw containerResult.error.cause ?? containerResult.error;
      }
```

NEW:

```ts
      if (!containerResult.ok) {
        await deletePostSwallowResolved(childData.id);
        throw containerResult.error.cause ?? containerResult.error;
      }
```

### 4.3 — site B, the sectioned-container compensating child delete (line-neutral; the legacy comment line byte-kept)

OLD:

```ts
      if (!containerResult.ok) {
        // Cleanup child if container fails
        await deletePadletByIdRaw(childData.id);
        throw containerResult.error.cause ?? containerResult.error;
      }
```

NEW:

```ts
      if (!containerResult.ok) {
        // Cleanup child if container fails
        await deletePostSwallowResolved(childData.id);
        throw containerResult.error.cause ?? containerResult.error;
      }
```

### 4.4 — site C, the map-pin container delete (2 lines → 1 line, the file's −1; both legacy channels already converged)

OLD:

```ts
      const { error: containerError } = await deletePadletByIdRaw(containerId);
      if (containerError) throw containerError;
```

NEW:

```ts
      await deletePostOrThrow(containerId);
```

### 4.5 — site C's deps array (one line; the only useCallback that listed the old name)

OLD:

```ts
  }, [padlets, selectedPadletId, mapActiveContainerId, deletePadletByIdRaw, fetchData]);
```

NEW:

```ts
  }, [padlets, selectedPadletId, mapActiveContainerId, deletePostOrThrow, fetchData]);
```

---

## 5. Phase plan

### Phase A — read + verify

Read SKILL.md, PATCH_REFERENCE §5.11, this spec. Run EVERY §1 gate. Any
mismatch: STOP and report; do not improvise.

### Phase B — the bound mechanical extractor (the ONLY write step)

Save the block below as `_p049_extract.py` (repo root) and run
`python3 _p049_extract.py`; then DELETE the script file. Do not hand-edit any
scoped file; if the extractor stops, report its output verbatim.

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

def githash(path: str) -> str:
    return subprocess.run(["git", "hash-object", path], capture_output=True, text=True).stdout.strip()

spec = open(".fable5/patches/PATCH-049.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-049.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)
assert len(fences) == 12, f"expected 12 ts fences, found {len(fences)} - STOP, report"
WHOLE = [
    ("components/collabboard/canvas/hooks/useCanvasData.ts", "df0ecca9f284ba8656f620f7b29aa628c0830e98"),
    ("lib/infra/supabase/postsRaw.ts", "fc7a159bdb067edd007669bf0b42b7b438c1e241"),
]
for i, (path, want) in enumerate(WHOLE):
    content = fences[i]
    got = blob(content.encode("utf-8"))
    assert got == want, f"fence {i} hashes to {got}, expected {want} - STOP, report"
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    check = githash(path)
    assert check == want, f"{path}: git hash-object {check} != {want} - STOP, report"
    print(path, check, "OK")
CC = "app/dashboard/canvas/[id]/CanvasClient.tsx"
PRE = "7acfa197623e39a8462adca29a321a9e64a12689"
POST = "42810831013fb3217cc943bed7382a5fdad0f5d4"
assert githash(CC) == PRE, f"CanvasClient pre-edit hash mismatch - STOP, report"
work = open(CC, encoding="utf-8", newline="").read()
assert "\r" not in work, (
    "CanvasClient working copy is CRLF-smudged; rewrite it byte-exact via "
    "git cat-file blob HEAD before running this extractor"
)
for k in range(5):
    old, new = fences[2 + 2 * k], fences[3 + 2 * k]
    cnt = work.count(old)
    assert cnt == 1, f"pair {k + 1}: OLD occurs {cnt} times, need exactly 1 - STOP, report"
    work = work.replace(old, new)
with open(CC, "w", encoding="utf-8", newline="") as f:
    f.write(work)
check = githash(CC)
assert check == POST, f"CanvasClient post-edit {check} != {POST} - STOP, report"
print(CC, check, "OK")
print("ALL THREE BOUND FILES WRITTEN AND HASH-VERIFIED")
```

### Phase C — gates (§6), commit (bound message), STOP

Do not start PATCH-050.

---

## 6. Post-edit gates (ALL must pass before commit)

### 6.1 Hashes

```bash
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts    # df0ecca9f284ba8656f620f7b29aa628c0830e98
git hash-object lib/infra/supabase/postsRaw.ts                          # fc7a159bdb067edd007669bf0b42b7b438c1e241
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"            # 42810831013fb3217cc943bed7382a5fdad0f5d4
```

Plus ALL SIXTEEN MUST-NOT-CHANGE hashes from §1, unchanged.

### 6.2 Censuses (simulation-measured; plain `grep -c`)

```bash
C="app/dashboard/canvas/[id]/CanvasClient.tsx"
grep -c "deletePadletByIdRaw" "$C"            # 0   (EXTINCT)
grep -c "deletePostSwallowResolved" "$C"      # 3   (destructure + sites A and B)
grep -c "deletePostOrThrow" "$C"              # 3   (destructure + site C + deps)
grep -c "createDeletePostCommand" "$C"        # 4   (unchanged — pre-existing sites untouched)
grep -c "containerError" "$C"                 # 4   (site C's two lines died; the four insertPadlet-family survivors untouched)
grep -c "insertPadlet" "$C"                   # 17  (unchanged)
grep -c "updatePadletById" "$C"               # 9   (unchanged — incl. the L5903 JSX prop)
grep -c "supabase" "$C"                       # 27  (unchanged)
wc -l "$C"                                    # 8383   (the −1: never-grow satisfied by SHRINK)
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "deletePostRowById" "$H"              # 0   (EXTINCT)
grep -c "deletePadletByIdRaw" "$H"            # 0   (EXTINCT)
grep -c "createDeletePostCommand" "$H"        # 3   (import + 2 instantiations)
grep -c "deletePostSwallowResolved" "$H"      # 2   (declaration + return)
grep -c "deletePostOrThrow" "$H"              # 2   (declaration + return)
grep -c "code === 'unknown'" "$H"             # 2   (updateDrawingLayoutPadlet + the contract-1 helper)
grep -c "insertPostRow" "$H"                  # 4   (unchanged)
grep -c "updatePostRowById" "$H"              # 2   (unchanged)
grep -c "supabase" "$H"                       # 8   (unchanged)
grep -c "markPadletLocallyModified" "$H"      # 5   (unchanged)
wc -l "$H"                                    # 677
R=lib/infra/supabase/postsRaw.ts
grep -c "deletePostRowById(" "$R"             # 0   (the paren instrument — the plain-name count is 1→1, comment-only, §0.5)
grep -c "export function" "$R"                # 3
wc -l "$R"                                    # 44
grep -rn "deletePostRowById(" --include="*.ts" --include="*.tsx" lib components app | grep -v node_modules | wc -l   # 0
grep -rn "deletePadletByIdRaw" --include="*.ts" --include="*.tsx" lib components app | grep -v node_modules | wc -l  # 0
grep -rn "deletePostSwallowResolved\|deletePostOrThrow" --include="*.ts" --include="*.tsx" lib components app | grep -v node_modules | wc -l   # 9
```

### 6.3 Scope + untouched gates

```bash
git status --short   # exactly THREE modified paths; ANY other path = STOP
git diff --stat -- lib/domain lib/infra/canvas components/collabboard/canvas/ui components/collabboard/canvas/hooks/useCanvasLines.ts components/collabboard/canvas/hooks/useCanvasInteractions.ts lib/graph components/graph eslint.boundaries.config.mjs supabase   # nothing
```

### 6.4 Execution gates

```bash
npx tsc --noEmit                          # clean
npm run check:boundaries                  # silent
npx vitest run                            # 251 passed (251), 28 files — UNCHANGED
# port gate: nothing listens on 3000 before you start; own dev server; warm /, /auth, /dashboard;
PW_BASE_URL=http://localhost:3000 npx playwright test   # 27 passed
# stop the server by PID; port 3000 back to 0 listeners; then:
rm -rf .next && npm run verify            # exit 0
```

Commit with the bound message. Do NOT start PATCH-050.

---

## 7. Do NOT

- Do NOT touch the three surviving postsRaw builders (`insertPostRow`,
  `insertPostRowReturning`, `updatePostRowById`) or their hook passthroughs
  (`insertPadlet`, `insertPadletAndSelectSingle`, `updatePadletById`) or ANY
  CanvasClient `{ data, error }` consumer outside the three bound sites —
  they stay raw (the 021/042 exception, re-affirmed §0.1).
- Do NOT touch the L5903 JSX prop hand-off — FreeformPadletCards stays LAST.
- Do NOT add tests, a BestEffort sibling, a toast, or any behavior beyond the
  bound port — both helpers preserve their legacy channels exactly (§0.2).
- Do NOT alter the container-failure throws, the map-pin ordering, the
  `toast.success('Pin deleted')`, or any catch body — all byte-kept.
- Do NOT hand-edit CanvasClient — over-ceiling; extractor-only.
- Do NOT run `git checkout` / `git restore` on any scoped file (autocrlf).
- Do NOT print or read `.env.local` values.
- Do NOT start PATCH-050.
