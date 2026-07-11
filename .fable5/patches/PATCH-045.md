# PATCH-045 — hooks slice 8: the lines WRITE family onto the new canvas lines aggregate (Family 4 dispositioned; useCanvasLines goes supabase-free; the workspace hand-off rides)

**Status:** SPEC READY — implement exactly as bound below.
**Implementer:** GPT-5.4 acceptable (Pattern K, twentieth application — one new
aggregate with fully bound tests, five consumer swaps of established shapes, and a
three-region mechanical CanvasClient edit applied by the bound extractor).
**Authored:** 2026-07-11 at `9784253` by the CTO (Fable 5). All censuses, hashes, and
simulation results below were measured fresh on that tree; the canonical files were
COMPILED AND RUN through the real repo gates before delegation (§0.7).

**Read first:** `.fable5/docs/SKILL.md`, `.fable5/docs/PATCH_REFERENCE.md` (§5.11
Pattern K), then this spec end to end. The LESSONS_LEARNED autocrlf rules apply to
every file operation: never `git checkout/restore` a byte-fenced file; verify hashes
ONLY with `git hash-object`.

**Bound commit message (use EXACTLY, one commit):**

```
refactor(canvas): extract the lines write family onto the new canvas lines aggregate -- Family 4 dispositioned, channel split preserved via error-code discrimination, useCanvasLines goes supabase-free, workspace hand-off rides the freed line, never-grow holds at 8384, hooks slice 8, Pattern K (PATCH-045)
```

---

## 0. CTO rulings and contract analysis

### 0.1 The canvas_lines aggregate ruling (made first, as the owner required)

Family 4's aggregate is **born WRITE-side**, exactly as PATCH-043 ruled: new
`lib/domain/canvas/lines.ts` + `lib/infra/canvas/linesRepository.ts`. The
rendering read stays in `canvasViewReads.ts` untouched (its fence forbids
writes). Four commands, mirroring the posts naming precedent
(`createPost`/`createPostAndSelect`):

| Command | Repo method | Legacy site |
|---|---|---|
| `canvas.createLine` | `insertLine(row)` — plain insert, thenable | duplicateLine |
| `canvas.createLineAndSelect` | `insertLineReturning(row)` — insert().select().single() | useCanvasLines.createLine |
| `canvas.updateLine` | `updateLineById(id, payload)` | updateLine + saveLineToDb (one command serves both) |
| `canvas.deleteLine` | `deleteLineById(id)` | deleteLine |

Row/update payloads pass through VERBATIM as `object` (the `postRowSchema`
precedent) — two of the payloads are dynamic (`Partial<CanvasLine>` and the
full-row duplicate), so the table remains the shape's only validator, exactly
as before. The `updated_at` stamp is command-internal (the standing 032+
fact); `saveLineToDb`'s call-site payload drops its own stamp line (same wire
semantics — the stamp is generated in the command instead), and `updateLine`'s
optimistic LOCAL stamp at the call site is byte-kept.

### 0.2 The failure-contract table (preserve EXACTLY — all simulation-proven)

Every command is **HONEST** — no BestEffort sibling anywhere in this patch,
and the queued P3 swallow family stays at ELEVEN sites. Where the legacy code
swallowed, the call site now deliberately ignores an honest Result (bound
`PRESERVED LEGACY SWALLOW` comments); where the legacy code split channels,
the call site discriminates (§0.3).

| # | Site | Legacy behavior | Ported behavior |
|---|------|-----------------|-----------------|
| 1 | `useCanvasLines.createLine`, RESOLVED insert error | temp-line fallback (`temp-${Date.now()}` id, appended + selected, line mode exited, selection ranges cleared), NO error surfaced | `!result.ok` with code ≠ 'unknown' → the byte-kept temp-line branch |
| 2 | `useCanvasLines.createLine`, THROWN | outer catch → `console.error('Failed to create line:', e)` | code === 'unknown' → `throw result.error.cause ?? result.error` → the SAME byte-kept catch logs the ORIGINAL error |
| 3 | `useCanvasLines.createLine`, success with null row | nothing (the `if (data)` guard) | `result.value` double-cast to `CanvasLine \| null`; the byte-kept `if (data)` guard |
| 4 | `saveLineToDb`, both channels | `if (error) { }` + empty catch — swallowed; `debugCanvasLogger('saveEnd')` fires ONLY on true success | honest command; `if (result.ok)` gates the saveEnd log; failures ignored (bound swallow comment). A BestEffort command would BREAK the saveEnd contract — that is why honest-plus-inaction is the ruled shape |
| 5 | `updateLine`, both channels | same shape as #4 (optimistic update ALWAYS applied first, temp guard, dynamic payload) | same port as #4; the optimistic block and temp guard byte-kept |
| 6 | `deleteLine`, both channels | optimistic filter + `SELECTION_PATCH` dispatch, temp guard, `if (error) { }` + empty catch | honest command, result deliberately unread (bound swallow comment); optimistic block and temp guard byte-kept |
| 7 | `duplicateLine`, RESOLVED insert error | `if (error)` → rollback (filter the optimistic line out) | `!result.ok && result.error.code !== 'unknown'` → the byte-kept rollback |
| 8 | `duplicateLine`, THROWN | empty catch — silent, optimistic line KEPT (stranded until refetch; pre-existing P3 quirk, preserved) | code === 'unknown' → falls through both guards → silent, line kept; the try/catch is BYTE-KEPT (it still guards `crypto.randomUUID` and the optimistic build) |
| 9 | Temp-line guards | `lineId.startsWith('temp-')` skips DB at saveLineToDb/updateLine/deleteLine | byte-kept |
| 10 | Ordering | optimistic-first at updateLine/deleteLine/duplicateLine; DB-first at createLine | unchanged — only the raw statements are swapped |
| 11 | Validation channel | none | zod `z.custom<object>` can only reject a NON-OBJECT row/updates — impossible at these call sites (all payloads are locally built object literals); the 029 standing acceptance. Note the code would route 'validation' like a resolved error (rollback / temp-line branch) — unreachable, disclosed |

### 0.3 The channel-discrimination idiom (NEW, ruled here, pinned by bound tests)

Two sites have split resolved-vs-thrown channels that the owner ordered
preserved and that defineCommand's catch-all would otherwise merge. The
discrimination is exact and under our control end to end:

