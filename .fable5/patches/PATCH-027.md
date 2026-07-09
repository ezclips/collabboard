# PATCH-027 — Canvas strangler, group 2: the `boards` update family onto the ops seam (four commands, Pattern K)

**Status:** READY (authored 2026-07-10; owner approval pending)
**Complexity:** medium (four NEW whole-file-bound files + FIVE bound edits
to CanvasClient — one import block + four handler-internal swaps; third
consecutive Pattern K application)
**Assigned model:** **GPT-5.4 — acceptable**, per the §5.11 ruling proven
twice (PATCH-025, PATCH-026 both byte-perfect first-attempt):
- All four commands' semantics — including the two risky ones, the
  map-style write's DELIBERATE missing timestamp and the chrono-mode
  write's PRESERVED legacy error-swallow — are locked by **fifteen bound
  unit tests the CTO compiled AND ran GREEN against the bound
  implementation at authoring** (scratch `tsc --strict` clean, scratch
  vitest 15/15). The no-timestamp fact has BOTH a domain test (dedicated
  repository method) and an infra test asserting
  `Object.keys(payload) === ['settings']`.
- Every new file is whole-file bound; every CanvasClient edit is a bounded
  handler-internal swap with guards, optimistic state, toasts, serializers,
  and catch blocks byte-identical around it. All four handler shapes —
  including the ONE new cast (`as object` in the scope-annotated re-throw)
  and the relocated legacy `as any` — were compile-verified against the
  real command types.
- The board flows aren't driven by any existing e2e spec (see
  Characterization ruling); the executable unit net is the fidelity net —
  the Pattern K case for the economical model.
- Standard escalation: any tsc-forced cast beyond the two named in §5, any
  gate mismatch, any line the bindings don't cover → STOP and report.
**Pattern:** K reuse (§5.11) — third group on the canvas trunk.
`lib/domain/canvas/board.ts` joins `posts.ts` and `sections.ts` as a
sibling aggregate (one canvas folder family, P6). **P6 collision ruling
(CTO, measured):** `lib/domain/boards/repository.ts` (the PATCH-003
exemplar `BoardRepository` — lifecycle reads + `softDelete`) has ZERO
importers and ZERO implementations (`grep -rln "domain/boards\|
BoardRepository"` outside its own file: empty; no `lib/infra/boards`
exists). It is a different concern (dashboard lifecycle vs canvas-page
appearance/settings writes), stays BYTE-UNTOUCHED, and no implementation
is duplicated because none exists. The new interface is named
`CanvasBoardRepository` to keep the two unconfusable.
**Depends on:** PATCH-025/026 (the trunk + Pattern K);
CANVASCLIENT_SITE_MAP.md §7 (boards updates designated group 2). Site-map
line numbers REGENERATED against the live tree at authoring (the map's
pre-026 numbers are stale by construction): the four sites live at
**1062 / 1159 / 4068 / 4311** today, in `handleMapStyleChange`,
`persistFreeformBoardAppearance`, `setAsPadletCover`, and
`handleChronoModeChange`.

## Group decision (owner question 1)
ALL four `boards` update sites in one patch — they are the table's complete
write surface in CanvasClient (the census confirms exactly 4
`.from('boards')` sites, all updates), spread across four independent
handlers with no ordering coupling. Splitting a four-site group would
manufacture patch overhead for no risk reduction. **No PATCH-028 split
needed.** The hooks' 1 boards READ site (site map §2.1) is NOT in scope —
reads are a later program phase.

## The four sites and their THREE different legacy error semantics (read before implementing)
1. **`handleMapStyleChange`** (map style → `settings` merge): resolved DB
   error → toast-and-RETURN (no throw); the write sends **NO updated_at**
   — both facts are deliberate legacy behavior and both are bound.
2. **`persistFreeformBoardAppearance`** (background type/value): resolved
   DB error → `throw Object.assign(error, { scope: 'background' })` — the
   scope annotation feeds the handler's elaborate error serializer, and is
   PRESERVED via the bound re-throw.
3. **`setAsPadletCover`** (cover metadata): resolved DB error → plain
   throw → catch → toast. The write REPLACES `boards.metadata` wholesale
   with exactly `{cover_post_id, cover_image}` — no spread; preserved.
4. **`handleChronoModeChange`** (chrono mode → `settings` merge):
   **resolved DB errors are silently SWALLOWED** (the legacy handler never
   destructures the response; only a thrown network error reaches its
   catch) — the same legacy-defect family as PATCH-026's reorder,
   PRESERVED faithfully, documented in the bound §1 comment, tested, and
   queued (see CURRENT_TASK's standing decision — extend it to name this
   second site at review closeout). Do NOT repair it.

## Scope
1. NEW `lib/domain/canvas/board.ts` — `CanvasBoardRepository` interface +
   FOUR commands: `canvas.setMapStyle`, `canvas.setBoardBackground`,
   `canvas.setBoardCover`, `canvas.setChronoMode` (whole-file bound, §1).
2. NEW `lib/infra/canvas/boardRepository.ts` — narrow structural client +
   `SupabaseCanvasBoardRepository` + factory (whole-file bound, §2).
