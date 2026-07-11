# PATCH-044 — hooks slice 7: the section-recovery cluster onto `canvas.createSections` + the existing `updatePostMetadataBestEffort` (Family 2 dispositioned)

**Status:** SPEC READY — implement exactly as bound below.
**Implementer:** GPT-5.4 acceptable (Pattern K, nineteenth application — one narrow
aggregate addition with fully bound tests + one contiguous two-region hook swap of
already-established idioms).
**Authored:** 2026-07-11 at `4b24a6c` by the CTO (Fable 5). All censuses, hashes, and
simulation results below were measured fresh on that tree; the canonical files were
COMPILED AND RUN through the real repo gates before delegation (§0.5).

**Read first:** `.fable5/docs/SKILL.md`, `.fable5/docs/PATCH_REFERENCE.md` (§5.11
Pattern K), then this spec end to end. The LESSONS_LEARNED autocrlf rules apply to
every file operation in this patch: never `git checkout/restore` a byte-fenced file;
verify hashes ONLY with `git hash-object`.

**Bound commit message (use EXACTLY, one commit):**

```
refactor(canvas): extract the section-recovery cluster onto canvas.createSections + updatePostMetadataBestEffort -- Family 2 dispositioned, sections aggregate gains its array-insert RMW read-back, toast/synthetic fallback byte-kept, hooks slice 7, Pattern K (PATCH-044)
```

---

## 0. CTO rulings and contract analysis

### 0.1 The slice and its ruling

Family 2 (the section-recovery cluster, useCanvasData L128–L198) is the natural
next slice per PATCH-043 §0.4, and this patch executes exactly the shape
pre-analyzed there:

1. **The array insert joins the sections AGGREGATE, not canvasViewReads.** The
   `insert(rows).select('*')` read-back feeds the remap — that is a WRITE's
   read-modify-write read, aggregate territory under the PATCH-043 read idiom
   (rendering reads → selector modules; RMW reads serving a write → the table's
   aggregate). `canvasViewReads.ts` stays byte-untouched (its header fence
   forbids write operations joining it). New repository method:
   `insertSections(fields: readonly SectionInsertFields[])` returning ALL
   inserted rows (null mirrors the vendor shape, the `insertSection` precedent).
   New command: `canvas.createSections` — boardId rides once at the top level
   and is merged into every row inside the command (deterministic-compile
   consequence: the top-of-fetchData `if (!canvasId)` guard narrows `canvasId`
   only in fetchData's own body, not inside map closures; the legacy payload
   built `board_id` inside the closure, the new payload omits it).
2. **NO behavior authorization is needed anywhere.** The recovery insert's two
   failure channels ALREADY converge on the recovery catch
   (`if (recoveryError) throw recoveryError` inside the try — the 038/040
   check-and-throw shape), so an honest command + call-site cause-unwrap throw
   preserves both channels exactly. The padlet loop's resolved per-row errors
   were NEVER read (a swallow-family behavior) and map onto the EXISTING
   `canvas.updatePostMetadataBestEffort` — the swallow count stays ELEVEN, no
   new site. The thrown channel rides the 032 per-element fail-fast wrapper.
3. **Family 4 stays untouched** (owner instruction): the four `canvas_lines`
   writes remain raw in the hook; the workspace hand-off still rides the future
   lines-family patch. FreeformGraphRepo after the lines/read families;
   FreeformPadletCards last.
4. **One coherent slice** — five files, zero interface ripple beyond the two
   sections test fakes (verified: the ONLY `SectionsRepository` implementers
   are the fakes in `sections.test.ts`; `sectionsRepository.test.ts` feeds a
   structural fake CLIENT to the real class; CanvasClient only consumes the
   factory). No split needed; PATCH-045 is not drafted.

### 0.2 The failure-contract table (preserve EXACTLY — all simulation-proven)

| # | Channel | Legacy behavior | Ported behavior |
|---|---------|-----------------|-----------------|
| 1 | Recovery insert, RESOLVED error | `{ error }` destructured → `throw recoveryError` → recovery catch → `console.error` + synthetic fallback | repo returns `err('unavailable', { cause })` → honest command passes it through → call site `throw insertResult.error.cause ?? insertResult.error` → the SAME catch receives the ORIGINAL supabase error object |
| 2 | Recovery insert, THROWN | rejects the await → recovery catch directly | defineCommand converts the throw to `err('unknown', { cause })` → call site throws the cause → the SAME original error reaches the catch |
| 3 | Padlet loop, RESOLVED per-row error | never read — silently swallowed | `updatePostMetadataBestEffort` swallows it internally and returns ok → the wrapper does not throw. Preserved via the EXISTING command; swallow-family count stays ELEVEN |
| 4 | Padlet loop, THROWN | rejects that element → `Promise.all` fail-fast rejects → recovery catch → synthetic fallback (yes: even though the sections WERE inserted — a legacy quirk, preserved) | defineCommand catch → err → wrapper `if (!result.ok) throw result.error.cause ?? result.error` → `Promise.all` rejects identically |
| 5 | Ordering | insert → remap build → padlet loop → local remap assignments → `toast.warning` (success only) | statement order unchanged; only the two raw interiors are swapped |
| 6 | Recovery catch + synthetic fallback + toast | — | BYTE-KEPT (the catch block, `syntheticSections`, and `toast.warning` lines are untouched bytes) |
| 7 | Missing realtime suppression | the recovery loop never calls `markPadletLocallyModified` | preserved by name — do NOT add it (`markPadletLocallyModified` census 5→5) |
| 8 | `updated_at` | generated at payload-build time per element | generated INSIDE the command at execute time (the standing 032+ fact, accepted since PATCH-032; same ISO shape) |
| 9 | Skip element | `return Promise.resolve();` | `return;` inside the now-async map callback — identical semantics (resolved void promise); disclosed rewording |
| 10 | Validation channel | none | zod can reject before the repo is called (the 029 standing acceptance); all inputs are locally constructed (guard-narrowed string boardId, template titles, numeric positions, object metadata spread) so it cannot fire in practice |
| 11 | Loading/retry | `finally { if (showLoading) setLoading(false) }`, no retry | untouched bytes |