- the repository maps every RESOLVED supabase error to
  `err(domainError('unavailable', ...))`;
- `defineCommand` maps every THROWN exception to
  `err(domainError('unknown', ..., { cause }))` (lib/domain/core/command.ts,
  MUST-NOT-CHANGE below);
- call sites read `result.error.code === 'unknown'` as "the legacy thrown
  channel" and everything else as "the legacy resolved channel".

Pinned by the bound test "surfaces a THROWN repository error as code unknown
carrying the original cause" plus the three 'unavailable' pass-through pins.
This preserves the split WITHOUT any behavior authorization — nothing
converges, unlike 041.

### 0.4 The workspace rider + the supabase-parameter retirement (never-grow arithmetic)

`useCanvasLines` loses `supabase: any` (interface field, destructure entry,
and its `createLine` dependency) — the hook goes SUPABASE-FREE. That deletes
CanvasClient's L734 `supabase,` hand-off line (−1), which funds the rider
PATCH-039 §0.1 deferred: `resolveCurrentWorkspace(supabase, user)` → the
EXISTING `resolveWorkspaceForUser(user)` (a pure consumer swap; the wrapper
has existed in fenced `workspaceMembers.ts` since 021, supplies the SAME
cookie/browser client, and `lib/workspace/context.ts` is MUST-NOT-CHANGE), plus
its import line (+1). `resolveCurrentWorkspace` goes EXTINCT in CanvasClient
(2→0: the named import shrinks in place, the call swaps). **CanvasClient:
8,384 → 8,384 — never-grow holds at equality** (the 037 precedent).
CanvasClient is edited ONLY by the bound extractor's three single-occurrence
replacements with pre/post hash asserts — no hand edits, no whole-file fence.

### 0.5 What this patch does NOT touch (owner instructions honored)

- **Realtime stays CTO-only**: the hook's channel block (`supabase.channel`,
  `removeChannel`, the `table: 'padlets'` subscription) is byte-untouched;
  useCanvasData KEEPS its client memo for exactly that block (`supabase` 12→8).
- **postsRaw shrink-down is NOT this seam** (ruled): its four functions serve
  PADLETS-table delegations consumed by CanvasClient's padlet flows — a
  different table, a different aggregate, dying per-consumer in later slices.
  Nothing here touches them (`postsRaw.ts` MUST-NOT-CHANGE).
- FreeformGraphRepo after the lines/read families; FreeformPadletCards LAST.

### 0.6 Bound casts and instrument disclosures

- ONE new double-cast, bound: `result.value as unknown as CanvasLine | null`
  in useCanvasLines.createLine (restores the legacy any-flow type;
  `as unknown as` 0→1 there; useCanvasData stays 6→6 — zero new casts).
- CanvasClient `supabase` census 30→29, NOT 28: the new import line's PATH
  contains the substring (`@/lib/infra/supabase/workspaceMembers`) — the 042
  import-path disclosure class.
- useCanvasData `.from(` 5→1: the survivor is the recovery block's
  `Array.from(` (the standing false positive). `'canvas_lines'` 4→0.
- The dead empty try/catch shells around saveLineToDb/updateLine/deleteLine
  are REMOVED (commands never throw); duplicateLine's and createLine's
  try/catch are BYTE-KEPT (each still carries a live channel).

### 0.7 Simulation results (CTO, in-tree, this exact canonical content)