3. NEW unit tests for both (whole-file bound, §3/§4) — suite
   **102/22 → 117/24** (10 domain + 5 infra tests).
4. `app/dashboard/canvas/[id]/CanvasClient.tsx` — five bound edits (§5):
   one import block + four handler-internal swaps. **8,518 → 8,517 lines**
   (the over-ceiling monolith shrinks again; ceiling rule satisfied).

NOT in scope — byte-untouched, each gated by an empty `git diff`:
`lib/domain/boards/repository.ts` (the exemplar — P6 ruling above);
`eslint.boundaries.config.mjs` (**NO grandfather movement, 2 → 2**);
`FreeformPadletCards.tsx` (not required — it contains zero `boards`
sites); `PostCardContent.tsx`; the PATCH-025/026 trunk files (posts.*,
sections.*, postsRepository.*, sectionsRepository.*); the canvas hooks;
every OTHER CanvasClient call site (61 padlets + 2 storage + 3 auth
remain); type-only imports anywhere; any behavior change — including BOTH
preserved defects above and the missing map-style timestamp.

## Characterization ruling (before edits)
No existing e2e spec changes a map style, board background, board cover,
or chrono mode (board-lifecycle drives a wall board and touches none of
these), and building one means driving map/freeform/timeline chrome — new
mutation surfaces with flakiness cost exceeding net value while all four
commands' semantics are pinned by fifteen executable tests. What e2e DOES
pin: board-lifecycle mounts CanvasClient live (module-scope or
import-level regressions fail it) and the full suite is the cross-page
net. Phase A = full suite green (27/18) BEFORE any edit; Phase C = same
suite green after. (§5.11 doctrine, third application.)

## Pre-edit census (paste ALL output; STOP on any mismatch)
Run in **Git Bash** from the repo root. Gates bind PRINTED TEXT, never
bare exit codes. All values measured 2026-07-10 on the live tree
(post-PATCH-026).
```bash
# 1. The monolith (8,518 all-lines, 726 blank; PS Measure-Object -> 7,792):
wc -l "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 8518
grep -c "\.from('boards')" "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 4
grep -c "'boards'" "app/dashboard/canvas/[id]/CanvasClient.tsx"       # 4 (the same four lines)
grep -c "createCanvasBoardRepository" "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 0 -> prints 0, exit 1
grep -c "userId: null" "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 5 (PATCH-026's five sites)
grep -c "domain/canvas" "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 1
grep -c "infra/canvas" "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 1
grep -c "nextSettings" "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 2 (def + use, both inside site 1's replaced block)
grep -c "updatedSettings" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 2 (def + use, both inside site 4's replaced block)
grep -c "backgroundResponse" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 3 (all inside site 2's replaced block)
grep -c "currentSettings" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 2 (site 4's def line, which STAYS, + its use on the deleted line)
grep -c "scope: 'background'" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 1 (preserved by §5c)
# 2. Handler-name counts (all must stay IDENTICAL post-edit):
grep -c "handleMapStyleChange" "app/dashboard/canvas/[id]/CanvasClient.tsx"          # 2
grep -c "persistFreeformBoardAppearance" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 3
grep -c "setAsPadletCover" "app/dashboard/canvas/[id]/CanvasClient.tsx"              # 3
grep -c "handleChronoModeChange" "app/dashboard/canvas/[id]/CanvasClient.tsx"        # 4
# 3. Statement anchors (textual; the four .from lines at their live positions):
sed -n "1062p;1159p;4068p;4311p" "app/dashboard/canvas/[id]/CanvasClient.tsx"
# expected EXACTLY four lines, each `.from('boards')`:
#   1062 and 4068 at 8-space indent; 1159 and 4311 at 10-space indent
# 4. The trunk exists; the board files do NOT; the exemplar is present:
test -e lib/domain/canvas/sections.ts && echo "sections EXISTS" || echo "sections ABSENT"   # sections EXISTS
test -e lib/domain/canvas/board.ts && echo "board EXISTS" || echo "board ABSENT"            # board ABSENT
test -e lib/infra/canvas/boardRepository.ts && echo "boardRepo EXISTS" || echo "boardRepo ABSENT"  # boardRepo ABSENT
test -e lib/domain/boards/repository.ts && echo "exemplar EXISTS" || echo "exemplar ABSENT" # exemplar EXISTS (byte-untouched by this patch)
# 5. Suite baseline:
npm run test:unit          # 102 tests / 22 files
```
Anything more, less, or different: STOP, report, change nothing.

## Bindings