### 0.3 Bound casts and disclosures

- ONE new double-cast, bound:
  `insertResult.value as unknown as BoardSection[] | null` — restores the exact
  legacy any-flow type so every downstream byte-kept line compiles against the
  real `types/collabboard` shapes (hook `as unknown as` census 5→6).
- The pre-existing downstream `(recoveredSections as BoardSection[])` cast
  becomes a no-op member-of-union cast and stays BYTE-KEPT.
- Census instrument disclosures: `.from(` includes the recovery block's
  `Array.from(` on BOTH sides (the standing false positive); the post-edit
  `'padlets'` 1 is the realtime channel's `table: 'padlets'` (realtime is
  CTO-only, deferred); the lowercase `updatePostMetadataBestEffort` count is 2
  (declaration + call — the import line carries the capital-U command factory
  name and does not match).

### 0.4 Remainder after this patch

Family 2 DISPOSITIONED. Remaining in the hook: Family 4 (the four
`canvas_lines` writes → the future WRITE-side lines aggregate, workspace rider
standing), the realtime/presence channels (CTO-only), and the four postsRaw
delegations (shrink-down per consumer). FreeformGraphRepo after the lines/read
families; FreeformPadletCards LAST.

### 0.5 Simulation results (CTO, in-tree, this exact canonical content)

tsc `--noEmit` CLEAN (the new structural insert union + the thenable-and-
chainable `SectionsInsertSelectQuery` against the real class, the one bound
cast, every byte-kept downstream consumer); `npm run check:boundaries` SILENT;
vitest **230 passed (230), 26 files** — 224 existing + 6 new (sections.test.ts
11→14 `it(`, sectionsRepository.test.ts 6→9), zero pins broken. The tree was
then restored byte-exact via `git cat-file blob` and no-op `git add`.

---

## 1. Pre-edit bindings (verify FIRST; any mismatch = STOP, report, do not improvise)

```bash
git status --short   # nothing
git hash-object lib/domain/canvas/sections.ts                    # ad15c14f2dcfd3ce261b241e519d86f23ff02b96   (137 lines)
git hash-object lib/domain/canvas/sections.test.ts               # 6b28739f581b96ee4019e48705b07c2c27a068cc   (234 lines)
git hash-object lib/infra/canvas/sectionsRepository.ts           # 95a01a07491da9d9a62e4d9a1008af1426eec94d   (115 lines)
git hash-object lib/infra/canvas/sectionsRepository.test.ts      # 444f4b4651f82cbf9c63042bd659404342666105   (158 lines)
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts   # 5704ac3ff1d44b048ff85667f64ac620763cd184   (632 lines)
```

MUST-NOT-CHANGE set (verify now AND after — all eleven):

```bash
git hash-object lib/domain/canvas/posts.ts                                      # fdc5fd153b5a4689a29c086652fc9411f9074b09
git hash-object lib/domain/canvas/posts.test.ts                                 # affd371dacd6607be415304f981ec938d6fb6be8
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028
git hash-object lib/infra/canvas/boardRepository.ts                             # c9aca246004286db3119f2af7e05422126e4ee82
git hash-object lib/infra/canvas/canvasViewReads.ts                             # a57714002bd65ea493776904ca01748d64bf3bed
git hash-object lib/infra/canvas/canvasViewReads.test.ts                        # d26385c24dcfdb10e8e0e6f705e1c1b5229ed40d
git hash-object lib/infra/supabase/postsRaw.ts                                  # 9aa0f6eacd8d3b9b5f95614f9d831f6a10a5bcf5
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 57a56ef8595c8ebc4b655a1fd811904049bbd155
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts           # cff23229dcbeb76a93d46d75b6b13a6aa351f07a
```

Pre-edit censuses (plain `grep -c`, case-sensitive, LINE counts):