tsc `--noEmit` CLEAN (the object-passthrough schemas against every call
site's payload, the retired parameter, the CanvasClient swaps);
`npm run check:boundaries` SILENT; vitest **245 passed (245), 28 files** —
230 existing + 15 new (lines.test.ts 9, linesRepository.test.ts 6), zero pins
broken. Tree restored byte-exact via `git cat-file blob` + no-op `git add`.

### 0.8 One slice, no split

The seam is a single dependency chain: aggregate → five consumer swaps →
signature retirement → freed hand-off line → rider. Splitting would strand an
aggregate without consumers or spend the never-grow offset twice. PATCH-046
is NOT drafted.

---

## 1. Pre-edit bindings (verify FIRST; any mismatch = STOP, report, do not improvise)

```bash
git status --short   # nothing
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts    # 7f344aa0109fdabfc4c6b18326891b3a118e7c43   (637 lines)
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts   # cff23229dcbeb76a93d46d75b6b13a6aa351f07a   (148 lines)
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"             # 57a56ef8595c8ebc4b655a1fd811904049bbd155   (8,384 lines)
ls lib/domain/canvas/lines.ts 2>/dev/null            # must NOT exist
ls lib/infra/canvas/linesRepository.ts 2>/dev/null   # must NOT exist
```

MUST-NOT-CHANGE set (verify now AND after — all sixteen):

```bash
git hash-object lib/domain/canvas/posts.ts                                      # fdc5fd153b5a4689a29c086652fc9411f9074b09
git hash-object lib/domain/canvas/posts.test.ts                                 # affd371dacd6607be415304f981ec938d6fb6be8
git hash-object lib/domain/canvas/sections.ts                                   # 762c367186716749af21cfd3e9abf79cdafb74c0
git hash-object lib/domain/canvas/sections.test.ts                              # c159670450ece3d657cc6be13bfbe4bd7bbd7ce7
git hash-object lib/domain/core/command.ts                                      # 2e034d8d89acdade824c6f62751996961a8837d9
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028
git hash-object lib/infra/canvas/boardRepository.ts                             # c9aca246004286db3119f2af7e05422126e4ee82
git hash-object lib/infra/canvas/sectionsRepository.ts                          # 229655bd828a4b85aa85205e50c9bf6db56a8d85
git hash-object lib/infra/canvas/sectionsRepository.test.ts                     # 72fe75923ce4905a6e0dfb8c79532164d31e05c2
git hash-object lib/infra/canvas/canvasViewReads.ts                             # a57714002bd65ea493776904ca01748d64bf3bed
git hash-object lib/infra/canvas/canvasViewReads.test.ts                        # d26385c24dcfdb10e8e0e6f705e1c1b5229ed40d
git hash-object lib/infra/supabase/postsRaw.ts                                  # 9aa0f6eacd8d3b9b5f95614f9d831f6a10a5bcf5
git hash-object lib/infra/supabase/workspaceMembers.ts                          # 8d62ca5e5f33c5df5faa8407cb9d4b5fc8dbdd57
git hash-object lib/workspace/context.ts                                        # 3832406fe9dcd92772e789cc6ccca39e7a4ad565
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
```

Pre-edit censuses (plain `grep -c`, case-sensitive, LINE counts):

```bash
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "\.from(" "$H"                    # 5   (incl. Array.from — the standing false positive)
grep -c "'canvas_lines'" "$H"             # 4
grep -c "supabase" "$H"                   # 12
grep -c "debugCanvasLogger" "$H"          # 6
grep -c "as unknown as" "$H"              # 6
grep -c "'padlets'" "$H"                  # 1
grep -c "markPadletLocallyModified" "$H"  # 5
L=components/collabboard/canvas/hooks/useCanvasLines.ts
grep -c "supabase" "$L"                   # 4
grep -c "\.from(" "$L"                    # 1
grep -c "'canvas_lines'" "$L"             # 1
grep -c "as unknown as" "$L"              # 0
grep -c "temp-" "$L"                      # 1
C="app/dashboard/canvas/[id]/CanvasClient.tsx"
grep -c "resolveCurrentWorkspace" "$C"    # 2
grep -c "resolveWorkspaceForUser" "$C"    # 0
grep -c "supabase" "$C"                   # 30
grep -c "useCanvasLines" "$C"             # 2
```

Collision gate (repo-wide, MUST be 0 pre-edit):

```bash
grep -rn "createCreateLineCommand\|createCreateLineAndSelectCommand\|createUpdateLineCommand\|createDeleteLineCommand\|createLinesRepository\|LinesRepository\|lineRowSchema\|lineUpdatesSchema\|SupabaseLinesRepository\|insertLineReturning\|updateLineById\|deleteLineById" --include="*.ts" --include="*.tsx" lib components app | grep -v node_modules | wc -l   # 0
```

---

## 2. BOUND FILE — `lib/domain/canvas/lines.ts` (NEW, whole file, exact, 90 lines; post-edit hash `96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5`)

```ts
import { z } from 'zod';
import { defineCommand } from '../core/command';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';

/**
 * PATCH-045: the canvas_lines WRITE aggregate - born write-side per the
 * PATCH-043 read idiom (the rendering read lives in canvasViewReads.ts and
 * stays there; only writes and their read-backs live here).
 *
 * Row and update payloads pass through VERBATIM as `object` (the
 * postRowSchema precedent): the legacy call sites built these rows against
 * the untyped client and the table is the shape's only validator, exactly
 * as before the extraction.
 *
 * Failure channels: every command is HONEST (the repository Result passes
 * through unchanged; no BestEffort sibling). Call sites that need the
 * legacy resolved-vs-thrown split discriminate on error.code - the
 * repository maps RESOLVED supabase errors to 'unavailable', while
 * defineCommand maps THROWN exceptions to 'unknown' (pinned in the tests).
 */

export const lineRowSchema = z.custom<object>(
  (value) => typeof value === 'object' && value !== null,
);

export const lineUpdatesSchema = z.custom<object>(
  (value) => typeof value === 'object' && value !== null,
);

export interface LinesRepository {
  /** Plain insert - awaited directly, no returning (the duplicate path). */
  insertLine(row: object): Promise<Result<void, DomainError>>;
  /** insert().select().single() - returns the created row (null mirrors the vendor shape). */
  insertLineReturning(
    row: object,
  ): Promise<Result<Record<string, unknown> | null, DomainError>>;
  updateLineById(id: string, payload: object): Promise<Result<void, DomainError>>;
  deleteLineById(id: string): Promise<Result<void, DomainError>>;
}

export const createLineSchema = z.object({
  row: lineRowSchema,
});

export const createCreateLineCommand = (repository: LinesRepository) =>
  defineCommand({
    name: 'canvas.createLine',
    input: createLineSchema,
    execute: async (input) => repository.insertLine(input.row),
  });

export const createLineAndSelectSchema = z.object({
  row: lineRowSchema,
});

export const createCreateLineAndSelectCommand = (repository: LinesRepository) =>
  defineCommand({
    name: 'canvas.createLineAndSelect',
    input: createLineAndSelectSchema,
    execute: async (input) => repository.insertLineReturning(input.row),
  });

export const updateLineSchema = z.object({
  lineId: z.string(),
  updates: lineUpdatesSchema,
});

/** The updated_at stamp is command-internal (the standing PATCH-032+ fact). */
export const createUpdateLineCommand = (repository: LinesRepository) =>
  defineCommand({
    name: 'canvas.updateLine',
    input: updateLineSchema,
    execute: async (input) =>
      repository.updateLineById(input.lineId, {
        ...input.updates,
        updated_at: new Date().toISOString(),
      }),
  });

export const deleteLineSchema = z.object({
  lineId: z.string(),
});

export const createDeleteLineCommand = (repository: LinesRepository) =>
  defineCommand({
    name: 'canvas.deleteLine',
    input: deleteLineSchema,
    execute: async (input) => repository.deleteLineById(input.lineId),
  });
```

## 3. BOUND FILE — `lib/domain/canvas/lines.test.ts` (NEW, whole file, exact, 205 lines, 9 tests; post-edit hash `68b6ffec79e69a9636ed6041d6bb709926449514`)

```ts
import { describe, expect, it } from 'vitest';
import {
  createCreateLineAndSelectCommand,
  createCreateLineCommand,
  createDeleteLineCommand,
  createUpdateLineCommand,
} from './lines';
import type { LinesRepository } from './lines';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const ctx = { userId: null };

function createFakeRepository() {
  const insertCalls: object[] = [];
  const insertReturningCalls: object[] = [];
  const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const deleteCalls: string[] = [];

  let insertResult: Result<void, DomainError> = ok(undefined);
  let insertReturningResult: Result<Record<string, unknown> | null, DomainError> = ok({
    id: 'line-1',
  });
  let updateResult: Result<void, DomainError> = ok(undefined);
  let updateThrows: Error | null = null;
  let deleteResult: Result<void, DomainError> = ok(undefined);

  const repository: LinesRepository = {
    insertLine: async (row) => {
      insertCalls.push(row);
      return insertResult;
    },
    insertLineReturning: async (row) => {
      insertReturningCalls.push(row);
      return insertReturningResult;
    },
    updateLineById: async (id, payload) => {
      if (updateThrows) throw updateThrows;
      updateCalls.push({ id, payload: payload as Record<string, unknown> });
      return updateResult;
    },
    deleteLineById: async (id) => {
      deleteCalls.push(id);
      return deleteResult;
    },
  };

  return {
    repository,
    insertCalls,
    insertReturningCalls,
    updateCalls,
    deleteCalls,
    setInsertResult(result: Result<void, DomainError>) {
      insertResult = result;
    },
    setInsertReturningResult(result: Result<Record<string, unknown> | null, DomainError>) {
      insertReturningResult = result;
    },
    setUpdateResult(result: Result<void, DomainError>) {
      updateResult = result;
    },
    setUpdateThrows(error: Error) {
      updateThrows = error;
    },
    setDeleteResult(result: Result<void, DomainError>) {
      deleteResult = result;
    },
  };
}

describe('canvas.createLine', () => {
  it('passes the row through verbatim (same reference) and returns ok', async () => {
    const fake = createFakeRepository();
    const createLine = createCreateLineCommand(fake.repository);
    const row = { board_id: 'board-9', start_x: 1, end_x: 2 };

    const result = await createLine({ row }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toHaveLength(1);
    expect(fake.insertCalls[0]).toBe(row);
  });

  it('propagates a RESOLVED repository failure unchanged (code unavailable)', async () => {
    const fake = createFakeRepository();
    fake.setInsertResult(err(domainError('unavailable', 'db down')));
    const createLine = createCreateLineCommand(fake.repository);

    const result = await createLine({ row: { board_id: 'board-9' } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects a non-object row without calling the repository', async () => {
    const fake = createFakeRepository();
    const createLine = createCreateLineCommand(fake.repository);

    const result = await createLine({ row: 'not-a-row' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.insertCalls).toHaveLength(0);
  });
});

describe('canvas.createLineAndSelect', () => {
  it('returns the created row from the insert read-back', async () => {
    const fake = createFakeRepository();
    fake.setInsertReturningResult(ok({ id: 'line-42', board_id: 'board-9' }));
    const createLineAndSelect = createCreateLineAndSelectCommand(fake.repository);

    const result = await createLineAndSelect({ row: { board_id: 'board-9' } }, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 'line-42', board_id: 'board-9' });
    }
    expect(fake.insertReturningCalls).toHaveLength(1);
  });
});

describe('canvas.updateLine', () => {
  it('stamps a fresh ISO updated_at over the given updates and routes to the right id', async () => {
    const fake = createFakeRepository();
    const updateLine = createUpdateLineCommand(fake.repository);

    const result = await updateLine(
      { lineId: 'line-7', updates: { color: '#fff', updated_at: 'stale' } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toHaveLength(1);
    expect(fake.updateCalls[0].id).toBe('line-7');
    expect(Object.keys(fake.updateCalls[0].payload).sort()).toEqual(['color', 'updated_at']);
    const stamped = fake.updateCalls[0].payload.updated_at as string;
    expect(stamped).not.toBe('stale');
    expect(new Date(stamped).toISOString()).toBe(stamped);
  });

  it('propagates a RESOLVED repository failure unchanged (code unavailable)', async () => {
    const fake = createFakeRepository();
    fake.setUpdateResult(err(domainError('unavailable', 'db down')));
    const updateLine = createUpdateLineCommand(fake.repository);

    const result = await updateLine({ lineId: 'line-7', updates: { color: '#fff' } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('surfaces a THROWN repository error as code unknown carrying the original cause', async () => {
    // The channel-discrimination pin: call sites tell the legacy
    // resolved-vs-thrown channels apart via error.code ('unavailable' vs
    // 'unknown'). This pins defineCommand's thrown-mode marker AT the
    // lines aggregate.
    const fake = createFakeRepository();
    const networkError = new Error('fetch failed');
    fake.setUpdateThrows(networkError);
    const updateLine = createUpdateLineCommand(fake.repository);

    const result = await updateLine({ lineId: 'line-7', updates: { color: '#fff' } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown');
      expect(result.error.cause).toBe(networkError);
    }
  });
});

describe('canvas.deleteLine', () => {
  it('deletes exactly the given line', async () => {
    const fake = createFakeRepository();
    const deleteLine = createDeleteLineCommand(fake.repository);

    const result = await deleteLine({ lineId: 'line-5' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.deleteCalls).toEqual(['line-5']);
  });

  it('propagates a RESOLVED repository failure unchanged (code unavailable)', async () => {
    const fake = createFakeRepository();
    fake.setDeleteResult(err(domainError('unavailable', 'db down')));
    const deleteLine = createDeleteLineCommand(fake.repository);

    const result = await deleteLine({ lineId: 'line-5' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});
```

## 4. BOUND FILE — `lib/infra/canvas/linesRepository.ts` (NEW, whole file, exact, 89 lines; post-edit hash `1bb11907dfe58ed5ab116f94936304e9ca2ea1be`)

```ts
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { LinesRepository } from '../../domain/canvas/lines';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

/**
 * The insert builder is awaited directly for the plain insert (thenable)
 * and chained .select().single() when the caller consumes the created row -
 * both legacy shapes (the PostsInsertQuery precedent).
 */
interface LinesInsertQuery extends PromiseLike<{ error: SupabaseErrorLike | null }> {
  select(): {
    single(): Promise<{
      data: Record<string, unknown> | null;
      error: SupabaseErrorLike | null;
    }>;
  };
}

interface LinesMutationQuery {
  eq(column: 'id', value: string): Promise<{ error: SupabaseErrorLike | null }>;
}

interface LinesSupabaseClient {
  from(table: 'canvas_lines'): {
    insert(row: object): LinesInsertQuery;
    update(payload: object): LinesMutationQuery;
    delete(): LinesMutationQuery;
  };
}

export class SupabaseLinesRepository implements LinesRepository {
  constructor(private readonly client: LinesSupabaseClient) {}

  async insertLine(row: object): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('canvas_lines').insert(row);

    if (error) {
      return err(domainError('unavailable', 'Could not create the line', { cause: error }));
    }

    return ok(undefined);
  }

  async insertLineReturning(
    row: object,
  ): Promise<Result<Record<string, unknown> | null, DomainError>> {
    const { data, error } = await this.client.from('canvas_lines').insert(row).select().single();

    if (error) {
      return err(domainError('unavailable', 'Could not create the line', { cause: error }));
    }

    return ok(data);
  }

  async updateLineById(id: string, payload: object): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('canvas_lines').update(payload).eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the line', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteLineById(id: string): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('canvas_lines').delete().eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the line', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createLinesRepository(): LinesRepository {
  return new SupabaseLinesRepository(
    createBrowserSupabaseClient() as unknown as LinesSupabaseClient,
  );
}
```

## 5. BOUND FILE — `lib/infra/canvas/linesRepository.test.ts` (NEW, whole file, exact, 140 lines, 6 tests; post-edit hash `a9cdb556ed571e9e9a10e41d90336a61d2ee5798`)

```ts
import { describe, expect, it } from 'vitest';
import { SupabaseLinesRepository } from './linesRepository';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(options: {
  insertRow?: Record<string, unknown> | null;
  insertError?: FakeError | null;
  mutationError?: FakeError | null;
} = {}) {
  const { insertRow = { id: 'line-41' }, insertError = null, mutationError = null } = options;
  const insertCalls: object[] = [];
  const updateCalls: object[] = [];
  const eqCalls: Array<{ column: string; value: string }> = [];
  const deleteEqCalls: Array<{ column: string; value: string }> = [];
  const tables: string[] = [];

  const client = {
    from(table: 'canvas_lines') {
      tables.push(table);
      return {
        // The real insert builder is thenable AND .select().single()-chainable.
        insert(row: object) {
          insertCalls.push(row);
          return Object.assign(Promise.resolve({ error: insertError }), {
            select() {
              return {
                single: async () => ({
                  data: insertError ? null : insertRow,
                  error: insertError,
                }),
              };
            },
          });
        },
        update(payload: object) {
          updateCalls.push(payload);
          return {
            eq: async (column: 'id', value: string) => {
              eqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
        delete() {
          return {
            eq: async (column: 'id', value: string) => {
              deleteEqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
      };
    },
  };

  return { client, insertCalls, updateCalls, eqCalls, deleteEqCalls, tables };
}

describe('SupabaseLinesRepository', () => {
  it('inserts the row verbatim into canvas_lines and returns ok', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseLinesRepository(fake.client);
    const row = { board_id: 'board-9', start_x: 1 };

    const result = await repository.insertLine(row);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toHaveLength(1);
    expect(fake.insertCalls[0]).toBe(row);
    expect(fake.tables).toEqual(['canvas_lines']);
  });

  it('returns the created row from insertLineReturning', async () => {
    const fake = createFakeClient({ insertRow: { id: 'line-42', board_id: 'board-9' } });
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.insertLineReturning({ board_id: 'board-9' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 'line-42', board_id: 'board-9' });
    }
  });

  it('maps an insert error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '23503', message: 'fk violation' };
    const fake = createFakeClient({ insertError: supabaseError });
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.insertLine({ board_id: 'board-9' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('updates the payload filtered by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.updateLineById('line-7', {
      color: '#fff',
      updated_at: '2026-07-11T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([{ color: '#fff', updated_at: '2026-07-11T12:00:00.000Z' }]);
    expect(fake.eqCalls).toEqual([{ column: 'id', value: 'line-7' }]);
  });

  it('deletes by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.deleteLineById('line-5');

    expect(result.ok).toBe(true);
    expect(fake.deleteEqCalls).toEqual([{ column: 'id', value: 'line-5' }]);
  });

  it('maps a mutation error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const fake = createFakeClient({ mutationError: supabaseError });
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.updateLineById('line-7', { color: '#fff' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
```

## 6. BOUND FILE — `components/collabboard/canvas/hooks/useCanvasData.ts` (whole file, exact, 638 lines; post-edit hash `3cc658c61cf7676d609b842281e59643b68da6a4`)

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
  createUpdatePostContentBestEffortCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createCreateSectionsCommand } from '@/lib/domain/canvas/sections';
