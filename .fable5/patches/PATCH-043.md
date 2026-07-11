# PATCH-043 — hooks phase slice 6, strangler group 18: the fetchData READ QUARTET onto a NEW selector module (canvasViewReads.ts) — the hooks-phase read idiom set, the canvas_lines aggregate ruling made

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4 acceptable** (Pattern K, eighteenth application — four identical-shape read functions + one contiguous hook region; the differential error contract is fully specified and simulation-proven; see §0.5)
**Pattern:** K + the NEW selector-module category (§0.1 ruling): ONE new infra module + its NEW test file (10 bound tests, the PATCH-037 client-factory-mock harness) + one hook region. ZERO domain changes, ZERO existing-file interface ripple, ZERO behavior authorizations.
**Scope:** THREE files — `lib/infra/canvas/canvasViewReads.ts` (NEW), `lib/infra/canvas/canvasViewReads.test.ts` (NEW), `components/collabboard/canvas/hooks/useCanvasData.ts`.
**Authored:** 2026-07-11 (Fable 5 CTO). Census regenerated FRESH from the tree at commit `cba5e04`; the CTO simulation applied all three canonical files to the working tree and ran the REAL repo gates — `npx tsc --noEmit` CLEAN (the critical gate: the four call-site casts against the real types/collabboard shapes and every byte-kept downstream consumer), `npm run check:boundaries` SILENT, `npx vitest run` **224 passed (224), 26 files** (214 existing + the 10 bound tests, `canvasViewReads.test.ts` listed by name, zero existing pins broken) — then restored byte-exact via `git cat-file blob`.

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. Phase B is the
> bound mechanical extractor in §4 (standard); it writes ALL THREE files.
> §5's OLD/NEW pairs are EXPLANATORY — do not hand-apply. Never edit a
> bound test; STOP and report instead (§8).

---

## 0. CTO rulings

### 0.1 The canvas_lines aggregate ruling + the hooks-phase READ idiom

**Ruling: rendering reads live in SELECTOR modules; only RMW reads that
serve a write command join a table's aggregate.** This is the PATCH-036
distinction applied — 036 put `findMetadataById` INSIDE postsRepository
precisely because it was "an RMW-cycle read serving a write command,
NOT a rendering read", and reserved rendering reads for the hooks
phase. The fetchData quartet is the canonical composite-view rendering
read (one view assembling four tables), so it becomes ONE selector
module — `lib/infra/canvas/canvasViewReads.ts` — rather than four
aggregate methods. CLAUDE.md rule 1 names the category explicitly:
"Reads via repositories/selectors."

Consequences:

- **The canvas_lines read does NOT become the future lines aggregate's
  first method.** Family 4's aggregate is born WRITE-side (the five
  line-write sites + useCanvasLines' insert; the workspace hand-off
  rides that patch, standing ruling honored).
- **The alternative was rejected on measured cost:** extending the four
  aggregates would touch four domain interface files AND every domain
  test fake implementing them (posts.test.ts's createFakeRepository
  alone), a ~16-file patch for four one-statement reads. The selector
  module costs three files with zero ripple.
- The module is plain functions on `createBrowserSupabaseClient()` (the
  authState/postsRaw style — no class, no domain interface), with the
  narrow structural client interface + factory double-cast idiom.
- FENCE: consumers = useCanvasData.fetchData; future rendering reads
  may join the module; write operations may NOT (commands own writes).

### 0.2 The differential error contract, ported channel-by-channel

The quartet's legacy contract (verified against the live tree):

| Channel | Legacy | Port |
|---|---|---|
| Sequential ordering | four awaits run IN ORDER; a RESOLVED error on any read still lets the later reads run (checks happen after all four); a THROWN error aborts the reads after it and rejects into fetchData's catch | IDENTICAL: the selector functions return Result for resolved errors (all four awaits complete) and deliberately DO NOT CATCH thrown errors (the 037 no-catch doctrine) — a thrown failure rejects the same await position and aborts what follows |
| boards (canvas) error | `if (canvasError) { console.error('Error fetching canvas:', canvasError); throw canvasError; }` → fetchData's catch → `setError('Failed to load canvas.')` | `if (!canvasResult.ok) { console.error(...cause ?? error); throw cause ?? error; }` — the ORIGINAL supabase error object logged and thrown, reaching the same catch |
| padlets error | same shape, 'Error fetching padlets:' | same port, `padletsResult` |
| lines error | DELIBERATELY UNTHROWN (`// Don't throw on lineError - table may not exist yet`); lineData null → `(lineData \|\| [])` → setLines([]) | `const lineData = linesResult.ok ? (…) : null;` — the established destructure-ignores-error collapse; the comment is kept with ONE disclosed rewording (`lineError` no longer exists as a name: "Don't throw on a failed lines read - table may not exist yet") |
| sections error | NEVER READ (`sectionError` destructured, unused); sectionData null → `sectionData \|\| []` → [] | `const sectionData = sectionsResult.ok ? (…) : null;` — same collapse; the unused-variable oddity dissolves (nothing to preserve: the variable was dead) |
| board not-found | maybeSingle → canvasData null, NO error → `setCanvas(null)` | `findBoardById` returns ok(null) → `canvasData` null → identical |