```bash
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "\.from(" "$H"                    # 7   (incl. Array.from — the standing false positive)
grep -c "'board_sections'" "$H"           # 1
grep -c "'padlets'" "$H"                  # 2
grep -c "supabase" "$H"                   # 14
grep -c "as unknown as" "$H"              # 5
grep -c "recoveryError" "$H"              # 4
grep -c "markPadletLocallyModified" "$H"  # 5
grep -c "createCreateSectionsCommand\|createSectionsRepository\|createUpdatePostMetadataBestEffortCommand" "$H"   # 0
D=lib/domain/canvas/sections.ts
grep -c "insertSections" "$D"             # 0
grep -c "defineCommand" "$D"              # 7
grep -c "z.object" "$D"                   # 7
I=lib/infra/canvas/sectionsRepository.ts
grep -c "insertSections" "$I"             # 0
grep -c "PromiseLike" "$I"                # 0
grep -c "'board_sections'" "$I"           # 5
grep -c "  it(" lib/domain/canvas/sections.test.ts          # 11
grep -c "  it(" lib/infra/canvas/sectionsRepository.test.ts # 6
```

Collision gate (repo-wide, MUST be 0 pre-edit):

```bash
grep -rn "createCreateSectionsCommand\|insertSections\|createSectionsSchema\|SectionsInsertSelectQuery\|insertManyRows\|insertManyCalls\|setInsertManyResult" --include="*.ts" --include="*.tsx" lib components app | grep -v node_modules | wc -l   # 0
```

---

## 2. BOUND FILE — `lib/domain/canvas/sections.ts` (whole file, exact, 173 lines; post-edit hash `762c367186716749af21cfd3e9abf79cdafb74c0`)

```ts
import { z } from 'zod';
import { defineCommand } from '../core/command';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import { ok } from '../core/result';

/**
 * PATCH-026: the board_sections group of the canvas seam - same family as
 * posts.ts (one canvas aggregate folder, P6; the trunk grows per group).
 * `board_sections` is the legacy table name; new code says sections.
 */

export interface SectionInsertFields {
  readonly boardId: string;
  readonly title: string;
  readonly description: string;
  readonly position: number;
}

export interface SectionPositionFields {
  readonly position: number;
  readonly updatedAt: string;
}

export interface SectionsRepository {
  /** insert().select().single() - returns the created row for page state (null mirrors the vendor shape). */
  insertSection(
    fields: SectionInsertFields,
  ): Promise<Result<Record<string, unknown> | null, DomainError>>;
  /** insert(rows).select('*') - returns ALL inserted rows for the recovery remap (null mirrors the vendor shape). */
  insertSections(
    fields: readonly SectionInsertFields[],
  ): Promise<Result<Array<Record<string, unknown>> | null, DomainError>>;
  renameSection(
    id: number,
    fields: { readonly title: string; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>>;
  updateSectionPosition(id: number, fields: SectionPositionFields): Promise<Result<void, DomainError>>;
  deleteSection(id: number): Promise<Result<void, DomainError>>;
}

export const createSectionSchema = z.object({
  boardId: z.string(),
  title: z.string(),
  position: z.number(),
});

export const createCreateSectionCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.createSection',
    input: createSectionSchema,
    execute: async (input) =>
      repository.insertSection({
        boardId: input.boardId,
        title: input.title,
        // The legacy insert always sends an empty description (old L2843).
        description: '',
        position: input.position,
      }),
  });

export const createSectionsSchema = z.object({
  boardId: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      position: z.number(),
    }),
  ),
});

/**
 * PATCH-044: the section-recovery ARRAY insert - one insert().select('*')
 * returning ALL created rows (the remap's read-back - RMW territory per the
 * PATCH-043 read idiom). boardId rides once and is merged into every row
 * here; the legacy recovery built the same rows inline (old hook L129-134).
 */
export const createCreateSectionsCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.createSections',
    input: createSectionsSchema,
    execute: async (input) =>
      repository.insertSections(
        input.sections.map((section) => ({
          boardId: input.boardId,
          title: section.title,
          description: section.description,
          position: section.position,
        })),
      ),
  });

export const renameSectionSchema = z.object({
  sectionId: z.number(),
  title: z.string(),
});

export const createRenameSectionCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.renameSection',
    input: renameSectionSchema,
    execute: async (input) =>
      repository.renameSection(input.sectionId, {
        title: input.title,
        updatedAt: new Date().toISOString(),
      }),
  });

export const deleteSectionSchema = z.object({
  sectionId: z.number(),
});

export const createDeleteSectionCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.deleteSection',
    input: deleteSectionSchema,
    execute: async (input) => repository.deleteSection(input.sectionId),
  });

export const swapSectionPositionsSchema = z.object({
  first: z.object({ sectionId: z.number(), position: z.number() }),
  second: z.object({ sectionId: z.number(), position: z.number() }),
});

export const createSwapSectionPositionsCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.swapSectionPositions',
    input: swapSectionPositionsSchema,
    execute: async (input) => {
      // Sequential, stop on first error - preserves the legacy
      // partial-failure semantics (old L2975-2989): if the second update
      // fails, the first stays applied. Timestamps are generated per update,
      // exactly as the legacy handler did.
      const first = await repository.updateSectionPosition(input.first.sectionId, {
        position: input.first.position,
        updatedAt: new Date().toISOString(),
      });
      if (!first.ok) return first;
      return repository.updateSectionPosition(input.second.sectionId, {
        position: input.second.position,
        updatedAt: new Date().toISOString(),
      });
    },
  });

export const reorderSectionsSchema = z.object({
  sectionIds: z.array(z.number()),
});

export const createReorderSectionsCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.reorderSections',
    input: reorderSectionsSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (old L3020-3028; queued P3-family fix, do
      // NOT repair here): the legacy page awaited Promise.all over raw
      // builders and never read the resolved per-row `error` fields, so
      // database-level failures were silently swallowed - only a THROWN
      // network error reached its catch. Faithful port: run all updates in
      // parallel and ignore the resolved Results; a thrown exception still
      // rejects, escapes execute, and surfaces via defineCommand's catch.
      await Promise.all(
        input.sectionIds.map((sectionId, index) =>
          repository.updateSectionPosition(sectionId, {
            position: index,
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
      return ok(undefined);
    },
  });
```