import { createLinesRepository } from '@/lib/infra/canvas/linesRepository';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
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

## 7. BOUND FILE — `components/collabboard/canvas/hooks/useCanvasLines.ts` (whole file, exact, 155 lines; post-edit hash `8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c`)

```ts
"use client";

import { useCallback, useState } from 'react';
import type { CanvasLine } from '@/types/collabboard';
import { createCreateLineAndSelectCommand } from '@/lib/domain/canvas/lines';
import { createLinesRepository } from '@/lib/infra/canvas/linesRepository';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';

interface UseCanvasLinesParams {
  canvasId?: string;
  canvasZoom: number;
  setLines: React.Dispatch<React.SetStateAction<CanvasLine[]>>;
  setSelectedLineId: (v: string | null) => void;
}

export function useCanvasLines({
  canvasId,
  canvasZoom,
  setLines,
  setSelectedLineId,
}: UseCanvasLinesParams) {
  const [lineEditModeId, setLineEditModeId] = useState<string | null>(null);
  const [isLineMode, setIsLineModeState] = useState(false);
  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [lineContextMenuState, setLineContextMenuState] = useState<{
    lineId: string;
    x: number;
    y: number;
  } | null>(null);

  const createLine = useCallback(async (lineData: Omit<CanvasLine, 'id' | 'created_at' | 'updated_at'>) => {
    if (!canvasId) return;

    const newLine = {
      ...lineData,
      board_id: canvasId,
    };

    try {
      const createLineAndSelect = createCreateLineAndSelectCommand(createLinesRepository());
      const result = await createLineAndSelect({ row: newLine }, { userId: null });

      // Channel split PRESERVED (no convergence authorization): a THROWN
      // insert failure carries code 'unknown' out of defineCommand's catch
      // and re-throws its original cause into the catch below (the legacy
      // console.error); a RESOLVED insert error takes the temp-line
      // fallback (the legacy if (error) branch).
      if (!result.ok && result.error.code === 'unknown') {
        throw result.error.cause ?? result.error;
      }

      if (!result.ok) {
        const tempLine: CanvasLine = {
          ...newLine,
          id: `temp-${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setLines(prev => [...prev, tempLine]);
        setSelectedLineId(tempLine.id);
        setIsLineModeState(false);
        setLineEditModeId(null);
        window.getSelection()?.removeAllRanges();
        return;
      }

      const data = result.value as unknown as CanvasLine | null;
      if (data) {
        setLines(prev => [...prev, data]);
        setSelectedLineId(data.id);
        setIsLineModeState(false);
        setLineEditModeId(null);
        window.getSelection()?.removeAllRanges();
      }
    } catch (e) {
      console.error('Failed to create line:', e);
    }
  }, [canvasId, setLines, setSelectedLineId]);

  const createLineFromCoords = useCallback((
    rawStartX: number, rawStartY: number, rawEndX: number, rawEndY: number,
    geoPoints?: { startLng: number; startLat: number; endLng: number; endLat: number }
  ) => {
    const startX = rawStartX / canvasZoom;
    const startY = rawStartY / canvasZoom;
    const endX = rawEndX / canvasZoom;
    const endY = rawEndY / canvasZoom;

    const controlX = (startX + endX) / 2;
    const controlY = Math.min(startY, endY) - 50;

    createLine({
      board_id: canvasId || '',
      start_x: startX,
      start_y: startY,
      control_x: controlX,
      control_y: controlY,
      end_x: endX,
      end_y: endY,
      points: [
        { x: startX, y: startY, type: 'smooth', ...(geoPoints ? { lng: geoPoints.startLng, lat: geoPoints.startLat } : {}) },
        { x: endX, y: endY, type: 'smooth', ...(geoPoints ? { lng: geoPoints.endLng, lat: geoPoints.endLat } : {}) },
      ],
      color: '#374151',
      stroke_width: 2,
      start_arrow: false,
      end_arrow: true,
      dashed: false,
      layer_plane: 'front',
    });
  }, [canvasId, createLine, canvasZoom]);

  /** Reset all line-specific state (edit mode, dragging, context menu). */
  const clearLineState = useCallback(() => {
    setSelectedLineId(null);
    setLineEditModeId(null);
  }, [setSelectedLineId]);

  const handleLineSelect = useCallback((id: string | null) => {
    setSelectedLineId(id);
    if (!id) {
      setLineEditModeId(null);
    }
  }, [setSelectedLineId]);

  const handleToggleLineEditMode = useCallback((id: string | null) => {
    setLineEditModeId(id);
  }, []);

  const handleLineDragChange = useCallback((lineId: string | null) => {
    setDraggingLineId(lineId);
  }, []);

  const setIsLineMode = useCallback((v: boolean) => {
    debugCanvasLogger('selectionChange', { type: 'line_mode', id: v ? 'on' : 'off' });
    setIsLineModeState(v);
  }, []);

  return {
    lineEditModeId,
    setLineEditModeId,
    isLineMode,
    setIsLineMode,
    draggingLineId,
    setDraggingLineId,
    lineContextMenuState,
    setLineContextMenuState,
    createLine,
    createLineFromCoords,
    clearLineState,
    handleLineSelect,
    handleToggleLineEditMode,
    handleLineDragChange,
  };
}
```

---

## 8. BOUND CanvasClient REGIONS (EXTRACTOR INPUT — the 7th through 12th ts fences in spec order, indices 6 through 11 in Phase B's zero-indexed fence list; each OLD occurs EXACTLY ONCE; applied mechanically by Phase B, never by hand)

CanvasClient is 8,384 lines and over-ceiling; it gets NO whole-file fence.
The extractor asserts the pre-edit hash `57a56ef8595c8ebc4b655a1fd811904049bbd155`,
applies these three single-occurrence replacements, and asserts the final
hash `620cc9ac1ad0c528a0c1660c7b2ab8e9f6c66662` (8,384 lines — never-grow at
equality).

### 8.1 The workspace import (1 line → 2 lines)

OLD:

```ts
import { canEditWorkspace, canManageWorkspace, resolveCurrentWorkspace, type WorkspaceRole } from '@/lib/workspace/context';
```

NEW:

```ts
import { canEditWorkspace, canManageWorkspace, type WorkspaceRole } from '@/lib/workspace/context';
import { resolveWorkspaceForUser } from '@/lib/infra/supabase/workspaceMembers';
```

### 8.2 The workspace call (the rider — pure consumer swap)

OLD:

```ts
        const workspace = await resolveCurrentWorkspace(supabase, user);