### 1. NEW file — `lib/domain/canvas/board.ts` (exact, whole file, 124 lines; CTO compile-verified `tsc --strict` AND unit-tested green at authoring, 2026-07-10)
```ts
import { z } from 'zod';
import { defineCommand } from '../core/command';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import { ok } from '../core/result';

/**
 * PATCH-027: the boards-row write group of the canvas seam - same family as
 * posts.ts and sections.ts (one canvas aggregate folder, P6). This is the
 * CANVAS PAGE's board-appearance/settings surface; the unconsumed exemplar
 * interface in lib/domain/boards/repository.ts (lifecycle reads +
 * softDelete, no implementation, no importers) is a different concern and
 * stays untouched.
 */

export interface BoardBackgroundFields {
  readonly backgroundType: string;
  readonly backgroundValue: string;
  readonly updatedAt: string;
}

export interface BoardCoverFields {
  readonly coverPostId: string;
  readonly coverImage: string | null;
  readonly updatedAt: string;
}

export interface CanvasBoardRepository {
  /** Legacy map-style write sends NO updated_at (old L1063) - dedicated method. */
  updateSettings(
    id: string,
    fields: { readonly settings: Record<string, unknown> },
  ): Promise<Result<void, DomainError>>;
  updateSettingsStamped(
    id: string,
    fields: { readonly settings: Record<string, unknown>; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>>;
  updateBackground(id: string, fields: BoardBackgroundFields): Promise<Result<void, DomainError>>;
  updateCover(id: string, fields: BoardCoverFields): Promise<Result<void, DomainError>>;
}

export const setMapStyleSchema = z.object({
  boardId: z.string(),
  styleId: z.string(),
  /** The board's CURRENT settings JSONB, passed through untyped (legacy shape). */
  currentSettings: z.record(z.string(), z.unknown()),
});

export const createSetMapStyleCommand = (repository: CanvasBoardRepository) =>
  defineCommand({
    name: 'canvas.setMapStyle',
    input: setMapStyleSchema,
    execute: async (input) =>
      // Merge preserved from old L1057-1060; deliberately NO updated_at -
      // the legacy write never sent one (old L1063).
      repository.updateSettings(input.boardId, {
        settings: { ...input.currentSettings, mapStyleId: input.styleId },
      }),
  });

export const setBoardBackgroundSchema = z.object({
  boardId: z.string(),
  backgroundType: z.string(),
  backgroundValue: z.string(),
});

export const createSetBoardBackgroundCommand = (repository: CanvasBoardRepository) =>
  defineCommand({
    name: 'canvas.setBoardBackground',
    input: setBoardBackgroundSchema,
    execute: async (input) =>
      repository.updateBackground(input.boardId, {
        backgroundType: input.backgroundType,
        backgroundValue: input.backgroundValue,
        updatedAt: new Date().toISOString(),
      }),
  });

export const setBoardCoverSchema = z.object({
  boardId: z.string(),
  coverPostId: z.string(),
  coverImage: z.string().nullable(),
});

export const createSetBoardCoverCommand = (repository: CanvasBoardRepository) =>
  defineCommand({
    name: 'canvas.setBoardCover',
    input: setBoardCoverSchema,
    execute: async (input) =>
      // The legacy write REPLACES boards.metadata wholesale with exactly
      // these two keys (old L4070-4073) - no spread of existing metadata.
      repository.updateCover(input.boardId, {
        coverPostId: input.coverPostId,
        coverImage: input.coverImage,
        updatedAt: new Date().toISOString(),
      }),
  });

export const setChronoModeSchema = z.object({
  boardId: z.string(),
  mode: z.string(),
  /** The board's CURRENT settings JSONB, passed through untyped (legacy shape). */
  currentSettings: z.record(z.string(), z.unknown()),
});

export const createSetChronoModeCommand = (repository: CanvasBoardRepository) =>
  defineCommand({
    name: 'canvas.setChronoMode',
    input: setChronoModeSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (old L4310-4316; queued P3-family fix, do
      // NOT repair here): the legacy handler awaited the raw builder and
      // never read the resolved `error` field, so database-level failures
      // were silently swallowed - only a THROWN network error reached its
      // catch. Faithful port: perform the write and ignore the resolved
      // Result; a thrown exception still rejects, escapes execute, and
      // surfaces via defineCommand's catch.
      await repository.updateSettingsStamped(input.boardId, {
        settings: { ...input.currentSettings, chronoMode: input.mode },
        updatedAt: new Date().toISOString(),
      });
      return ok(undefined);
    },
  });
```

### 2. NEW file — `lib/infra/canvas/boardRepository.ts` (exact, whole file, 115 lines; CTO compile-verified)
```ts
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type {
  BoardBackgroundFields,
  BoardCoverFields,
  CanvasBoardRepository,
} from '../../domain/canvas/board';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface BoardsMutationQuery {
  eq(column: 'id', value: string): Promise<{ error: SupabaseErrorLike | null }>;
}

interface BoardsSupabaseClient {
  from(table: 'boards'): {
    update(
      payload:
        | { settings: Record<string, unknown> }
        | { settings: Record<string, unknown>; updated_at: string }
        | { background_type: string; background_value: string; updated_at: string }
        | {
            metadata: { cover_post_id: string; cover_image: string | null };
            updated_at: string;
          },
    ): BoardsMutationQuery;
  };
}

export class SupabaseCanvasBoardRepository implements CanvasBoardRepository {
  constructor(private readonly client: BoardsSupabaseClient) {}

  async updateSettings(
    id: string,
    fields: { readonly settings: Record<string, unknown> },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('boards')
      .update({ settings: fields.settings })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not save the board settings', { cause: error }));
    }

    return ok(undefined);
  }

  async updateSettingsStamped(
    id: string,
    fields: { readonly settings: Record<string, unknown>; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('boards')
      .update({ settings: fields.settings, updated_at: fields.updatedAt })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not save the board settings', { cause: error }));
    }

    return ok(undefined);
  }

  async updateBackground(
    id: string,
    fields: BoardBackgroundFields,
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('boards')
      .update({
        background_type: fields.backgroundType,
        background_value: fields.backgroundValue,
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not save the board background', { cause: error }));
    }

    return ok(undefined);
  }

  async updateCover(id: string, fields: BoardCoverFields): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('boards')
      .update({
        metadata: {
          cover_post_id: fields.coverPostId,
          cover_image: fields.coverImage,
        },
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not save the board cover', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createCanvasBoardRepository(): CanvasBoardRepository {
  return new SupabaseCanvasBoardRepository(
    createBrowserSupabaseClient() as unknown as BoardsSupabaseClient,
  );
}
```
(The factory double-cast is the house idiom. `updateSettings` and
`updateSettingsStamped` are DELIBERATELY separate methods — merging them
with an optional field would let a future caller silently add or drop the
timestamp; the split makes the map-style write's missing `updated_at` a
typed fact, and the infra test asserts the payload has EXACTLY one key.)