## 3. BOUND FILE — `lib/domain/canvas/sections.test.ts` (whole file, exact, 313 lines, 14 tests; post-edit hash `c159670450ece3d657cc6be13bfbe4bd7bbd7ce7`)

```ts
import { describe, expect, it } from 'vitest';
import {
  createCreateSectionCommand,
  createCreateSectionsCommand,
  createDeleteSectionCommand,
  createRenameSectionCommand,
  createReorderSectionsCommand,
  createSwapSectionPositionsCommand,
} from './sections';
import type { SectionInsertFields, SectionPositionFields, SectionsRepository } from './sections';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const ctx = { userId: null };

function createFakeRepository() {
  const insertCalls: SectionInsertFields[] = [];
  const insertManyCalls: Array<readonly SectionInsertFields[]> = [];
  const renameCalls: Array<{ id: number; title: string; updatedAt: string }> = [];
  const positionCalls: Array<{ id: number; fields: SectionPositionFields }> = [];
  const deleteCalls: number[] = [];

  let insertResult: Result<Record<string, unknown> | null, DomainError> = ok({ id: 7 });
  let insertManyResult: Result<Array<Record<string, unknown>> | null, DomainError> = ok([]);
  const positionResults: Array<Result<void, DomainError>> = [];
  let renameResult: Result<void, DomainError> = ok(undefined);
  let deleteResult: Result<void, DomainError> = ok(undefined);

  const repository: SectionsRepository = {
    insertSection: async (fields) => {
      insertCalls.push(fields);
      return insertResult;
    },
    insertSections: async (fields) => {
      insertManyCalls.push(fields);
      return insertManyResult;
    },
    renameSection: async (id, fields) => {
      renameCalls.push({ id, title: fields.title, updatedAt: fields.updatedAt });
      return renameResult;
    },
    updateSectionPosition: async (id, fields) => {
      positionCalls.push({ id, fields });
      return positionResults.shift() ?? ok(undefined);
    },
    deleteSection: async (id) => {
      deleteCalls.push(id);
      return deleteResult;
    },
  };

  return {
    repository,
    insertCalls,
    insertManyCalls,
    renameCalls,
    positionCalls,
    deleteCalls,
    setInsertResult(result: Result<Record<string, unknown> | null, DomainError>) {
      insertResult = result;
    },
    setInsertManyResult(result: Result<Array<Record<string, unknown>> | null, DomainError>) {
      insertManyResult = result;
    },
    queuePositionResult(result: Result<void, DomainError>) {
      positionResults.push(result);
    },
    setRenameResult(result: Result<void, DomainError>) {
      renameResult = result;
    },
    setDeleteResult(result: Result<void, DomainError>) {
      deleteResult = result;
    },
  };
}

describe('canvas.createSection', () => {
  it('sends an empty description with the given board, title, and position, returning the created row', async () => {
    const fake = createFakeRepository();
    fake.setInsertResult(ok({ id: 41, title: 'Section 3' }));
    const createSection = createCreateSectionCommand(fake.repository);

    const result = await createSection(
      { boardId: 'board-9', title: 'Section 3', position: 2 },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 41, title: 'Section 3' });
    }
    expect(fake.insertCalls).toEqual([
      { boardId: 'board-9', title: 'Section 3', description: '', position: 2 },
    ]);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setInsertResult(err(domainError('unavailable', 'db down')));
    const createSection = createCreateSectionCommand(fake.repository);

    const result = await createSection(
      { boardId: 'board-9', title: 'Section 1', position: 0 },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.createSections', () => {
  it('merges the board id into every row and returns all created rows', async () => {
    const fake = createFakeRepository();
    fake.setInsertManyResult(ok([{ id: 51 }, { id: 52 }]));
    const createSections = createCreateSectionsCommand(fake.repository);

    const result = await createSections(
      {
        boardId: 'board-9',
        sections: [
          { title: 'Recovered Section 1', description: '', position: 3 },
          { title: 'Recovered Section 2', description: '', position: 4 },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([{ id: 51 }, { id: 52 }]);
    }
    expect(fake.insertManyCalls).toEqual([
      [
        { boardId: 'board-9', title: 'Recovered Section 1', description: '', position: 3 },
        { boardId: 'board-9', title: 'Recovered Section 2', description: '', position: 4 },
      ],
    ]);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setInsertManyResult(err(domainError('unavailable', 'db down')));
    const createSections = createCreateSectionsCommand(fake.repository);

    const result = await createSections(
      {
        boardId: 'board-9',
        sections: [{ title: 'Recovered Section 1', description: '', position: 0 }],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects a non-numeric position without calling the repository', async () => {
    const fake = createFakeRepository();
    const createSections = createCreateSectionsCommand(fake.repository);

    const result = await createSections(
      {
        boardId: 'board-9',
        sections: [{ title: 'Recovered Section 1', description: '', position: '3' }],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.insertManyCalls).toHaveLength(0);
  });
});

describe('canvas.renameSection', () => {
  it('sends the new title with an ISO timestamp to the right section', async () => {
    const fake = createFakeRepository();
    const renameSection = createRenameSectionCommand(fake.repository);

    const result = await renameSection({ sectionId: 12, title: 'Sprint' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.renameCalls).toHaveLength(1);
    expect(fake.renameCalls[0].id).toBe(12);
    expect(fake.renameCalls[0].title).toBe('Sprint');
    expect(new Date(fake.renameCalls[0].updatedAt).toISOString()).toBe(
      fake.renameCalls[0].updatedAt,
    );
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const renameSection = createRenameSectionCommand(fake.repository);

    const result = await renameSection({ sectionId: 12 }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.renameCalls).toHaveLength(0);
  });
});

describe('canvas.deleteSection', () => {
  it('deletes exactly the given section', async () => {
    const fake = createFakeRepository();
    const deleteSection = createDeleteSectionCommand(fake.repository);

    const result = await deleteSection({ sectionId: 5 }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.deleteCalls).toEqual([5]);
  });
});

describe('canvas.swapSectionPositions', () => {
  it('updates first then second with the given positions', async () => {
    const fake = createFakeRepository();
    const swapPositions = createSwapSectionPositionsCommand(fake.repository);

    const result = await swapPositions(
      { first: { sectionId: 3, position: 1 }, second: { sectionId: 4, position: 0 } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.positionCalls.map((c) => ({ id: c.id, position: c.fields.position }))).toEqual([
      { id: 3, position: 1 },
      { id: 4, position: 0 },
    ]);
  });

  it('stops after a first-update failure - the second section is never touched', async () => {
    const fake = createFakeRepository();
    fake.queuePositionResult(err(domainError('unavailable', 'db down')));
    const swapPositions = createSwapSectionPositionsCommand(fake.repository);

    const result = await swapPositions(
      { first: { sectionId: 3, position: 1 }, second: { sectionId: 4, position: 0 } },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(fake.positionCalls).toHaveLength(1);
    expect(fake.positionCalls[0].id).toBe(3);
  });

  it('reports a second-update failure with the first already applied (legacy partial failure)', async () => {
    const fake = createFakeRepository();
    fake.queuePositionResult(ok(undefined));
    fake.queuePositionResult(err(domainError('unavailable', 'db down')));
    const swapPositions = createSwapSectionPositionsCommand(fake.repository);

    const result = await swapPositions(
      { first: { sectionId: 3, position: 1 }, second: { sectionId: 4, position: 0 } },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(fake.positionCalls).toHaveLength(2);
  });
});

describe('canvas.reorderSections', () => {
  it('updates every section with its index as the new position', async () => {
    const fake = createFakeRepository();
    const reorderSections = createReorderSectionsCommand(fake.repository);

    const result = await reorderSections({ sectionIds: [9, 7, 8] }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.positionCalls.map((c) => ({ id: c.id, position: c.fields.position }))).toEqual([
      { id: 9, position: 0 },
      { id: 7, position: 1 },
      { id: 8, position: 2 },
    ]);
  });

  it('preserves the legacy error-swallow: row-level failures still return ok', async () => {
    const fake = createFakeRepository();
    fake.queuePositionResult(err(domainError('unavailable', 'db down')));
    fake.queuePositionResult(err(domainError('unavailable', 'db down')));
    const reorderSections = createReorderSectionsCommand(fake.repository);

    const result = await reorderSections({ sectionIds: [9, 7] }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.positionCalls).toHaveLength(2);
  });

  it('rejects non-numeric ids without calling the repository', async () => {
    const fake = createFakeRepository();
    const reorderSections = createReorderSectionsCommand(fake.repository);

    const result = await reorderSections({ sectionIds: ['9'] }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.positionCalls).toHaveLength(0);
  });
});
```