```

NEW:

```ts
        const workspace = await resolveWorkspaceForUser(user);
```

### 8.3 The useCanvasLines hand-off (the freed line)

OLD:

```ts
  } = useCanvasLines({
    canvasId,
    canvasZoom,
    setLines,
    setSelectedLineId,
    supabase,
  });
```

NEW:

```ts
  } = useCanvasLines({
    canvasId,
    canvasZoom,
    setLines,
    setSelectedLineId,
  });
```

---

## 9. Phase plan

### Phase A — read + verify

Read SKILL.md, PATCH_REFERENCE §5.11, this spec. Run EVERY §1 gate. Any
mismatch: STOP and report; do not improvise.

### Phase B — the bound mechanical extractor (the ONLY write step)

Save the block below as `_p045_extract.py` (repo root) and run
`python3 _p045_extract.py`; then DELETE the script file. It writes the six
whole-file fences (hash-asserted BEFORE writing, LF bytes, re-verified with
`git hash-object`) and then applies the three §8 CanvasClient replacements
with pre/post hash asserts. Do not hand-edit any scoped file; if the
extractor stops, report its output verbatim.

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-045.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-045.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)
targets = [
    ("lib/domain/canvas/lines.ts", "96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5"),
    ("lib/domain/canvas/lines.test.ts", "68b6ffec79e69a9636ed6041d6bb709926449514"),
    ("lib/infra/canvas/linesRepository.ts", "1bb11907dfe58ed5ab116f94936304e9ca2ea1be"),
    ("lib/infra/canvas/linesRepository.test.ts", "a9cdb556ed571e9e9a10e41d90336a61d2ee5798"),
    ("components/collabboard/canvas/hooks/useCanvasData.ts", "3cc658c61cf7676d609b842281e59643b68da6a4"),
    ("components/collabboard/canvas/hooks/useCanvasLines.ts", "8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c"),
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

cc_path = "app/dashboard/canvas/[id]/CanvasClient.tsx"
pre = subprocess.run(["git", "hash-object", cc_path], capture_output=True, text=True).stdout.strip()
assert pre == "57a56ef8595c8ebc4b655a1fd811904049bbd155", f"CanvasClient pre-edit {pre} - STOP, report"
cc = open(cc_path, encoding="utf-8", newline="").read()
assert "\r" not in cc, (
    "CanvasClient working copy is CRLF-smudged; restore it via "
    "git cat-file blob HEAD (binary write), never git checkout, then rerun"
)
for j in range(3):
    old, new = fences[6 + 2 * j], fences[7 + 2 * j]
    n = cc.count(old)
    assert n == 1, f"CanvasClient region {j + 1} occurrence count {n} - STOP, report"
    cc = cc.replace(old, new)
with open(cc_path, "w", encoding="utf-8", newline="") as f:
    f.write(cc)
post = subprocess.run(["git", "hash-object", cc_path], capture_output=True, text=True).stdout.strip()
assert post == "620cc9ac1ad0c528a0c1660c7b2ab8e9f6c66662", f"CanvasClient final {post} - STOP, report"
print(cc_path, post, "OK")
print("ALL SEVEN SCOPED FILES WRITTEN AND HASH-VERIFIED")
```