### 3. NEW file — `lib/domain/canvas/board.test.ts` (exact, whole file, 247 lines, 10 tests; CTO ran them GREEN against §1 at authoring)
```ts
import { describe, expect, it } from 'vitest';
import {
  createSetBoardBackgroundCommand,
  createSetBoardCoverCommand,
  createSetChronoModeCommand,
  createSetMapStyleCommand,
} from './board';
import type { BoardBackgroundFields, BoardCoverFields, CanvasBoardRepository } from './board';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const ctx = { userId: null };

function createFakeRepository() {
  const settingsCalls: Array<{ id: string; settings: Record<string, unknown> }> = [];
  const stampedCalls: Array<{
    id: string;
    settings: Record<string, unknown>;
    updatedAt: string;
  }> = [];
  const backgroundCalls: Array<{ id: string; fields: BoardBackgroundFields }> = [];
  const coverCalls: Array<{ id: string; fields: BoardCoverFields }> = [];

  let settingsResult: Result<void, DomainError> = ok(undefined);
  let stampedResult: Result<void, DomainError> = ok(undefined);
  let backgroundResult: Result<void, DomainError> = ok(undefined);
  let coverResult: Result<void, DomainError> = ok(undefined);

  const repository: CanvasBoardRepository = {
    updateSettings: async (id, fields) => {
      settingsCalls.push({ id, settings: fields.settings });
      return settingsResult;
    },
    updateSettingsStamped: async (id, fields) => {
      stampedCalls.push({ id, settings: fields.settings, updatedAt: fields.updatedAt });
      return stampedResult;
    },
    updateBackground: async (id, fields) => {
      backgroundCalls.push({ id, fields });
      return backgroundResult;
    },
    updateCover: async (id, fields) => {
      coverCalls.push({ id, fields });
      return coverResult;
    },
  };

  return {
    repository,
    settingsCalls,
    stampedCalls,
    backgroundCalls,
    coverCalls,
    setSettingsResult(result: Result<void, DomainError>) {
      settingsResult = result;
    },
    setStampedResult(result: Result<void, DomainError>) {
      stampedResult = result;
    },
    setBackgroundResult(result: Result<void, DomainError>) {
      backgroundResult = result;
    },
    setCoverResult(result: Result<void, DomainError>) {
      coverResult = result;
    },
  };
}

describe('canvas.setMapStyle', () => {
  it('merges the style into current settings preserving other keys and writes WITHOUT a timestamp', async () => {
    const fake = createFakeRepository();
    const setMapStyle = createSetMapStyleCommand(fake.repository);

    const result = await setMapStyle(
      {
        boardId: 'board-1',
        styleId: 'mapbox://styles/mapbox/dark-v11',
        currentSettings: { chronoMode: 'week', mapStyleId: 'mapbox://styles/mapbox/streets-v11' },
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.settingsCalls).toEqual([
      {
        id: 'board-1',
        settings: { chronoMode: 'week', mapStyleId: 'mapbox://styles/mapbox/dark-v11' },
      },
    ]);
    expect(fake.stampedCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setSettingsResult(err(domainError('unavailable', 'db down')));
    const setMapStyle = createSetMapStyleCommand(fake.repository);

    const result = await setMapStyle(
      { boardId: 'board-1', styleId: 'style-x', currentSettings: {} },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.setBoardBackground', () => {
  it('sends the background type and value with an ISO timestamp to the right board', async () => {
    const fake = createFakeRepository();
    const setBoardBackground = createSetBoardBackgroundCommand(fake.repository);

    const result = await setBoardBackground(
      { boardId: 'board-1', backgroundType: 'gradient', backgroundValue: 'linear-gradient(#fff, #000)' },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.backgroundCalls).toHaveLength(1);
    expect(fake.backgroundCalls[0].id).toBe('board-1');
    expect(fake.backgroundCalls[0].fields.backgroundType).toBe('gradient');
    expect(fake.backgroundCalls[0].fields.backgroundValue).toBe('linear-gradient(#fff, #000)');
    expect(new Date(fake.backgroundCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.backgroundCalls[0].fields.updatedAt,
    );
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setBackgroundResult(err(domainError('unavailable', 'db down')));
    const setBoardBackground = createSetBoardBackgroundCommand(fake.repository);

    const result = await setBoardBackground(
      { boardId: 'board-1', backgroundType: 'color', backgroundValue: '#f3f4f6' },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.setBoardCover', () => {
  it('sends the wholesale cover metadata with an ISO timestamp', async () => {
    const fake = createFakeRepository();
    const setBoardCover = createSetBoardCoverCommand(fake.repository);

    const result = await setBoardCover(
      { boardId: 'board-1', coverPostId: 'post-9', coverImage: 'https://x.test/cover.png' },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.coverCalls).toHaveLength(1);
    expect(fake.coverCalls[0].id).toBe('board-1');
    expect(fake.coverCalls[0].fields.coverPostId).toBe('post-9');
    expect(fake.coverCalls[0].fields.coverImage).toBe('https://x.test/cover.png');
    expect(new Date(fake.coverCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.coverCalls[0].fields.updatedAt,
    );
  });

  it('accepts a null cover image (legacy imageUrl || null path)', async () => {
    const fake = createFakeRepository();
    const setBoardCover = createSetBoardCoverCommand(fake.repository);

    const result = await setBoardCover(
      { boardId: 'board-1', coverPostId: 'post-9', coverImage: null },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.coverCalls[0].fields.coverImage).toBeNull();
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setCoverResult(err(domainError('unavailable', 'db down')));
    const setBoardCover = createSetBoardCoverCommand(fake.repository);

    const result = await setBoardCover(
      { boardId: 'board-1', coverPostId: 'post-9', coverImage: null },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.setChronoMode', () => {
  it('merges the chrono mode into current settings with an ISO timestamp', async () => {
    const fake = createFakeRepository();
    const setChronoMode = createSetChronoModeCommand(fake.repository);

    const result = await setChronoMode(
      { boardId: 'board-1', mode: 'month', currentSettings: { mapStyleId: 'style-x' } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.stampedCalls).toHaveLength(1);
    expect(fake.stampedCalls[0].id).toBe('board-1');
    expect(fake.stampedCalls[0].settings).toEqual({ mapStyleId: 'style-x', chronoMode: 'month' });
    expect(new Date(fake.stampedCalls[0].updatedAt).toISOString()).toBe(
      fake.stampedCalls[0].updatedAt,
    );
    expect(fake.settingsCalls).toHaveLength(0);
  });

  it('preserves the legacy error-swallow: a repository failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setStampedResult(err(domainError('unavailable', 'db down')));
    const setChronoMode = createSetChronoModeCommand(fake.repository);

    const result = await setChronoMode(
      { boardId: 'board-1', mode: 'week', currentSettings: {} },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.stampedCalls).toHaveLength(1);
  });
});

describe('input validation', () => {
  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const setMapStyle = createSetMapStyleCommand(fake.repository);

    const result = await setMapStyle({ boardId: 'board-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.settingsCalls).toHaveLength(0);
  });
});
```