## 4. BOUND FILE — `lib/infra/canvas/sectionsRepository.ts` (whole file, exact, 157 lines; post-edit hash `229655bd828a4b85aa85205e50c9bf6db56a8d85`)

```ts
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type {
  SectionInsertFields,
  SectionPositionFields,
  SectionsRepository,
} from '../../domain/canvas/sections';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

/**
 * The real builder's select() is thenable AND .single()-chainable: the
 * single-row path (insertSection) chains .single(), the array path
 * (insertSections) awaits select('*') directly - both legacy shapes.
 */
interface SectionsInsertSelectQuery
  extends PromiseLike<{
    data: Array<Record<string, unknown>> | null;
    error: SupabaseErrorLike | null;
  }> {
  single(): Promise<{ data: Record<string, unknown> | null; error: SupabaseErrorLike | null }>;
}

interface SectionsInsertQuery {
  select(columns?: '*'): SectionsInsertSelectQuery;
}

interface SectionsMutationQuery {
  eq(column: 'id', value: number): Promise<{ error: SupabaseErrorLike | null }>;
}

interface SectionsSupabaseClient {
  from(table: 'board_sections'): {
    insert(
      payload:
        | {
            board_id: string;
            title: string;
            description: string;
            position: number;
          }
        | Array<{
            board_id: string;
            title: string;
            description: string;
            position: number;
          }>,
    ): SectionsInsertQuery;
    update(
      payload:
        | { title: string; updated_at: string }
        | { position: number; updated_at: string },
    ): SectionsMutationQuery;
    delete(): SectionsMutationQuery;
  };
}

export class SupabaseSectionsRepository implements SectionsRepository {
  constructor(private readonly client: SectionsSupabaseClient) {}

  async insertSection(
    fields: SectionInsertFields,
  ): Promise<Result<Record<string, unknown> | null, DomainError>> {
    const { data, error } = await this.client
      .from('board_sections')
      .insert({
        board_id: fields.boardId,
        title: fields.title,
        description: fields.description,
        position: fields.position,
      })
      .select()
      .single();

    if (error) {
      return err(domainError('unavailable', 'Could not create the section', { cause: error }));
    }

    return ok(data);
  }

  async insertSections(
    fields: readonly SectionInsertFields[],
  ): Promise<Result<Array<Record<string, unknown>> | null, DomainError>> {
    const { data, error } = await this.client
      .from('board_sections')
      .insert(
        fields.map((section) => ({
          board_id: section.boardId,
          title: section.title,
          description: section.description,
          position: section.position,
        })),
      )
      .select('*');

    if (error) {
      return err(domainError('unavailable', 'Could not create the sections', { cause: error }));
    }

    return ok(data);
  }

  async renameSection(
    id: number,
    fields: { readonly title: string; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('board_sections')
      .update({ title: fields.title, updated_at: fields.updatedAt })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not rename the section', { cause: error }));
    }

    return ok(undefined);
  }

  async updateSectionPosition(
    id: number,
    fields: SectionPositionFields,
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('board_sections')
      .update({ position: fields.position, updated_at: fields.updatedAt })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not move the section', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteSection(id: number): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('board_sections').delete().eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the section', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createSectionsRepository(): SectionsRepository {
  return new SupabaseSectionsRepository(
    createBrowserSupabaseClient() as unknown as SectionsSupabaseClient,
  );
}
```