### Phase C — gates (§11), commit (bound message), STOP

Do not start PATCH-046.

---

## 10. Explanatory recipes (REFERENCE ONLY; Phase B already wrote the exact bytes)

Each OLD block appears EXACTLY ONCE in its pre-edit file. These pairs exist
for reviewer reconstruction and diff comprehension; they are not a write path.

### 10a — useCanvasData imports

OLD:

```ts
import {
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createCreateSectionsCommand } from '@/lib/domain/canvas/sections';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
```

NEW:

```ts
import {
  createCreateLineCommand,
  createDeleteLineCommand,
  createUpdateLineCommand,
} from '@/lib/domain/canvas/lines';
import {
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createCreateSectionsCommand } from '@/lib/domain/canvas/sections';
import { createLinesRepository } from '@/lib/infra/canvas/linesRepository';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
```

### 10b — saveLineToDb (the 18-column payload rides; its stamp line moves into the command)

OLD:

```ts
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
```

NEW:

```ts
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
```

### 10c — updateLine (optimistic block + temp guard byte-kept)

OLD:

```ts
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
```

NEW:

```ts
    debugCanvasLogger('saveStart', { op: 'updateLine', lineId });
    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - only a successful save logs saveEnd. The
    // updated_at stamp is command-internal (canvas.updateLine).
    const updateLineCmd = createUpdateLineCommand(createLinesRepository());
    const result = await updateLineCmd({ lineId, updates }, { userId: null });
    if (result.ok) { debugCanvasLogger('saveEnd', { op: 'updateLine', lineId }); }
  }, []);
```

