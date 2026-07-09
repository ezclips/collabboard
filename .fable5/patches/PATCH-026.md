# PATCH-026 — Canvas strangler, group 1: the `board_sections` family onto the ops seam (five commands, Pattern K)

**Status:** READY (authored 2026-07-09; owner approval pending)
**Complexity:** medium (four NEW whole-file-bound files + SIX bound edits to
CanvasClient — one import block + five handler-internal swaps; the mechanism
is PATCH-025's Pattern K applied to the site map's recommended first group)
**Assigned model:** **GPT-5.4 — acceptable**, per the Pattern K ruling
(§5.11) proven by PATCH-025's byte-perfect first-attempt delivery:
- All five commands' semantics — including the two genuinely risky ones,
  the swap's sequential stop-on-first-error partial failure and the
  reorder's PRESERVED legacy error-swallow — are locked by **seventeen
  bound unit tests the CTO compiled AND ran GREEN against the bound
  implementation at authoring time** (scratch `tsc --strict` clean, scratch
  vitest 17/17). Each risky edge has a dedicated named test.
- Every new file is whole-file bound; every CanvasClient edit is a bounded
  handler-internal block swap with the surrounding guards, optimistic
  updates, reverts, toasts, and catch blocks byte-identical. The bound
  handler shapes (including the one relocated cast and the
  `throw result.error.cause ?? result.error` re-throw idiom) were
  compile-verified against the real command types and the real
  `BoardSection` interface.
- No e2e-unreachable ambiguity is being absorbed by model strength: the
  section flows aren't driven by any existing spec (see Characterization
  ruling), so the executable unit net IS the fidelity net, which is the
  Pattern K case for the economical model.
- Standard escalation stands: any tsc-forced cast beyond the one bound in
  §5b, any gate mismatch, any line the bindings don't cover → STOP and
  report; do not improvise.