Downstream of the four collapse lines, EVERYTHING is byte-kept:
`setCanvas(canvasData)`, `let nextSections = sectionData || [];`,
`let nextPadlets = padletData || [];`, the ENTIRE section-recovery
cluster (Family 2 — its raw insert, raw update loop, toast.warning,
synthetic fallback, and both `(padlet.metadata as any)` casts stay
UNTOUCHED in this patch), the empty-note filter, and the
`layer_plane ?? 'front'` normalization.

### 0.3 The four call-site casts (bound, censused)

The legacy client was `createClientComponentClient<any>`, so the four
row sets flowed downstream as `any`. The selector returns honest
`Record<string, unknown>` shapes, so the call site restores the exact
types the legacy code believed it had, via four bound double-casts:

```
canvasResult.value as unknown as Canvas | null
padletsResult.value as unknown as Padlet[]
linesResult.value as unknown as CanvasLine[]      (inside the ok-ternary)
sectionsResult.value as unknown as BoardSection[] (inside the ok-ternary)
```

All four target types were ALREADY imported by the hook (its existing
type import line — untouched). `as unknown as` census in the hook: 1→5
(the synthetic-fallback cast is the pre-existing 1). This is the same
honest-restoration reasoning as the CanvasClient swaps' named casts;
compile-proven in the simulation against the real types/collabboard
shapes (incl. `layer_plane ?? 'front'` on the now-typed CanvasLine
rows and the recovery block's field accesses on typed Padlet rows).

### 0.4 Family 2 (section-recovery) — analyzed, DEFERRED BY NAME

The recovery cluster stays byte-untouched in this patch. Its future
slice (the natural PATCH-044): the array insert
(`insert(recoveryPayload).select('*')` — returns ALL inserted rows, a
NEW shape vs sectionsRepository's existing single-row insertSection)
joins the sections aggregate as an RMW insert-returning method (it
feeds the remap — that's a write's read-back, aggregate territory per
§0.1); the padlet update loop maps onto the EXISTING
`canvas.updatePostMetadataBestEffort` (exact `{ metadata, updated_at }`
column shape) with the 032 per-element fail-fast wrappers; the
toast.warning and synthetic-sections fallback stay byte-kept at the
call site. Interface ripple: sections.ts + its fakes only — a normal
5-file patch. NOT authored now (the owner's one-slice instruction).

### 0.5 Model + census effects

**GPT-5.4 acceptable**: four identical-shape read functions, one
contiguous hook region, all channels simulation-proven (tsc clean,
boundaries silent, **224 passed (224), 26 files** green — 10 new tests + 214
existing, zero pins broken), then the tree restored byte-exact. ZERO
new casts beyond the four bound in §0.3. Hook: 635→632 lines;
`.from(` 11→7 — instrument disclosure: BOTH numbers include the
recovery block's `Array.from(` (a pre-existing false positive on both
sides of the gate); `supabase` lines 18→14; `'boards'` 1→0. The new
test file uses the PATCH-037 client-factory-mock harness
(`vi.mock('../supabase/browserClient')`) with a fake builder that is
both awaitable AND `.maybeSingle()`-chainable (mirroring the real
thenable). Grandfather stays 2. Remaining after this patch: Family 2
(§0.4), Family 4 (lines writes + useCanvasLines param + workspace
rider), FreeformGraphRepo (after the lines/read families, standing),
FreeformPadletCards LAST, realtime CTO-only.

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # cba5e04 (or a descendant touching none of the scoped/must-not-change files)
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts   # 794d3efc856e391e79c5edbc10d38f4037f7e453
ls lib/infra/canvas/canvasViewReads.ts lib/infra/canvas/canvasViewReads.test.ts 2>/dev/null   # must print NOTHING (neither exists)
```

MUST-NOT-CHANGE hashes (re-checked after the edit in §6):

```bash
git hash-object lib/domain/canvas/posts.ts                                      # fdc5fd153b5a4689a29c086652fc9411f9074b09
git hash-object lib/domain/canvas/posts.test.ts                                 # affd371dacd6607be415304f981ec938d6fb6be8
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028
git hash-object lib/infra/canvas/boardRepository.ts                             # c9aca246004286db3119f2af7e05422126e4ee82
git hash-object lib/infra/canvas/sectionsRepository.ts                          # 95a01a07491da9d9a62e4d9a1008af1426eec94d
git hash-object lib/infra/supabase/postsRaw.ts                                  # 9aa0f6eacd8d3b9b5f95614f9d831f6a10a5bcf5
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 57a56ef8595c8ebc4b655a1fd811904049bbd155
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts           # cff23229dcbeb76a93d46d75b6b13a6aa351f07a
```

Hook census (measured FRESH 2026-07-11 at `cba5e04`):

```bash
H="components/collabboard/canvas/hooks/useCanvasData.ts"
wc -l "$H"                                # 635
grep -c '^[[:space:]]*$' "$H"             # 78
grep -c "\.from(" "$H"                    # 11  (incl. the recovery block's Array.from( — pre-existing instrument false positive)
grep -c "'boards'" "$H"                   # 1
grep -c "'canvas_lines'" "$H"             # 5
grep -c "'board_sections'" "$H"           # 2
grep -c "'padlets'" "$H"                  # 3   (read + recovery update + the channel's table:)
grep -c "supabase" "$H"                   # 18
grep -c "as unknown as" "$H"              # 1   (the synthetic-fallback cast)
grep -c "findBoardById\|findPostsByBoardId\|findLinesByBoardId\|findSectionsByBoardId\|canvasViewReads" "$H"   # 0
```

Collision gate (must print nothing):

```bash
grep -rn "canvasViewReads\|findBoardById\|findPostsByBoardId\|findLinesByBoardId\|findSectionsByBoardId" lib components app --include="*.ts" --include="*.tsx" | grep -v excalidraw_fork
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 25 files, 214 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE — `lib/infra/canvas/canvasViewReads.ts` (NEW, whole file, exact, 111 lines; post-edit hash `a57714002bd65ea493776904ca01748d64bf3bed`)

```ts
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

/**
 * PATCH-043: the canvas view's RENDERING READS - the fetchData quartet
 * (board / posts / lines / sections) as a SELECTOR module.
 *
 * RULING (the hooks-phase read idiom): rendering reads that assemble a
 * composite VIEW live in selector modules; only RMW reads that serve a
 * write command join a table's aggregate (the PATCH-036 findMetadataById
 * distinction, applied). The canvas_lines read therefore does NOT become
 * the future lines aggregate's first method - Family 4's aggregate is
 * born write-side.
 *
 * Failure contract (the PATCH-037 no-catch doctrine): resolved supabase
 * errors map to err(unavailable, {cause}); THROWN errors are deliberately
 * NOT caught - they reject into the caller's own catch, preserving the
 * legacy hook's two channels exactly (a thrown failure also aborts the
 * reads that follow it, as the legacy sequential awaits did).
 *
 * Consumers: useCanvasData.fetchData. Future rendering reads may join;
 * write operations may NOT (commands own writes).
 */

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface CanvasViewSupabaseClient {
  from(table: 'boards'): {
    select(columns: '*'): {
      eq(
        column: 'id',
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: SupabaseErrorLike | null;
        }>;
      };
    };
  };
  from(table: 'padlets' | 'canvas_lines' | 'board_sections'): {
    select(columns: '*'): {
      eq(
        column: 'board_id',
        value: string,
      ): PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: SupabaseErrorLike | null;
      }>;
    };
  };
}

function client(): CanvasViewSupabaseClient {
  return createBrowserSupabaseClient() as unknown as CanvasViewSupabaseClient;
}

/** One board row by id, or null when the row is missing (maybeSingle). */
export async function findBoardById(
  id: string,
): Promise<Result<Record<string, unknown> | null, DomainError>> {
  const { data, error } = await client().from('boards').select('*').eq('id', id).maybeSingle();

  if (error) {
    return err(domainError('unavailable', 'Could not load the board', { cause: error }));
  }

  return ok(data);
}

export async function findPostsByBoardId(
  boardId: string,
): Promise<Result<Array<Record<string, unknown>>, DomainError>> {
  const { data, error } = await client().from('padlets').select('*').eq('board_id', boardId);

  if (error) {
    return err(domainError('unavailable', 'Could not load the posts', { cause: error }));
  }

  return ok(data ?? []);
}

export async function findLinesByBoardId(
  boardId: string,
): Promise<Result<Array<Record<string, unknown>>, DomainError>> {
  const { data, error } = await client().from('canvas_lines').select('*').eq('board_id', boardId);

  if (error) {
    return err(domainError('unavailable', 'Could not load the lines', { cause: error }));
  }

  return ok(data ?? []);
}

export async function findSectionsByBoardId(
  boardId: string,
): Promise<Result<Array<Record<string, unknown>>, DomainError>> {
  const { data, error } = await client().from('board_sections').select('*').eq('board_id', boardId);

  if (error) {
    return err(domainError('unavailable', 'Could not load the sections', { cause: error }));
  }

  return ok(data ?? []);
}
```

## 3. BOUND FILES — `lib/infra/canvas/canvasViewReads.test.ts` (NEW, whole file, exact, 205 lines, 10 tests; post-edit hash `d26385c24dcfdb10e8e0e6f705e1c1b5229ed40d`) and `components/collabboard/canvas/hooks/useCanvasData.ts` (whole file, exact, 632 lines; post-edit hash `5704ac3ff1d44b048ff85667f64ac620763cd184`)

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findBoardById,
  findLinesByBoardId,
  findPostsByBoardId,
  findSectionsByBoardId,
} from './canvasViewReads';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

vi.mock('../supabase/browserClient', () => ({
  createBrowserSupabaseClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createBrowserSupabaseClient);

interface FakeResponse {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

interface RecordedCall {
  table: string;
  columns: string;
  filterColumn: string;
  filterValue: string;
  maybeSingle: boolean;
}

/**
 * The fake builder is BOTH awaitable (the three list reads await eq()
 * directly) and .maybeSingle()-chainable (the board read) - mirroring the
 * real builder's thenable shape. The double-cast mirrors the production
 * factory idiom (the authState.test.ts harness, PATCH-037).
 */
function installFakeClient(responses: Record<string, FakeResponse>) {
  const calls: RecordedCall[] = [];
  mockedCreateClient.mockReturnValue({
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(filterColumn: string, filterValue: string) {
              const call: RecordedCall = { table, columns, filterColumn, filterValue, maybeSingle: false };
              calls.push(call);
              const response = responses[table];
              return Object.assign(Promise.resolve(response), {
                maybeSingle: async () => {
                  call.maybeSingle = true;
                  return response;
                },
              });
            },
          };
        },
      };
    },
  } as unknown as ReturnType<typeof createBrowserSupabaseClient>);
  return calls;
}