### 10d — deleteLine

OLD:

```ts
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
```

NEW:

```ts
    // Skip DB delete for temp lines
    if (lineId.startsWith('temp-')) return;

    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - the optimistic removal stands either way.
    const deleteLineCmd = createDeleteLineCommand(createLinesRepository());
    await deleteLineCmd({ lineId }, { userId: null });
  }, [dispatch]);
```

### 10e — duplicateLine (rollback byte-kept behind the discrimination guard; try/catch byte-kept)

OLD:

```ts
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
```

NEW:

```ts
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
```

### 10f — useCanvasLines imports

OLD:

```ts
import { useCallback, useState } from 'react';
import type { CanvasLine } from '@/types/collabboard';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
```

NEW:

```ts
import { useCallback, useState } from 'react';
import type { CanvasLine } from '@/types/collabboard';
import { createCreateLineAndSelectCommand } from '@/lib/domain/canvas/lines';
import { createLinesRepository } from '@/lib/infra/canvas/linesRepository';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
```

### 10g — the interface (the parameter retires)

OLD:

```ts
  setSelectedLineId: (v: string | null) => void;
  supabase: any;
}
```

NEW:

```ts
  setSelectedLineId: (v: string | null) => void;
}
```

### 10h — the destructure

OLD:

```ts
  setLines,
  setSelectedLineId,
  supabase,
}: UseCanvasLinesParams) {
```

NEW:

```ts
  setLines,
  setSelectedLineId,
}: UseCanvasLinesParams) {
```

### 10i — createLine (temp-line branch and catch byte-kept; deps lose supabase)

OLD:

```ts
    try {
      const { data, error } = await supabase
        .from('canvas_lines')
        .insert(newLine)
        .select()
        .single();

      if (error) {
        const tempLine: CanvasLine = {
          ...newLine,
          id: `temp-${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setLines(prev => [...prev, tempLine]);
        setSelectedLineId(tempLine.id);
        setIsLineModeState(false);
        setLineEditModeId(null);
        window.getSelection()?.removeAllRanges();
        return;
      }

      if (data) {
        setLines(prev => [...prev, data]);
        setSelectedLineId(data.id);
        setIsLineModeState(false);
        setLineEditModeId(null);
        window.getSelection()?.removeAllRanges();
      }
    } catch (e) {
      console.error('Failed to create line:', e);
    }
  }, [canvasId, supabase, setLines, setSelectedLineId]);