### 4. NEW file — `lib/infra/canvas/boardRepository.test.ts` (exact, whole file, 117 lines, 5 tests; CTO ran them GREEN against §2 at authoring)
```ts
import { describe, expect, it } from 'vitest';
import { SupabaseCanvasBoardRepository } from './boardRepository';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(mutationError: FakeError | null = null) {
  const tables: string[] = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const eqCalls: Array<{ column: string; value: string }> = [];

  const client = {
    from(table: 'boards') {
      tables.push(table);
      return {
        update(payload: Record<string, unknown>) {
          updateCalls.push(payload);
          return {
            eq: async (column: 'id', value: string) => {
              eqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
      };
    },
  };

  return { client, tables, updateCalls, eqCalls };
}

describe('SupabaseCanvasBoardRepository', () => {
  it('updateSettings sends ONLY the settings payload - no updated_at key', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateSettings('board-1', {
      settings: { mapStyleId: 'style-x' },
    });

    expect(result.ok).toBe(true);
    expect(fake.tables).toEqual(['boards']);
    expect(fake.updateCalls).toEqual([{ settings: { mapStyleId: 'style-x' } }]);
    expect(Object.keys(fake.updateCalls[0])).toEqual(['settings']);
    expect(fake.eqCalls).toEqual([{ column: 'id', value: 'board-1' }]);
  });

  it('updateSettingsStamped sends settings plus updated_at', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateSettingsStamped('board-1', {
      settings: { chronoMode: 'month' },
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([
      { settings: { chronoMode: 'month' }, updated_at: '2026-07-10T08:00:00.000Z' },
    ]);
  });

  it('updateBackground sends the snake_case background payload', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateBackground('board-1', {
      backgroundType: 'image',
      backgroundValue: 'https://x.test/bg.png',
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([
      {
        background_type: 'image',
        background_value: 'https://x.test/bg.png',
        updated_at: '2026-07-10T08:00:00.000Z',
      },
    ]);
  });

  it('updateCover sends the wholesale metadata payload', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateCover('board-1', {
      coverPostId: 'post-9',
      coverImage: null,
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([
      {
        metadata: { cover_post_id: 'post-9', cover_image: null },
        updated_at: '2026-07-10T08:00:00.000Z',
      },
    ]);
  });

  it('maps a mutation error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const fake = createFakeClient(supabaseError);
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateSettings('board-1', { settings: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
```