beforeEach(() => {
  mockedCreateClient.mockReset();
});

describe('findBoardById', () => {
  it('selects * from boards filtered by id via maybeSingle and returns the row', async () => {
    const row = { id: 'board-1', layout: 'grid' };
    const calls = installFakeClient({ boards: { data: row, error: null } });

    const result = await findBoardById('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(row);
    }
    expect(calls).toEqual([
      { table: 'boards', columns: '*', filterColumn: 'id', filterValue: 'board-1', maybeSingle: true },
    ]);
  });

  it('returns ok(null) when the row is missing', async () => {
    installFakeClient({ boards: { data: null, error: null } });

    const result = await findBoardById('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('maps a resolved supabase error to unavailable carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    installFakeClient({ boards: { data: null, error: supabaseError } });

    const result = await findBoardById('board-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('findPostsByBoardId', () => {
  it('selects * from padlets filtered by board_id and returns the rows', async () => {
    const rows = [{ id: 'post-1' }, { id: 'post-2' }];
    const calls = installFakeClient({ padlets: { data: rows, error: null } });

    const result = await findPostsByBoardId('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(rows);
    }
    expect(calls).toEqual([
      { table: 'padlets', columns: '*', filterColumn: 'board_id', filterValue: 'board-1', maybeSingle: false },
    ]);
  });

  it('collapses null data to an empty list', async () => {
    installFakeClient({ padlets: { data: null, error: null } });

    const result = await findPostsByBoardId('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('maps a resolved supabase error to unavailable carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    installFakeClient({ padlets: { data: null, error: supabaseError } });

    const result = await findPostsByBoardId('board-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('findLinesByBoardId', () => {
  it('selects * from canvas_lines filtered by board_id and returns the rows', async () => {
    const rows = [{ id: 'line-1' }];
    const calls = installFakeClient({ canvas_lines: { data: rows, error: null } });

    const result = await findLinesByBoardId('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(rows);
    }
    expect(calls).toEqual([
      { table: 'canvas_lines', columns: '*', filterColumn: 'board_id', filterValue: 'board-1', maybeSingle: false },
    ]);
  });

  it('maps a resolved supabase error to unavailable carrying the cause', async () => {
    const supabaseError = { code: '42P01', message: 'relation does not exist' };
    installFakeClient({ canvas_lines: { data: null, error: supabaseError } });

    const result = await findLinesByBoardId('board-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('findSectionsByBoardId', () => {
  it('selects * from board_sections filtered by board_id and returns the rows', async () => {
    const rows = [{ id: 7, position: 0 }];
    const calls = installFakeClient({ board_sections: { data: rows, error: null } });

    const result = await findSectionsByBoardId('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(rows);
    }
    expect(calls).toEqual([
      { table: 'board_sections', columns: '*', filterColumn: 'board_id', filterValue: 'board-1', maybeSingle: false },
    ]);
  });

  it('maps a resolved supabase error to unavailable carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    installFakeClient({ board_sections: { data: null, error: supabaseError } });

    const result = await findSectionsByBoardId('board-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
```

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

## 4. Phase B — the BOUND MECHANICAL EXTRACTOR (standard; writes ALL THREE files)

Run from the repo root with `python3`. Any assert = STOP and report.
Verify hashes ONLY with `git hash-object` (raw-sha1-over-CRLF rule).

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-043.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-043.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)
targets = [
    ("lib/infra/canvas/canvasViewReads.ts", "a57714002bd65ea493776904ca01748d64bf3bed"),
    ("lib/infra/canvas/canvasViewReads.test.ts", "d26385c24dcfdb10e8e0e6f705e1c1b5229ed40d"),
    ("components/collabboard/canvas/hooks/useCanvasData.ts", "5704ac3ff1d44b048ff85667f64ac620763cd184"),
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
print("ALL THREE BOUND FILES WRITTEN AND HASH-VERIFIED")
```

## 5. The hook's edits, for review (two regions — EXPLANATORY; §4 is how you implement)

### §5a — import block (directly after the postsRaw import)

OLD:

```ts
} from '@/lib/infra/supabase/postsRaw';
```

NEW:

```ts
} from '@/lib/infra/supabase/postsRaw';
import {
  findBoardById,
  findLinesByBoardId,
  findPostsByBoardId,
  findSectionsByBoardId,
} from '@/lib/infra/canvas/canvasViewReads';
```

### §5b — the quartet block (the four reads + differential checks + the four typed collapses; every line BELOW the collapses is byte-kept, incl. the whole Family 2 recovery cluster)

OLD:

```ts
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
```

NEW:

```ts
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
```

---

## 6. Post-edit gates (hashes FIRST; any mismatch = STOP)

### 6.0 Byte-identity (PRIMARY)

```bash
git hash-object lib/infra/canvas/canvasViewReads.ts                     # a57714002bd65ea493776904ca01748d64bf3bed
git hash-object lib/infra/canvas/canvasViewReads.test.ts                # d26385c24dcfdb10e8e0e6f705e1c1b5229ed40d
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts   # 5704ac3ff1d44b048ff85667f64ac620763cd184
git hash-object lib/domain/canvas/posts.ts                                      # fdc5fd153b5a4689a29c086652fc9411f9074b09   (MUST-NOT-CHANGE)
git hash-object lib/domain/canvas/posts.test.ts                                 # affd371dacd6607be415304f981ec938d6fb6be8   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/boardRepository.ts                             # c9aca246004286db3119f2af7e05422126e4ee82   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/sectionsRepository.ts                          # 95a01a07491da9d9a62e4d9a1008af1426eec94d   (MUST-NOT-CHANGE)
git hash-object lib/infra/supabase/postsRaw.ts                                  # 9aa0f6eacd8d3b9b5f95614f9d831f6a10a5bcf5   (MUST-NOT-CHANGE)
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 57a56ef8595c8ebc4b655a1fd811904049bbd155   (MUST-NOT-CHANGE)
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065   (MUST-NOT-CHANGE)
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts           # cff23229dcbeb76a93d46d75b6b13a6aa351f07a   (MUST-NOT-CHANGE)
git ls-files --eol -- components/collabboard/canvas/hooks/useCanvasData.ts
# i/lf    w/lf
```

### 6.1 Censuses (simulation-measured; plain `grep -c`)

```bash
H="components/collabboard/canvas/hooks/useCanvasData.ts"
wc -l "$H"                                # 632
grep -c '^[[:space:]]*$' "$H"             # 78
grep -c "\.from(" "$H"                    # 7   (4 canvas_lines writes + recovery insert + recovery update + Array.from — the pre-existing false positive, disclosed)
grep -c "'boards'" "$H"                   # 0   (read EXTINCT)
grep -c "'canvas_lines'" "$H"             # 4   (the Family 4 write sites only)
grep -c "'board_sections'" "$H"           # 1   (the Family 2 recovery insert only)
grep -c "'padlets'" "$H"                  # 2   (recovery update + the channel's table:)
grep -c "supabase" "$H"                   # 14
grep -c "as unknown as" "$H"              # 5   (the pre-existing synthetic cast + the four bound §0.3 casts)
grep -c "findBoardById" "$H"              # 2   (1 import + 1 use — same for each sibling below)
grep -c "findPostsByBoardId" "$H"         # 2
grep -c "findLinesByBoardId" "$H"         # 2
grep -c "findSectionsByBoardId" "$H"      # 2
grep -c "markPadletLocallyModified" "$H"  # 5
M="lib/infra/canvas/canvasViewReads.ts"
wc -l "$M"                                # 111
grep -c "export async function" "$M"      # 4
grep -c "createBrowserSupabaseClient" "$M"   # 2   (1 import + the client() body line)
grep -c "  it(" lib/infra/canvas/canvasViewReads.test.ts   # 10
```

### 6.2 Scope + untouched gates

```bash
git status --short   # exactly THREE paths: M the hook + the two new files; ANY other path = STOP
git diff --stat -- lib/domain lib/infra/canvas/postsRepository.ts lib/infra/canvas/boardRepository.ts lib/infra/canvas/sectionsRepository.ts lib/infra/supabase components/collabboard/canvas/hooks/useCanvasLines.ts components/collabboard/canvas/hooks/useCanvasInteractions.ts "app/dashboard/canvas/\[id\]/CanvasClient.tsx" eslint.boundaries.config.mjs   # nothing
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 7. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** run the §4 extractor (writes all three files), then the §6 gates (hashes first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → ****224 passed (224), 26 files**** with `canvasViewReads.test.ts` LISTED BY NAME in the output (the new-file rule); full Playwright warmed → **27 passed** (board-lifecycle drives fetchData on every board open); stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` all green.

## 8. Commit ritual

```bash
git add lib/infra/canvas/canvasViewReads.ts lib/infra/canvas/canvasViewReads.test.ts components/collabboard/canvas/hooks/useCanvasData.ts
git status --short   # exactly 3 staged lines (2 A + 1 M); anything else = STOP
git commit -m "refactor(canvas): extract the fetchData read quartet onto the new canvasViewReads selector -- hooks read idiom set, canvas_lines aggregate ruled write-side, differential error contract ported exactly, hooks slice 6, Pattern K (PATCH-043)" -- lib/infra/canvas/canvasViewReads.ts lib/infra/canvas/canvasViewReads.test.ts components/collabboard/canvas/hooks/useCanvasData.ts
```

## 9. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
casts, message strings, test counts. Pre-declared (confirm, don't
re-justify): the four §0.3 double-casts (`as unknown as` 1→5); the ONE
comment rewording (`lineError` → "a failed lines read", §0.2); the dead
`sectionError` variable dissolving (nothing read it); the `Array.from(`
census false positive (both sides); the selector's error strings are
NEW and unreachable at this call site for lines/sections (results
collapsed) and cause-unwrapped for boards/padlets; wc 635→632; ZERO
test edits to existing files.

STOP if: any §1 gate mismatches (incl. either new file already
existing); the §4 extractor asserts; any §6.0 hash mismatches;
`git status --short` shows ANY path beyond the three scoped files; any
MUST-NOT-CHANGE hash moved; tsc/boundaries/unit/e2e fail beyond the
stale-`.next/types` cure.

Do NOT: touch the section-recovery cluster (Family 2, §0.4 — its raw
insert, raw update loop, toast, synthetic fallback all stay), the
realtime channel, any line-write site, useCanvasLines,
useCanvasInteractions, CanvasClient, postsRaw.ts, or ANY domain or
existing infra file; add write operations or classes to the selector
module; catch thrown errors in the selector functions (the no-catch
contract is load-bearing); edit any existing test; create files beyond
the two; de-lint types; chase the grandfather list (stays 2).