## 5. BOUND FILE — `lib/infra/canvas/sectionsRepository.test.ts` (whole file, exact, 220 lines, 9 tests; post-edit hash `72fe75923ce4905a6e0dfb8c79532164d31e05c2`)

```ts
import { describe, expect, it } from 'vitest';
import { SupabaseSectionsRepository } from './sectionsRepository';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(options: {
  insertRow?: Record<string, unknown> | null;
  insertManyRows?: Array<Record<string, unknown>> | null;
  insertError?: FakeError | null;
  mutationError?: FakeError | null;
} = {}) {
  const {
    insertRow = { id: 41 },
    insertManyRows = [{ id: 41 }],
    insertError = null,
    mutationError = null,
  } = options;
  const insertCalls: Array<Record<string, unknown> | Array<Record<string, unknown>>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const deleteEqCalls: Array<{ column: string; value: number }> = [];
  const eqCalls: Array<{ column: string; value: number }> = [];

  const client = {
    from(table: 'board_sections') {
      expectTable(table);
      return {
        insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
          insertCalls.push(payload);
          return {
            // The real builder's select() is thenable AND .single()-chainable.
            select() {
              return Object.assign(
                Promise.resolve({ data: insertError ? null : insertManyRows, error: insertError }),
                {
                  single: async () => ({ data: insertError ? null : insertRow, error: insertError }),
                },
              );
            },
          };
        },
        update(payload: Record<string, unknown>) {
          updateCalls.push(payload);
          return {
            eq: async (column: 'id', value: number) => {
              eqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
        delete() {
          return {
            eq: async (column: 'id', value: number) => {
              deleteEqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
      };
    },
  };

  const tables: string[] = [];
  function expectTable(table: string) {
    tables.push(table);
  }

  return { client, insertCalls, updateCalls, deleteEqCalls, eqCalls, tables };
}

describe('SupabaseSectionsRepository', () => {
  it('inserts the snake_case payload and returns the created row', async () => {
    const fake = createFakeClient({ insertRow: { id: 41, title: 'Section 3' } });
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.insertSection({
      boardId: 'board-9',
      title: 'Section 3',
      description: '',
      position: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 41, title: 'Section 3' });
    }
    expect(fake.insertCalls).toEqual([
      { board_id: 'board-9', title: 'Section 3', description: '', position: 2 },
    ]);
    expect(fake.tables).toEqual(['board_sections']);
  });

  it('maps an insert error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '23503', message: 'fk violation' };
    const fake = createFakeClient({ insertError: supabaseError });
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.insertSection({
      boardId: 'board-9',
      title: 'Section 1',
      description: '',
      position: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('inserts the snake_case array payload and returns all created rows', async () => {
    const fake = createFakeClient({ insertManyRows: [{ id: 51 }, { id: 52 }] });
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.insertSections([
      { boardId: 'board-9', title: 'Recovered Section 1', description: '', position: 3 },
      { boardId: 'board-9', title: 'Recovered Section 2', description: '', position: 4 },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([{ id: 51 }, { id: 52 }]);
    }
    expect(fake.insertCalls).toEqual([
      [
        { board_id: 'board-9', title: 'Recovered Section 1', description: '', position: 3 },
        { board_id: 'board-9', title: 'Recovered Section 2', description: '', position: 4 },
      ],
    ]);
    expect(fake.tables).toEqual(['board_sections']);
  });

  it('maps an array-insert error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const fake = createFakeClient({ insertError: supabaseError });
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.insertSections([
      { boardId: 'board-9', title: 'Recovered Section 1', description: '', position: 0 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('passes a null rows payload through unchanged (vendor shape)', async () => {
    const fake = createFakeClient({ insertManyRows: null });
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.insertSections([
      { boardId: 'board-9', title: 'Recovered Section 1', description: '', position: 0 },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('renames via a title+updated_at payload filtered by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.renameSection(12, {
      title: 'Sprint',
      updatedAt: '2026-07-09T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([{ title: 'Sprint', updated_at: '2026-07-09T12:00:00.000Z' }]);
    expect(fake.eqCalls).toEqual([{ column: 'id', value: 12 }]);
  });

  it('moves via a position+updated_at payload filtered by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.updateSectionPosition(3, {
      position: 1,
      updatedAt: '2026-07-09T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([{ position: 1, updated_at: '2026-07-09T12:00:00.000Z' }]);
    expect(fake.eqCalls).toEqual([{ column: 'id', value: 3 }]);
  });

  it('deletes by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.deleteSection(5);

    expect(result.ok).toBe(true);
    expect(fake.deleteEqCalls).toEqual([{ column: 'id', value: 5 }]);
  });

  it('maps a mutation error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const fake = createFakeClient({ mutationError: supabaseError });
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.updateSectionPosition(3, {
      position: 1,
      updatedAt: '2026-07-09T12:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
```