**Pattern:** K reuse (§5.11) — first multi-command group on the canvas
trunk. Same family, same folder: `lib/domain/canvas/` gains the `sections`
aggregate BESIDE `posts` (P6: one canvas repository family; the owner's
one-trunk constraint is satisfied by the FOLDER family — sections is a
different aggregate than posts, so it gets a sibling interface, not methods
bolted onto `PostsRepository`).
**Depends on:** PATCH-025 (the trunk + Pattern K);
CANVASCLIENT_SITE_MAP.md §7 (board_sections designated the first group —
"6 sites, 3 named handlers, self-contained section CRUD, smallest coherent
group"). Site-map line numbers REGENERATED against the live tree at
authoring (CanvasClient byte-unchanged since the map's commit `e04700d`;
all six sites confirmed at 2838/2891/2906/2978/2985/3024 — the map's §5
rows cite the `.from(` lines 2839 etc.; the census below anchors on the
statement starts).

## Group decision (owner question 1)
ALL six `board_sections` sites in one patch — they form four handlers
(`handleAddSection`, `handleRenameSection`, `handleDeleteSection`,
`handleMoveSection`, `handleReorderMapSections`) that are the table's
complete write surface in CanvasClient. Splitting would strand a
half-extracted aggregate; the whole group is still only ~64 changed lines
in the monolith. **No PATCH-027 split needed.** The hooks' 2 board_sections
READ sites (site map §2.1) are NOT in scope — reads are a later program
phase.

## Scope
1. NEW `lib/domain/canvas/sections.ts` — `SectionsRepository` interface +
   FIVE commands: `canvas.createSection`, `canvas.renameSection`,
   `canvas.deleteSection`, `canvas.swapSectionPositions`,
   `canvas.reorderSections` (whole-file bound, §1).
2. NEW `lib/infra/canvas/sectionsRepository.ts` — narrow structural client
   + `SupabaseSectionsRepository` + factory (whole-file bound, §2).
3. NEW unit tests for both (whole-file bound, §3/§4) — suite
   **85/20 → 102/22** (11 domain + 6 infra tests).
4. `app/dashboard/canvas/[id]/CanvasClient.tsx` — six bound edits (§5):
   one import block + five handler-internal swaps. **8,526 → 8,518 lines**
   (the over-ceiling monolith SHRINKS; ceiling rule satisfied).

NOT in scope — byte-untouched, each gated by an empty `git diff`:
`eslint.boundaries.config.mjs` (**NO grandfather movement, 2 → 2** —
CanvasClient keeps 67 other call sites; nobody chases the metric);
`FreeformPadletCards.tsx` (explicitly NOT the next target — it stays LAST
per the standing plan); `components/collabboard/PostCardContent.tsx` and
the PATCH-025 trunk files (`posts.ts`, `posts.test.ts`,
`postsRepository.ts`, `postsRepository.test.ts`); the canvas hooks
directory (their 26 sites incl. 2 board_sections reads are a later phase);
every OTHER CanvasClient call site (61 padlets + 4 boards + 2 storage + 3
auth remain); type-only imports anywhere (the PATCH-022 prohibition); any
UI/behavior change — including the reorder handler's silent error-swallow,
which is PRESERVED and documented, not repaired (no authorization).

## Characterization ruling (before edits)
No existing e2e spec creates, renames, moves, reorders, or deletes a
section (board-lifecycle drives a wall board without sections), and
building one means driving the section-management UI — a new mutation
surface whose flakiness cost exceeds its net value while all five commands'
semantics are pinned by seventeen executable tests instead. What e2e DOES
pin: board-lifecycle renders the canvas page live (CanvasClient mounts,
loads, and paints through the exact module this patch edits — an
import-level or module-scope regression fails it), and the full suite is
the cross-page regression net. Phase A = full existing suite green (27/18
baseline) BEFORE any edit; Phase C = the same suite green after. The unit
tests are the behavior net for the five moved writes (PATCH-025 precedent,
now §5.11 doctrine).

## Pre-edit census (paste ALL output; STOP on any mismatch)
Run in **Git Bash** from the repo root. Shell-bound; gates bind PRINTED
TEXT, never bare exit codes (PATCH-025 Amendment 1). All values measured
2026-07-09 on the live tree.
```bash
# 1. The monolith (8,526 all-lines, 726 blank; PS Measure-Object -> 7,800):
wc -l "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 8526
grep -c "board_sections" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 6
grep -c "\.from('board_sections')" "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 6
grep -c "createSectionsRepository" "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 0 -> prints 0, exit 1
grep -c "userId: null" "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 0 -> prints 0, exit 1
grep -c "domain/canvas" "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 0 -> prints 0, exit 1
grep -c "infra/canvas" "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 0 -> prints 0, exit 1
grep -c "Database error" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 1 (the L2850 console tag, KEPT by §5b)
# 2. Handler-name counts (all must stay IDENTICAL post-edit):
grep -c "handleAddSection" "app/dashboard/canvas/[id]/CanvasClient.tsx"        # 12
grep -c "handleRenameSection" "app/dashboard/canvas/[id]/CanvasClient.tsx"     # 4
grep -c "handleDeleteSection" "app/dashboard/canvas/[id]/CanvasClient.tsx"     # 4
grep -c "handleMoveSection" "app/dashboard/canvas/[id]/CanvasClient.tsx"       # 5
grep -c "handleReorderMapSections" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 2
# 3. Statement anchors (textual; the six .from lines at their live positions):
sed -n "2839p;2891p;2906p;2978p;2985p;3024p" "app/dashboard/canvas/[id]/CanvasClient.tsx"
# expected EXACTLY (indentation included):
#         .from('board_sections')     x2 (2839, 2891 - 8-space indent)
#         .from('board_sections')     ...all six lines print .from('board_sections')
#   (2839/2891/2906 at 8 spaces; 2978/2985 at 8 spaces; 3024 at 12 spaces)
# 4. The trunk exists; the sections files do NOT:
test -e lib/domain/canvas/posts.ts && echo "posts EXISTS" || echo "posts ABSENT"                # posts EXISTS
test -e lib/domain/canvas/sections.ts && echo "sections EXISTS" || echo "sections ABSENT"       # sections ABSENT
test -e lib/infra/canvas/sectionsRepository.ts && echo "sectionsRepo EXISTS" || echo "sectionsRepo ABSENT"  # sectionsRepo ABSENT
# 5. Suite baseline:
npm run test:unit          # 85 tests / 20 files
```
Anything more, less, or different: STOP, report, change nothing.

## Bindings

### 1. NEW file — `lib/domain/canvas/sections.ts` (exact, whole file, 137 lines; CTO compile-verified `tsc --strict` AND unit-tested green at authoring, 2026-07-09)
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

### 2. NEW file — `lib/infra/canvas/sectionsRepository.ts` (exact, whole file, 115 lines; CTO compile-verified)
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

interface SectionsInsertQuery {
  select(): {
    single(): Promise<{ data: Record<string, unknown> | null; error: SupabaseErrorLike | null }>;
  };
}

interface SectionsMutationQuery {
  eq(column: 'id', value: number): Promise<{ error: SupabaseErrorLike | null }>;
}

interface SectionsSupabaseClient {
  from(table: 'board_sections'): {
    insert(payload: {
      board_id: string;
      title: string;
      description: string;
      position: number;
    }): SectionsInsertQuery;
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
(The factory double-cast is the house idiom — §5.11/PATCH-025, not a
deviation. `insertSection` deliberately returns `ok(data)` with data
possibly null, mirroring the vendor `.single()` shape — the page's legacy
`if (data)` guard keeps its exact semantics, including the silent no-op on
the unreachable null-row-no-error state. Do NOT invent an error there.)

### 3. NEW file — `lib/domain/canvas/sections.test.ts` (exact, whole file, 234 lines, 11 tests; CTO ran them GREEN against §1 at authoring)
```ts
import { describe, expect, it } from 'vitest';
import {
  createCreateSectionCommand,
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
  const renameCalls: Array<{ id: number; title: string; updatedAt: string }> = [];
  const positionCalls: Array<{ id: number; fields: SectionPositionFields }> = [];
  const deleteCalls: number[] = [];

  let insertResult: Result<Record<string, unknown> | null, DomainError> = ok({ id: 7 });
  const positionResults: Array<Result<void, DomainError>> = [];
  let renameResult: Result<void, DomainError> = ok(undefined);
  let deleteResult: Result<void, DomainError> = ok(undefined);

  const repository: SectionsRepository = {
    insertSection: async (fields) => {
      insertCalls.push(fields);
      return insertResult;
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
    renameCalls,
    positionCalls,
    deleteCalls,
    setInsertResult(result: Result<Record<string, unknown> | null, DomainError>) {
      insertResult = result;
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

### 4. NEW file — `lib/infra/canvas/sectionsRepository.test.ts` (exact, whole file, 158 lines, 6 tests; CTO ran them GREEN against §2 at authoring)
```ts
import { describe, expect, it } from 'vitest';
import { SupabaseSectionsRepository } from './sectionsRepository';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(options: {
  insertRow?: Record<string, unknown> | null;
  insertError?: FakeError | null;
  mutationError?: FakeError | null;
} = {}) {
  const { insertRow = { id: 41 }, insertError = null, mutationError = null } = options;
  const insertCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const deleteEqCalls: Array<{ column: string; value: number }> = [];
  const eqCalls: Array<{ column: string; value: number }> = [];

  const client = {
    from(table: 'board_sections') {
      expectTable(table);
      return {
        insert(payload: Record<string, unknown>) {
          insertCalls.push(payload);
          return {
            select() {
              return {
                single: async () => ({ data: insertError ? null : insertRow, error: insertError }),
              };
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

### 5. `app/dashboard/canvas/[id]/CanvasClient.tsx` — six bound edits, nothing else
This file uses SINGLE quotes and 2-space indentation. All five handlers
keep their `useCallback` dependency arrays BYTE-IDENTICAL — the `supabase`
entries become unused by the swapped bodies and STAY (removing them changes
memoization identity; not authorized). All guards, optimistic updates,
reverts, toasts, and catch blocks stay byte-identical. Context is
`{ userId: null }` at all five call sites — the commands never read it, the
legacy calls never consulted the user (RLS via the cookie client is the
enforcement, unchanged), and threading the page's `user` state in would
require dependency-array edits this patch forbids.

**5a. Imports.** ADD, immediately after old line 34
(`import { supabaseBrowser } from '@/lib/supabase/browser';`), these 8 lines:
```tsx
import {
  createCreateSectionCommand,
  createDeleteSectionCommand,
  createRenameSectionCommand,
  createReorderSectionsCommand,
  createSwapSectionPositionsCommand,
} from '@/lib/domain/canvas/sections';
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
```

**5b. `handleAddSection`.** REPLACE old lines 2836–2852 — byte-exactly:
```tsx
      // Attempt insert with string ID first (assuming UUID or string-based ID)
      // If your DB expects an integer, ensure canvasId string is a valid number '123'
      const { data, error } = await supabase
        .from('board_sections')
        .insert({
          board_id: canvasId, // Sending as string
          title: sectionName,
          description: '',
          position: position,
        })
        .select()
        .single();

      if (error) {
        console.error('[handleAddSection] Database error:', error);
        throw error;
      }
```
— with exactly this block (17 lines → 12):
```tsx
      const createSection = createCreateSectionCommand(createSectionsRepository());
      const result = await createSection(
        { boardId: canvasId, title: sectionName, position },
        { userId: null }
      );

      if (!result.ok) {
        console.error('[handleAddSection] Database error:', result.error);
        throw result.error.cause ?? result.error;
      }

      const data = result.value as BoardSection | null;
```
Blank-line binding: the replacement's last line is the `const data` line;
the old blank line 2853 SURVIVES between it and the untouched
`if (data) {`. The `data as BoardSection` cast INSIDE the untouched body
stays byte-identical (now a no-op cast — harmless, compile-verified).
The `as BoardSection | null` here is the ONE authorized cast of this
patch: it RELOCATES the legacy `data as BoardSection` boundary cast
(`BoardSection` is already imported from `@/types/collabboard`). The
`throw result.error.cause ?? result.error` re-throw hands the ORIGINAL
supabase error object to the untouched catch, so the user-visible toast
(`e?.message || e?.code || 'Unknown error'`) prints exactly what it printed
before. Everything above (guards, position computation, `sectionName`, the
debug console.log) and below (the whole `if (data)` body, catch, deps)
byte-identical.

**5c. `handleRenameSection`.** REPLACE old lines 2889–2895 — byte-exactly:
```tsx
    try {
      const { error } = await supabase
        .from('board_sections')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', sectionId);

      if (error) throw error;
```
— with exactly this block (7 lines → 5):
```tsx
    try {
      const renameSection = createRenameSectionCommand(createSectionsRepository());
      const result = await renameSection({ sectionId, title }, { userId: null });

      if (!result.ok) throw result.error.cause ?? result.error;
```

**5d. `handleDeleteSection`.** REPLACE old lines 2904–2910 — byte-exactly:
```tsx
    try {
      const { error } = await supabase
        .from('board_sections')
        .delete()
        .eq('id', sectionId);

      if (error) throw error;
```
— with exactly this block (7 lines → 5):
```tsx
    try {
      const deleteSection = createDeleteSectionCommand(createSectionsRepository());
      const result = await deleteSection({ sectionId }, { userId: null });

      if (!result.ok) throw result.error.cause ?? result.error;
```

**5e. `handleMoveSection`.** REPLACE old lines 2975–2989 — byte-exactly:
```tsx
    try {
      // Update both sections in database
      const { error: error1 } = await supabase
        .from('board_sections')
        .update({ position: neighborPosition, updated_at: new Date().toISOString() })
        .eq('id', currentSection.id);

      if (error1) throw error1;

      const { error: error2 } = await supabase
        .from('board_sections')
        .update({ position: currentPosition, updated_at: new Date().toISOString() })
        .eq('id', neighborSection.id);

      if (error2) throw error2;
```
— with exactly this block (15 lines → 12):
```tsx
    try {
      // Update both sections in database (sequential, stop on first error)
      const swapPositions = createSwapSectionPositionsCommand(createSectionsRepository());
      const result = await swapPositions(
        {
          first: { sectionId: currentSection.id, position: neighborPosition },
          second: { sectionId: neighborSection.id, position: currentPosition },
        },
        { userId: null }
      );

      if (!result.ok) throw result.error.cause ?? result.error;
```
The optimistic update above and the catch's revert below stay
byte-identical — a first-update failure reverts BOTH positions in state
exactly as before (the DB partial-failure semantics live in the command).

**5f. `handleReorderMapSections`.** REPLACE old lines 3020–3028 — byte-exactly:
```tsx
    try {
      await Promise.all(
        numericIds.map((id, idx) =>
          supabase
            .from('board_sections')
            .update({ position: idx, updated_at: new Date().toISOString() })
            .eq('id', id)
        )
      );
```
— with exactly this block (9 lines → 5):
```tsx
    try {
      const reorderSections = createReorderSectionsCommand(createSectionsRepository());
      const result = await reorderSections({ sectionIds: numericIds }, { userId: null });

      if (!result.ok) throw result.error.cause ?? result.error;
```
Semantics note (bound, not a deviation): row-level DB errors resolve to ok
inside the command (the preserved legacy swallow — §1 comment + test 10),
so the catch/revert below fires exactly when it fired before: on THROWN
errors only.

**EVERYTHING else in the file byte-identical.** Net: 8,526 → **8,518**
lines (+8 imports, −5 −2 −2 −3 −4 across the five handlers).

## Verification sequence (paste real output for every step)
Operational rules — ALL binding: banner-port rule; `Get-NetTCPConnection
-LocalPort 3000 -State Listen` count is the ONLY port gate; shell-bound
numerics; gates bind printed text, never exit codes; **stale `.next/types`
rule: if tsc names a file absent from `git ls-files`, stop the server,
delete `.next`, restart, re-probe, rerun tsc before suspecting source**;
before ANY commit read `git status --short` — a staged line you did not
create is a STOP signal; commit with the explicit pathspec below (note the
`:(literal)` magic — `[id]` is a character class in default git pathspecs,
same trap as the ESLint-glob lesson; the literal form was CTO-verified);
**full disclosure rule: report EVERY off-spec line, number, whitespace
difference, comment difference, and EOL byte — including in test files and
including changes you judge harmless. EOL bytes are checked at review with
`cmp -l`, not eyeballs (PATCH-025 finding), so an editor's silent CRLF/LF
normalization WILL be seen: disclose it or it becomes a review finding.**

```bash
# Phase A — baseline on the OLD tree (dev server running, banner port verified):
PW_BASE_URL=http://localhost:3000 npx playwright test
# expected: 27 passed / 18 files. board-lifecycle mounts CanvasClient live.
# If the number differs, REPORT it before edits.

# Phase B — implement §1-§5, then:
npm run test:unit
# expected: 102 tests / 22 files (85 + 11 domain + 6 infra; 20 + 2 files)
npx tsc --noEmit           # 0 errors; zero casts beyond §2's factory idiom + §5b's bound relocation
# per-file greps (Git Bash) — derived from measured pre-edit + additions - deletions:
grep -c "board_sections" "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 6 -> 0 (prints 0, exit 1;
#   the new import paths say 'canvas/sections' which does NOT contain 'board_sections')
grep -c "\.from('board_sections')" "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 6 -> 0 (prints 0, exit 1)
grep -c "createSectionsRepository" "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 0 -> 6 (1 import + 5 handler uses)
grep -c "userId: null" "app/dashboard/canvas/[id]/CanvasClient.tsx"     # 0 -> 5
grep -c "domain/canvas" "app/dashboard/canvas/[id]/CanvasClient.tsx"    # 0 -> 1
grep -c "infra/canvas" "app/dashboard/canvas/[id]/CanvasClient.tsx"     # 0 -> 1
grep -c "Database error" "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 1 -> 1 (tag preserved in §5b)
grep -c "handleAddSection" "app/dashboard/canvas/[id]/CanvasClient.tsx"        # 12 -> 12
grep -c "handleRenameSection" "app/dashboard/canvas/[id]/CanvasClient.tsx"     # 4 -> 4
grep -c "handleDeleteSection" "app/dashboard/canvas/[id]/CanvasClient.tsx"     # 4 -> 4
grep -c "handleMoveSection" "app/dashboard/canvas/[id]/CanvasClient.tsx"       # 5 -> 5
grep -c "handleReorderMapSections" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 2 -> 2
wc -l "app/dashboard/canvas/[id]/CanvasClient.tsx"                      # 8526 -> 8518
# new files fast gates (byte-equality is the reviewer's check):
wc -l lib/domain/canvas/sections.ts             # 137
wc -l lib/infra/canvas/sectionsRepository.ts    # 115
wc -l lib/domain/canvas/sections.test.ts        # 234
grep -c "it(" lib/domain/canvas/sections.test.ts        # 11
wc -l lib/infra/canvas/sectionsRepository.test.ts       # 158
grep -c "it(" lib/infra/canvas/sectionsRepository.test.ts  # 6
# byte-untouched gates (ALL must print nothing):
git diff --ignore-space-at-eol -- eslint.boundaries.config.mjs
git diff --ignore-space-at-eol -- components/collabboard/canvas/ui/FreeformPadletCards.tsx components/collabboard/PostCardContent.tsx
git diff --ignore-space-at-eol -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts
git diff --ignore-space-at-eol -- components/collabboard/canvas/hooks/
npm run check:boundaries   # green (CanvasClient still grandfathered; list untouched, 2 -> 2)

# Phase C — e2e (dev server, banner port verified):
PW_BASE_URL=http://localhost:3000 npx playwright test
# expected: 27 passed / 18 files - identical to Phase A. No spec changed.

# FINAL (owner stops the dev server first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # 0 - this gate, no other port check
npm run verify             # typecheck + boundaries + unit + production build, all green
git status --porcelain     # clean after the commit
```

## Deviation rule (binding)
Report EVERY line that differs from the bindings — imports, whitespace,
comments, quote style, EOL bytes, and any gate NUMBER that comes out
different. Expected deviations: **NONE.** If tsc forces a cast anywhere
beyond the two named idioms, STOP and report; do not add it.

## Commit
ONE atomic commit (all six §Bindings items). Before staging: read
`git status --short` — any entry you did not create is a STOP. Commit with
the explicit pathspec (`:(literal)` is REQUIRED for the `[id]` segment):
```
git commit -m "refactor(canvas): extract the board_sections group onto the canvas ops seam -- five section commands, Pattern K (PATCH-026)" -- lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts lib/infra/canvas/sectionsRepository.ts lib/infra/canvas/sectionsRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```
(New files must be `git add`-ed first — a pathspec commit only picks up
tracked changes.)

## Rollback
Single `git revert` (new files deleted, CanvasClient restored).

## Acceptance Criteria
- [ ] Pre-edit census pasted, matches ALL blocks incl. the six anchor lines
- [ ] Phase A: 27/18 green pasted BEFORE any edit
- [ ] All four new files byte-equal to §1–§4 (reviewer diffs; fast gates 137/115/234·11/158·6)
- [ ] CanvasClient edits exactly §5a–§5f incl. both blank-line bindings; file 8,518 lines
- [ ] Dependency arrays byte-identical (the now-unused `supabase` entries STAY)
- [ ] `npm run test:unit` 102/22; tsc 0; boundaries green
- [ ] All byte-untouched diffs EMPTY (config, FreeformPadletCards, PostCardContent, trunk files, hooks)
- [ ] Grandfather list untouched: 2 → 2 (no metric chasing)
- [ ] Phase C: 27/18 green, no spec file changed
- [ ] Stopped-server gate 0; `npm run verify` green; status clean
- [ ] Single atomic `:(literal)` pathspec commit; hash reported; every off-spec line/number/whitespace/comment/EOL byte disclosed (expected: none)

## Reviewer checklist (CTO or successor; §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] Byte-diff all four new files against the CTO's scratch-verified copies
      (§1/§2 fenced here; §3/§4 delivered with the handoff) — then rerun
      the 17 tests against the implemented tree
- [ ] Diff CanvasClient vs bindings; the ONLY changes are §5a–§5f; check
      both blank-line survivals and run `cmp`-level EOL checks on the edit
      neighborhoods (PATCH-025 finding — mixed-EOL files normalize silently)
- [ ] Confirm the reorder swallow-test (test 10) still asserts ok-on-row-error
      — it is the guard that the preserved defect stays PRESERVED, not fixed
- [ ] Confirm zero dependency-array drift (byte-compare the five arrays)
- [ ] At review closeout: PATCH_REFERENCE §7 row (+§5.11 reuse note);
      CURRENT_TASK batch row + the queued-defect entry for the reorder
      swallow if not already logged; health per §12 (the monolith SHRANK
      for the first time — architecture movement is finally arguable);
      LESSONS_LEARNED only if something new surfaced

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 026,
`{{TITLE}}` = board_sections group onto the canvas ops seam. Add:
"Read `.fable5/docs/PATCH_REFERENCE.md` §5.11 and §6 first, then
`.fable5/docs/CANVASCLIENT_SITE_MAP.md` §2–§3 for what you must NOT touch.
Four new files are whole-file bound; the 17 unit tests were already run
green by the CTO — if one fails against your implementation, your
implementation deviates; fix it to the binding, never edit a test.
CanvasClient gets exactly six bound edits; its other 70 supabase call
sites, its dependency arrays, and every guard/toast/catch/revert are
byte-identical. The reorder command PRESERVES a legacy error-swallow on
purpose — do not 'fix' it. Read the dev-server banner port. If tsc names a
ghost file, apply the stale-.next/types rule. Before staging read
`git status --short` — a line you didn't create is a STOP. Commit with the
bound `:(literal)` pathspec (the `[id]` directory is a glob character
class otherwise). Report every off-spec line, number, whitespace, comment,
and EOL byte. E2E credentials are in `.env.local` — never print them.
Final `npm run verify` only after the owner stops the server."

## Estimated Difficulty
medium — five swap sites instead of PATCH-025's one, but each is the same
bounded shape (construct command, await, throw-the-cause on failure) and
the highest-risk semantics (partial failure, preserved swallow) are locked
by pre-verified tests; the residual risk is fidelity inside a 8.5k-line
file and resisting any adjacent cleanup.