### 5. `app/dashboard/canvas/[id]/CanvasClient.tsx` — five bound edits, nothing else
All handlers keep their `useCallback` dependency arrays BYTE-IDENTICAL.
Context is `{ userId: null }` at all four call sites (PATCH-026 ruling
unchanged: the commands never read it, the legacy calls never consulted
the user, and threading `user` in would require dep-array edits).
TWO authorized casts, both bound below and named here: (a) §5c's
`as object` inside the scope-annotated re-throw (replaces untyped access
on the legacy thrown `any`); (b) §5b's inline
`((canvas?.settings as any) || {})` — the RELOCATED legacy cast from the
deleted `nextSettings` lines (old L1058), not a new one.

**5a. Imports.** ADD, immediately after current line 42
(`import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';`),
these 7 lines:
```tsx
import {
  createSetBoardBackgroundCommand,
  createSetBoardCoverCommand,
  createSetChronoModeCommand,
  createSetMapStyleCommand,
} from '@/lib/domain/canvas/board';
import { createCanvasBoardRepository } from '@/lib/infra/canvas/boardRepository';
```

**5b. `handleMapStyleChange`.** REPLACE current lines 1056–1068 — byte-exactly:
```tsx
    try {
      const nextSettings = {
        ...((canvas?.settings as any) || {}),
        mapStyleId: styleId,
      };
      const { error } = await supabase
        .from('boards')
        .update({ settings: nextSettings })
        .eq('id', canvasId);
      if (error) {
        toast.error('Map style changed locally but could not be saved');
        return;
      }
```
— with exactly this block (13 lines → 10):
```tsx
    try {
      const setMapStyle = createSetMapStyleCommand(createCanvasBoardRepository());
      const result = await setMapStyle(
        { boardId: canvasId, styleId, currentSettings: ((canvas?.settings as any) || {}) },
        { userId: null }
      );
      if (!result.ok) {
        toast.error('Map style changed locally but could not be saved');
        return;
      }
```
The `} catch {` below and its identical toast stay byte-untouched. Error
semantics preserved: resolved DB errors AND thrown errors both land on the
same toast (thrown errors become `!result.ok` via defineCommand — the
legacy catch showed the identical text, so the user-visible behavior is
unchanged; the catch remains as dead-but-preserved code).

**5c. `persistFreeformBoardAppearance`.** REPLACE current lines 1158–1169 — byte-exactly:
```tsx
        const backgroundResponse = await supabase
          .from('boards')
          .update({
            background_type: nextAppearance.backgroundType,
            background_value: nextAppearance.backgroundValue,
            updated_at: new Date().toISOString(),
          })
          .eq('id', canvasId);

        if (backgroundResponse.error) {
          throw Object.assign(backgroundResponse.error, { scope: 'background' });
        }
```
— with exactly this block (12 lines → 13):
```tsx
        const setBoardBackground = createSetBoardBackgroundCommand(createCanvasBoardRepository());
        const backgroundResult = await setBoardBackground(
          {
            boardId: canvasId,
            backgroundType: nextAppearance.backgroundType,
            backgroundValue: nextAppearance.backgroundValue,
          },
          { userId: null }
        );

        if (!backgroundResult.ok) {
          throw Object.assign((backgroundResult.error.cause ?? backgroundResult.error) as object, { scope: 'background' });
        }
```
The blank line inside the block survives in the same relative position.
The re-throw hands the ORIGINAL supabase error object (the `cause`) to the
untouched serializer with the same `scope: 'background'` annotation — the
console.warn output and toast are unchanged for DB errors. Disclosed
consequence (bound, not a deviation): a THROWN network error now also
carries the scope annotation when re-thrown (legacy reached the catch
without it) — dev-console-only, the toast is identical.

**5d. `setAsPadletCover`.** REPLACE current lines 4066–4078 — byte-exactly:
```tsx
    try {
      const { error } = await supabase
        .from('boards')
        .update({
          metadata: {
            cover_post_id: post.id,
            cover_image: imageUrl || null
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', canvasId);

      if (error) throw error;
```
— with exactly this block (13 lines → 8):
```tsx
    try {
      const setBoardCover = createSetBoardCoverCommand(createCanvasBoardRepository());
      const result = await setBoardCover(
        { boardId: canvasId, coverPostId: post.id, coverImage: imageUrl || null },
        { userId: null }
      );

      if (!result.ok) throw result.error.cause ?? result.error;
```
Edge disclosed (bound): if `canvasId` were undefined (unreachable — the
menu only renders on a mounted canvas), the command fails validation
BEFORE the network call where legacy would have DB-errored; both paths end
in the identical 'Failed to set cover' toast.