## 6. BOUND FILE — `components/collabboard/canvas/hooks/useCanvasData.ts` (whole file, exact, 637 lines; post-edit hash `7f344aa0109fdabfc4c6b18326891b3a118e7c43`)

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
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createCreateSectionsCommand } from '@/lib/domain/canvas/sections';
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

---

## 7. Phase plan

### Phase A — read + verify

Read SKILL.md, PATCH_REFERENCE §5.11, this spec. Run EVERY §1 gate. Any
mismatch: STOP and report; do not improvise.

### Phase B — the bound mechanical extractor (the ONLY write step)

Save the block below as `_p044_extract.py` (repo root) and run
`python3 _p044_extract.py`; then DELETE the script file. It extracts the five
whole-file fences from THIS spec, hash-asserts each BEFORE writing, writes LF
bytes, and re-verifies with `git hash-object`. Do not hand-edit any scoped
file; if the extractor stops, report its output verbatim.

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-044.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-044.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)
targets = [
    ("lib/domain/canvas/sections.ts", "762c367186716749af21cfd3e9abf79cdafb74c0"),
    ("lib/domain/canvas/sections.test.ts", "c159670450ece3d657cc6be13bfbe4bd7bbd7ce7"),
    ("lib/infra/canvas/sectionsRepository.ts", "229655bd828a4b85aa85205e50c9bf6db56a8d85"),
    ("lib/infra/canvas/sectionsRepository.test.ts", "72fe75923ce4905a6e0dfb8c79532164d31e05c2"),
    ("components/collabboard/canvas/hooks/useCanvasData.ts", "7f344aa0109fdabfc4c6b18326891b3a118e7c43"),
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
print("ALL FIVE BOUND FILES WRITTEN AND HASH-VERIFIED")
```

### Phase C — gates (§9), commit (bound message), STOP

Do not start PATCH-045.

---

## 8. Explanatory recipe — the hook's three regions (REFERENCE ONLY; Phase B already wrote the exact bytes)

Each OLD block appears EXACTLY ONCE in the pre-edit hook. These pairs exist so
the reviewer can reconstruct the final hash from the pre-edit blob and so the
diff is understood; they are not an alternative write path.

### 8a — imports (one contiguous region)

OLD:

```ts
import {
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
```

NEW:

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

### 8b — the recovery insert (the payload keeps its name; board_id leaves the map closure and rides the command input once)

OLD:

```ts
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
```

NEW:

```ts
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
```

### 8c — the padlet remap loop (032 per-element fail-fast wrapper; command instantiated ONCE before the loop, the 038 idiom)

OLD:

```ts
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
```

NEW:

```ts
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
```

Between 8b and 8c the remap-building block is BYTE-KEPT, and everything from
`nextSections = [...nextSections, ...` through the recovery catch, the
synthetic fallback, and `toast.warning` is BYTE-KEPT.

---

## 9. Post-edit gates (ALL must pass before commit)

### 9.1 Hashes

```bash
git hash-object lib/domain/canvas/sections.ts                    # 762c367186716749af21cfd3e9abf79cdafb74c0
git hash-object lib/domain/canvas/sections.test.ts               # c159670450ece3d657cc6be13bfbe4bd7bbd7ce7
git hash-object lib/infra/canvas/sectionsRepository.ts           # 229655bd828a4b85aa85205e50c9bf6db56a8d85
git hash-object lib/infra/canvas/sectionsRepository.test.ts      # 72fe75923ce4905a6e0dfb8c79532164d31e05c2
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts   # 7f344aa0109fdabfc4c6b18326891b3a118e7c43
```

Plus ALL ELEVEN MUST-NOT-CHANGE hashes from §1, unchanged.

### 9.2 Censuses (simulation-measured; plain `grep -c`)

```bash
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "\.from(" "$H"                    # 5   (4 canvas_lines writes + Array.from — the standing false positive)
grep -c "'board_sections'" "$H"           # 0   (Family 2 EXTINCT in the hook)
grep -c "'padlets'" "$H"                  # 1   (the realtime channel's table: only)
grep -c "supabase" "$H"                   # 12
grep -c "as unknown as" "$H"              # 6   (the pre-existing five + the one bound §0.3 cast)
grep -c "recoveryError" "$H"              # 2   (catch param + console.error — byte-kept)
grep -c "recoveryPayload" "$H"            # 2
grep -c "recoveredSections" "$H"          # 3
grep -c "syntheticSections" "$H"          # 2
grep -c "toast.warning" "$H"              # 1
grep -c "Promise.all" "$H"                # 1
grep -c "markPadletLocallyModified" "$H"  # 5   (unchanged — the missing suppression stays missing)
grep -c "'canvas_lines'" "$H"             # 4   (Family 4, untouched)
grep -c "createCreateSectionsCommand" "$H"   # 2   (import + call)
grep -c "createSectionsRepository" "$H"      # 2   (import + call)
grep -c "createUpdatePostMetadataBestEffortCommand" "$H"   # 2   (import + call)
grep -c "updatePostMetadataBestEffort" "$H"  # 2   (declaration + call; lowercase — the import line does not match)
grep -c '^[[:space:]]*$' "$H"             # 77
D=lib/domain/canvas/sections.ts
grep -c "insertSections" "$D"             # 2
grep -c "createCreateSectionsCommand" "$D"   # 1
grep -c "defineCommand" "$D"              # 8
grep -c "z.object" "$D"                   # 9
I=lib/infra/canvas/sectionsRepository.ts
grep -c "insertSections" "$I"             # 2
grep -c "select('\\*')" "$I"              # 2   (the interface columns type + the method chain)
grep -c "'board_sections'" "$I"           # 6
grep -c "PromiseLike" "$I"                # 1
grep -c "single()" "$I"                   # 4
grep -c "  it(" lib/domain/canvas/sections.test.ts          # 14
grep -c "  it(" lib/infra/canvas/sectionsRepository.test.ts # 9
```

### 9.3 Scope + untouched gates

```bash
git status --short   # exactly FIVE modified paths: the hook + the four sections files; ANY other path = STOP
git diff --stat -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts lib/infra/canvas/boardRepository.ts lib/infra/canvas/canvasViewReads.ts lib/infra/canvas/canvasViewReads.test.ts lib/infra/supabase components/collabboard/canvas/hooks/useCanvasLines.ts components/collabboard/canvas/hooks/useCanvasInteractions.ts "app/dashboard/canvas/\[id\]/CanvasClient.tsx" eslint.boundaries.config.mjs   # nothing
```

### 9.4 Execution gates

```bash
npx tsc --noEmit                          # clean
npm run check:boundaries                  # silent
npx vitest run                            # 230 passed (230), 26 files
# port gate: nothing listens on 3000 before you start; own dev server; warm /, /auth, /dashboard;
PW_BASE_URL=http://localhost:3000 npx playwright test   # 27 passed
# stop the server by PID; port 3000 back to 0 listeners; then:
rm -rf .next && npm run verify            # exit 0
```

Commit with the bound message. Do NOT start PATCH-045.

---

## 10. Do NOT

- Do NOT touch `canvasViewReads.ts` (rendering reads only — this insert is RMW).
- Do NOT touch the four `canvas_lines` writes, the realtime/presence channels,
  or the four postsRaw delegations (Families 4 / realtime / raw shrink-down).
- Do NOT add `markPadletLocallyModified` to the recovery loop (the missing
  suppression is a preserved legacy behavior).
- Do NOT repair the swallow family (ELEVEN sites + auth-infra sibling — queued
  P3-family fix, owner authorization pending).
- Do NOT rethrow after the recovery catch, alter the toast text, or change the
  synthetic-sections shape.
- Do NOT run `git checkout` / `git restore` on any scoped file (autocrlf).
- Do NOT print or read `.env.local` values.
- Do NOT start PATCH-045.