```

NEW:

```ts
    try {
      const createLineAndSelect = createCreateLineAndSelectCommand(createLinesRepository());
      const result = await createLineAndSelect({ row: newLine }, { userId: null });

      // Channel split PRESERVED (no convergence authorization): a THROWN
      // insert failure carries code 'unknown' out of defineCommand's catch
      // and re-throws its original cause into the catch below (the legacy
      // console.error); a RESOLVED insert error takes the temp-line
      // fallback (the legacy if (error) branch).
      if (!result.ok && result.error.code === 'unknown') {
        throw result.error.cause ?? result.error;
      }

      if (!result.ok) {
        const tempLine: CanvasLine = {
          ...newLine,
          id: `temp-${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setLines(prev => [...prev, tempLine]);
        setSelectedLineId(tempLine.id);
        setIsLineModeState(false);
        setLineEditModeId(null);
        window.getSelection()?.removeAllRanges();
        return;
      }

      const data = result.value as unknown as CanvasLine | null;
      if (data) {
        setLines(prev => [...prev, data]);
        setSelectedLineId(data.id);
        setIsLineModeState(false);
        setLineEditModeId(null);
        window.getSelection()?.removeAllRanges();
      }
    } catch (e) {
      console.error('Failed to create line:', e);
    }
  }, [canvasId, setLines, setSelectedLineId]);
```

---

## 11. Post-edit gates (ALL must pass before commit)

### 11.1 Hashes

```bash
git hash-object lib/domain/canvas/lines.ts                               # 96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5
git hash-object lib/domain/canvas/lines.test.ts                          # 68b6ffec79e69a9636ed6041d6bb709926449514
git hash-object lib/infra/canvas/linesRepository.ts                      # 1bb11907dfe58ed5ab116f94936304e9ca2ea1be
git hash-object lib/infra/canvas/linesRepository.test.ts                 # a9cdb556ed571e9e9a10e41d90336a61d2ee5798
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts     # 3cc658c61cf7676d609b842281e59643b68da6a4
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts    # 8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"             # 620cc9ac1ad0c528a0c1660c7b2ab8e9f6c66662
```

Plus ALL SIXTEEN MUST-NOT-CHANGE hashes from §1, unchanged.

### 11.2 Censuses (simulation-measured; plain `grep -c`)

```bash
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "\.from(" "$H"                    # 1   (Array.from ONLY — the standing false positive; canvas_lines writes EXTINCT)
grep -c "'canvas_lines'" "$H"             # 0
grep -c "supabase" "$H"                   # 8   (import/memo/comments + the realtime channel block, CTO-only)
grep -c "createUpdateLineCommand" "$H"    # 3   (import + saveLineToDb + updateLine)
grep -c "createDeleteLineCommand" "$H"    # 2   (import + deleteLine)
grep -c "createCreateLineCommand" "$H"    # 2   (import + duplicateLine)
grep -c "createLinesRepository" "$H"      # 5   (import + four call sites)
grep -c "PRESERVED LEGACY SWALLOW" "$H"   # 3
grep -c "debugCanvasLogger" "$H"          # 6   (saveStart/saveEnd contracts intact)
grep -c "as unknown as" "$H"              # 6   (unchanged — zero new casts here)
grep -c "'padlets'" "$H"                  # 1   (the realtime channel table: only)
grep -c "markPadletLocallyModified" "$H"  # 5
grep -c '^[[:space:]]*$' "$H"             # 74
wc -l "$H"                                # 638
L=components/collabboard/canvas/hooks/useCanvasLines.ts
grep -c "supabase" "$L"                   # 0   (the hook is SUPABASE-FREE)
grep -c "\.from(" "$L"                    # 0
grep -c "'canvas_lines'" "$L"             # 0
grep -c "createCreateLineAndSelectCommand" "$L"   # 2
grep -c "createLinesRepository" "$L"      # 2
grep -c "as unknown as" "$L"              # 1   (the one bound §0.6 cast)
grep -c "temp-" "$L"                      # 2   (the byte-kept temp- id line + the NEW comment's "temp-line fallback" wording — instrument disclosure)
grep -c "code === 'unknown'" "$L"         # 1
wc -l "$L"                                # 155
C="app/dashboard/canvas/[id]/CanvasClient.tsx"
grep -c "resolveCurrentWorkspace" "$C"    # 0   (EXTINCT)
grep -c "resolveWorkspaceForUser" "$C"    # 2   (import + call)
grep -c "supabase" "$C"                   # 29  (30 − 2 removed lines + 1 import-path substring — the 042 disclosure class)
grep -c "useCanvasLines" "$C"             # 2
wc -l "$C"                                # 8384   (never-grow at EQUALITY)
grep -c "  it(" lib/domain/canvas/lines.test.ts            # 9
grep -c "  it(" lib/infra/canvas/linesRepository.test.ts   # 6
grep -c "defineCommand" lib/domain/canvas/lines.ts         # 6
grep -c "'canvas_lines'" lib/infra/canvas/linesRepository.ts   # 5
```

### 11.3 Scope + untouched gates

```bash
git status --short   # exactly SEVEN paths: 3 modified + 4 new; ANY other path = STOP
git diff --stat -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts lib/domain/core lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts lib/infra/canvas/boardRepository.ts lib/infra/canvas/sectionsRepository.ts lib/infra/canvas/sectionsRepository.test.ts lib/infra/canvas/canvasViewReads.ts lib/infra/canvas/canvasViewReads.test.ts lib/infra/supabase lib/workspace components/collabboard/canvas/hooks/useCanvasInteractions.ts eslint.boundaries.config.mjs   # nothing
```

### 11.4 Execution gates

```bash
npx tsc --noEmit                          # clean
npm run check:boundaries                  # silent
npx vitest run                            # 245 passed (245), 28 files
# port gate: nothing listens on 3000 before you start; own dev server; warm /, /auth, /dashboard;
PW_BASE_URL=http://localhost:3000 npx playwright test   # 27 passed
# stop the server by PID; port 3000 back to 0 listeners; then:
rm -rf .next && npm run verify            # exit 0
```

Commit with the bound message. Do NOT start PATCH-046.

---

## 12. Do NOT

- Do NOT touch `canvasViewReads.ts` (rendering reads only — writes live in the new aggregate).
- Do NOT touch the realtime channel block in useCanvasData (`supabase.channel`
  / `removeChannel` / the padlets subscription) — realtime is CTO-only.
- Do NOT touch `postsRaw.ts` or its four hook delegations (a different seam;
  shrink-down rides later per-consumer slices).
- Do NOT add BestEffort siblings, converge any channel, or add rollbacks —
  the split channels and swallows are PRESERVED contracts (§0.2/§0.3).
- Do NOT hand-edit CanvasClient — Phase B's extractor is the only writer;
  never-grow must land at exactly 8,384.
- Do NOT add `markPadletLocallyModified` or realtime suppression to any line
  path (none existed).
- Do NOT run `git checkout` / `git restore` on any scoped file (autocrlf).
- Do NOT print or read `.env.local` values.
- Do NOT start PATCH-046.