**5e. `handleChronoModeChange`.** REPLACE current lines 4308–4316 — byte-exactly:
```tsx
      const updatedSettings = { ...currentSettings, chronoMode: mode };
      try {
        await supabase
          .from('boards')
          .update({
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', canvasId);
```
— with exactly this block (9 lines → 8):
```tsx
      try {
        const setChronoMode = createSetChronoModeCommand(createCanvasBoardRepository());
        const result = await setChronoMode(
          { boardId: canvasId, mode, currentSettings },
          { userId: null }
        );

        if (!result.ok) throw result.error.cause ?? result.error;
```
The `const currentSettings = ...` line ABOVE the replaced range (current
L4307) stays byte-identical and feeds the command input; the
`updatedSettings` merge moves into the command (§1, tested). The
`} catch (err) {` below and its console/toast stay byte-untouched.
Semantics: resolved DB errors are swallowed INSIDE the command (preserved
defect — §1 comment + test 9), so `!result.ok` fires only for thrown
errors, which re-throw the cause into the untouched catch — exactly the
legacy reachability.

**EVERYTHING else in the file byte-identical.** Net: 8,518 → **8,517**
lines (+7 imports, −3 +1 −5 −1 across the four handlers). Blank lines
726 → 727 (§5e's replacement adds one; the others are blank-neutral).

## Verification sequence (paste real output for every step)
Operational rules — ALL binding: banner-port rule; `Get-NetTCPConnection
-LocalPort 3000 -State Listen` count is the ONLY port gate; shell-bound
numerics; gates bind printed text, never exit codes; **stale `.next/types`
rule: if tsc names a file absent from `git ls-files`, stop the server,
delete `.next`, restart, re-probe, rerun tsc before suspecting source**;
before ANY commit read `git status --short` — a staged line you did not
create is a STOP signal; commit with the explicit pathspec below
(`:(literal)` REQUIRED for the `[id]` segment); **full disclosure rule:
report EVERY off-spec line, number, whitespace difference, comment
difference, and EOL byte — including in test files and including changes
you judge harmless. EOL bytes are checked at review with `cmp -l`
(PATCH-025 finding); disclose any editor normalization or it becomes a
review finding.**

```bash
# Phase A — baseline on the OLD tree (dev server running, banner port verified;
# warm / and /auth and /dashboard first — PATCH-026's cold-start lesson):
PW_BASE_URL=http://localhost:3000 npx playwright test
# expected: 27 passed / 18 files. If the number differs, REPORT before edits.

# Phase B — implement §1-§5, then:
npm run test:unit
# expected: 117 tests / 24 files (102 + 10 domain + 5 infra; 22 + 2 files)
npx tsc --noEmit           # 0 errors; zero casts beyond §2's factory idiom + §5's two named casts
# per-file greps (Git Bash) — derived from measured pre-edit + additions - deletions:
grep -c "\.from('boards')" "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 4 -> 0 (prints 0, exit 1)
grep -c "'boards'" "app/dashboard/canvas/[id]/CanvasClient.tsx"           # 4 -> 0 (prints 0, exit 1;
#   the new import paths say 'canvas/board' / 'canvas/boardRepository' - no quoted 'boards')
grep -c "createCanvasBoardRepository" "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 0 -> 5 (1 import + 4 handler uses)
grep -c "userId: null" "app/dashboard/canvas/[id]/CanvasClient.tsx"       # 5 -> 9 (+4)
grep -c "domain/canvas" "app/dashboard/canvas/[id]/CanvasClient.tsx"      # 1 -> 2
grep -c "infra/canvas" "app/dashboard/canvas/[id]/CanvasClient.tsx"       # 1 -> 2
grep -c "nextSettings" "app/dashboard/canvas/[id]/CanvasClient.tsx"       # 2 -> 0 (prints 0, exit 1; merge moved into the command)
grep -c "updatedSettings" "app/dashboard/canvas/[id]/CanvasClient.tsx"    # 2 -> 0 (prints 0, exit 1; same)
grep -c "backgroundResponse" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 3 -> 0 (prints 0, exit 1; renamed backgroundResult in the bound block)
grep -c "backgroundResult" "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 0 -> 3 (def + two uses in the if/throw)
grep -c "currentSettings" "app/dashboard/canvas/[id]/CanvasClient.tsx"    # 2 -> 3 (site 4: def stays, deleted use, new input use; site 1: new inline input key)
grep -c "scope: 'background'" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 1 -> 1 (preserved)
grep -c "handleMapStyleChange" "app/dashboard/canvas/[id]/CanvasClient.tsx"          # 2 -> 2
grep -c "persistFreeformBoardAppearance" "app/dashboard/canvas/[id]/CanvasClient.tsx" # 3 -> 3
grep -c "setAsPadletCover" "app/dashboard/canvas/[id]/CanvasClient.tsx"              # 3 -> 3
grep -c "handleChronoModeChange" "app/dashboard/canvas/[id]/CanvasClient.tsx"        # 4 -> 4
wc -l "app/dashboard/canvas/[id]/CanvasClient.tsx"                        # 8518 -> 8517
# new files fast gates (byte-equality is the reviewer's check):
wc -l lib/domain/canvas/board.ts                # 124
wc -l lib/infra/canvas/boardRepository.ts       # 115
wc -l lib/domain/canvas/board.test.ts           # 247
grep -c "it(" lib/domain/canvas/board.test.ts           # 10
wc -l lib/infra/canvas/boardRepository.test.ts  # 117
grep -c "it(" lib/infra/canvas/boardRepository.test.ts  # 5
# byte-untouched gates (ALL must print nothing):
git diff --ignore-space-at-eol -- eslint.boundaries.config.mjs lib/domain/boards/repository.ts
git diff --ignore-space-at-eol -- components/collabboard/canvas/ui/FreeformPadletCards.tsx components/collabboard/PostCardContent.tsx
git diff --ignore-space-at-eol -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts
git diff --ignore-space-at-eol -- lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts lib/infra/canvas/sectionsRepository.ts lib/infra/canvas/sectionsRepository.test.ts
git diff --ignore-space-at-eol -- components/collabboard/canvas/hooks/
npm run check:boundaries   # green (CanvasClient still grandfathered; list untouched, 2 -> 2)

# Phase C — e2e (dev server, banner port verified, routes warmed):
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
beyond the named idioms, STOP and report; do not add it.

## Commit
ONE atomic commit (all five §Bindings items). Before staging: read
`git status --short` — any entry you did not create is a STOP. New files
must be `git add`-ed first (a pathspec commit only picks up tracked
changes). Commit with the explicit pathspec:
```
git commit -m "refactor(canvas): extract the boards update family onto the canvas ops seam -- four board commands, Pattern K (PATCH-027)" -- lib/domain/canvas/board.ts lib/domain/canvas/board.test.ts lib/infra/canvas/boardRepository.ts lib/infra/canvas/boardRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```

## Rollback
Single `git revert` (new files deleted, CanvasClient restored).

## Acceptance Criteria
- [ ] Pre-edit census pasted, matches ALL blocks incl. the four anchor lines
- [ ] Phase A: 27/18 green pasted BEFORE any edit
- [ ] All four new files byte-equal to §1–§4 (fast gates 124/115/247·10/117·5)
- [ ] CanvasClient edits exactly §5a–§5e incl. the §5c internal blank line; file 8,517 lines
- [ ] Dependency arrays byte-identical
- [ ] `npm run test:unit` 117/24; tsc 0; boundaries green
- [ ] All byte-untouched diffs EMPTY (config, exemplar boards/repository.ts, FreeformPadletCards, PostCardContent, all six trunk files, hooks)
- [ ] Grandfather list untouched: 2 → 2
- [ ] Phase C: 27/18 green, no spec file changed
- [ ] Stopped-server gate 0; `npm run verify` green; status clean
- [ ] Single atomic `:(literal)` pathspec commit; hash reported; every off-spec line/number/whitespace/comment/EOL byte disclosed (expected: none)

## Reviewer checklist (CTO or successor; §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] Byte-diff all four new files against the §1–§4 fenced blocks, then
      rerun the 15 tests against the implemented tree
- [ ] Diff CanvasClient vs bindings; the ONLY changes are §5a–§5e; `cmp`-level
      EOL checks on the edit neighborhoods
- [ ] Confirm the chrono swallow-test (domain test 9) and the map-style
      no-timestamp assertions (domain test 1 + infra test 1's
      `Object.keys === ['settings']`) still hold — they guard the two
      preserved legacy facts
- [ ] Confirm the exemplar `lib/domain/boards/repository.ts` is byte-untouched
- [ ] Confirm zero dependency-array drift
- [ ] At review closeout: PATCH_REFERENCE §7 row + §5.11 reuse note;
      CURRENT_TASK batch row + EXTEND the standing reorder-swallow decision
      entry to name `canvas.setChronoMode` as the second swallow site;
      health per §12 (architecture remains capped at 20 — expect a hold
      unless another axis genuinely moved); LESSONS_LEARNED only if
      something new surfaced

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 027,
`{{TITLE}}` = boards update family onto the canvas ops seam. Add:
"Read `.fable5/docs/PATCH_REFERENCE.md` §5.11 and §6 first, then
`.fable5/docs/CANVASCLIENT_SITE_MAP.md` §2–§3 for what you must NOT touch.
Four new files are whole-file bound; the 15 unit tests were already run
green by the CTO — if one fails against your implementation, your
implementation deviates; fix it to the binding, never edit a test.
CanvasClient gets exactly five bound edits; its other 66 supabase call
sites, its dependency arrays, and every guard/toast/serializer/catch are
byte-identical. TWO legacy facts are preserved ON PURPOSE — the map-style
write sends no updated_at, and the chrono-mode write silently swallows
resolved DB errors — do not 'fix' either. Read the dev-server banner port
and warm /, /auth, /dashboard before Phase A. If tsc names a ghost file,
apply the stale-.next/types rule. Before staging read `git status --short`
— a line you didn't create is a STOP. Commit with the bound `:(literal)`
pathspec. Report every off-spec line, number, whitespace, comment, and EOL
byte. E2E credentials are in `.env.local` — never print them. Final
`npm run verify` only after the owner stops the server."

## Estimated Difficulty
medium — four swap sites in the same bounded shape as PATCH-026's five,
with the risk concentrated in the three DIFFERENT error-semantics
preservations (toast-return, scope-annotated throw, swallow) — each
locked by a pre-verified test or a bound re-throw idiom; the residual risk
is fidelity inside an 8.5k-line file and resisting adjacent cleanup.
