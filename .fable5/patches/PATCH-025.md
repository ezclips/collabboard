# PATCH-025 — Canvas ops seam: `PostsRepository` + `canvas.toggleTask`, first consumer PostCardContent (grandfather 3→2)

**Status:** READY (authored 2026-07-09; owner approval pending)
**Complexity:** medium (four NEW whole-file-bound files + one bound
three-part edit to a 936-line component with 22 importers + one grandfather
line removal; the mechanism is the settings-extraction template applied to
the first CANVAS write)
**Assigned model:** **GPT-5.4 — acceptable.** Ruling, per the owner's
"mutation-heavy but e2e-safe" question:
- The patch touches ONE mutation path (the todo checkbox's `padlets` update),
  and its exact semantics — toggle-by-id, stringified `content`, metadata
  spread, the legacy `|| []` empty-write edge, ISO timestamp — are locked by
  **nine bound unit tests that already ran GREEN against the bound
  implementation at authoring time** (CTO scratch run, vitest 9/9). A
  behavior slip in the moved logic fails a test, not a reviewer's eye.
- All four new files are whole-file bound and CTO compile-verified
  (`tsc --strict` clean); the component edit is three small bound diffs.
- The client is IDENTICAL, not equivalent: `createBrowserSupabaseClient()`
  is a one-line wrapper around the exact `createClientComponentClient()`
  the component constructs today — zero auth-semantics change.
- Under the PATCH-020 rule ("count the untestable call sites"), this patch
  has ONE e2e-unreachable call — below the ≥2 threshold that forced GPT-5.5
  on 020/021/024 — and unlike a WebAuthn ceremony it IS testable, at the
  unit level, where it is already tested. The component's render path stays
  live in e2e (board-lifecycle renders a wall note through PostCardContent).
- Standard escalation stands: any tsc-forced cast, any gate mismatch, any
  line the bindings don't cover → STOP and report; do not improvise.
**Pattern:** introduces the CANVAS OPS SEAM (`lib/domain/canvas/posts.ts` +
`lib/infra/canvas/postsRepository.ts`) — the trunk every 026+ group extends
(one aggregate, one repository; P6). Pattern designation happens at review
per the catalog rule.
**Depends on:** PATCH-022 ruling (ops-seam-first, NO type-only de-linting);
CANVASCLIENT_SITE_MAP.md (authored with this spec).

## Scope
1. NEW `lib/domain/canvas/posts.ts` — `PostsRepository` interface +
   `canvas.toggleTask` command (whole-file bound, §1).
2. NEW `lib/infra/canvas/postsRepository.ts` — narrow structural client +
   `SupabasePostsRepository` + factory (whole-file bound, §2).
3. NEW unit tests for both (whole-file bound, §3/§4) — suite 76/18 → 85/20.
4. `components/collabboard/PostCardContent.tsx` — three bound edits (§5):
   import swap, client-construction removal, handler-body swap. The file's
   ONLY runtime supabase use moves behind the command.
5. `eslint.boundaries.config.mjs` — remove the PostCardContent grandfather
   line (§6). **3 → 2.** This removal is EARNED, not gamed: the file's
   actual violation (the `@supabase/auth-helpers-nextjs` VALUE import) and
   its only runtime supabase call are both gone; nothing type-only was
   shuffled. (CTO pre-measured: `npx eslint --no-inline-config -c
   eslint.boundaries.config.mjs "components/collabboard/PostCardContent.tsx"
   --no-ignore` prints exactly 1 error today — the L6 import.)

NOT in scope: every other call site in the canvas vertical (CanvasClient's
73, FreeformPadletCards' 22, the hooks' 26 — see CANVASCLIENT_SITE_MAP.md);
ANY edit to CanvasClient.tsx or FreeformPadletCards.tsx (byte-untouched,
including their type-only `@supabase/*` imports — de-linting them is the
FORBIDDEN metric-gaming move, PATCH-022); the 22 PostCardContent importers
(component signature and rendering unchanged — zero importer edits); realtime;
any new e2e spec (ruling in §Characterization); any UI/behavior change.

## Characterization ruling (before edits)
The toggle write itself is NOT e2e-exercised today and this patch does not
add a spec for it: no existing spec creates a todo post, and building one
means driving the canvas sidebar Todo tool + task entry — a new mutation
surface whose flakiness risk exceeds its net value while the toggle
semantics are pinned by nine unit tests instead. What e2e DOES pin:
`board-lifecycle.spec.ts` renders a real wall-board post through
PostCardContent live (create → edit → delete), so a rendering regression in
this component fails Phase A/C. Phase A therefore = full existing suite
green (27/18 baseline), Phase C = same suite green after. The unit tests
are the behavior net for the moved write; the e2e suite is the regression
net for the component. (PATCH-020 precedent: when a path can't be driven
end-to-end, bind the fidelity elsewhere and say so — here it's bound in
executable tests, which is strictly stronger than 020's diff-only net.)

## Pre-edit census (paste ALL output; STOP on any mismatch)
Run in **Git Bash** from the repo root (shell-bound; PowerShell
`Measure-Object -Line` counts non-blank lines only — expected values below
are `wc -l` all-lines with blank counts stated).
```bash
# 1. The component (936 all-lines, 77 blank; PS Measure-Object -> 859):
wc -l components/collabboard/PostCardContent.tsx                      # 936
grep -c "supabase" components/collabboard/PostCardContent.tsx         # 3 (L6 import, L238 client, L384 call)
grep -c "@supabase" components/collabboard/PostCardContent.tsx        # 1 (L6)
grep -c "createClientComponentClient" components/collabboard/PostCardContent.tsx  # 2 (L6 + L238)
grep -c "padlets" components/collabboard/PostCardContent.tsx          # 1 (L385, double-quoted .from("padlets"))
grep -c "toggleTask" components/collabboard/PostCardContent.tsx       # 0 -> exit 1
grep -c "asUserId" components/collabboard/PostCardContent.tsx         # 0 -> exit 1
grep -c "onScan" components/collabboard/PostCardContent.tsx           # 4
grep -c "currentUserId" components/collabboard/PostCardContent.tsx    # 9
# 2. The seam directories must NOT exist yet:
ls lib/domain/canvas 2>/dev/null; echo "domain/canvas exit: $?"       # non-zero exit
ls lib/infra/canvas 2>/dev/null; echo "infra/canvas exit: $?"         # non-zero exit
# 3. The grandfather list (3 entries, PostCardContent present once):
grep -c "PostCardContent" eslint.boundaries.config.mjs                # 1
grep -c "components/collabboard\|app/dashboard/canvas" eslint.boundaries.config.mjs  # 3 (the three grandfather entries)
# 4. The file's boundary violation, demonstrated (expect EXACTLY 1 error, the L6 import):
npx eslint --no-inline-config -c eslint.boundaries.config.mjs "components/collabboard/PostCardContent.tsx" --no-ignore
# 5. Suite baselines:
npm run test:unit          # 76 tests / 18 files
```
Anything more, less, or different: STOP, report, change nothing.

## Bindings

### 1. NEW file — `lib/domain/canvas/posts.ts` (exact, whole file, 61 lines; CTO compile-verified `tsc --strict` AND unit-tested green at authoring, 2026-07-09)
```ts
import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { PostId } from '../core/ids';
import { asPostId } from '../core/ids';
import type { Result } from '../core/result';
import { err } from '../core/result';

/**
 * PATCH-025: the first canvas write seam. The `padlets` table name is a
 * legacy schema fact; new code uses neutral naming (P7) - posts.
 */

/** The exact three-column payload the legacy toggle writes. */
export interface PostTasksWriteFields {
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly updatedAt: string;
}

export interface PostsRepository {
  updateTasks(id: PostId, fields: PostTasksWriteFields): Promise<Result<void, DomainError>>;
}

export const toggleTaskSchema = z.object({
  postId: z.string(),
  taskId: z.string(),
  /** The post's CURRENT metadata JSONB, passed through untyped (legacy shape). */
  metadata: z.record(z.string(), z.unknown()),
});

export const createToggleTaskCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.toggleTask',
    input: toggleTaskSchema,
    execute: async (input) => {
      const rawTasks = input.metadata.tasks;
      // Legacy reachability: the checkbox only renders when metadata.tasks is
      // truthy and the render already .map()s it, so a truthy non-array can
      // never reach this handler without crashing the render first. The
      // legacy handler would have thrown (caught, no write); we return an
      // error (no write) - same observable outcome.
      if (rawTasks !== undefined && rawTasks !== null && !Array.isArray(rawTasks)) {
        return err(domainError('validation', 'metadata.tasks is not an array'));
      }
      // Legacy semantics preserved exactly (PostCardContent old L376-390):
      // missing/null tasks -> `|| []` wrote an empty list; the matching id
      // flips `completed`; every other task and field passes through.
      const updatedTasks: Record<string, unknown>[] = Array.isArray(rawTasks)
        ? rawTasks.map((task: Record<string, unknown>) =>
            task.id === input.taskId ? { ...task, completed: !task.completed } : task,
          )
        : [];
      return repository.updateTasks(asPostId(input.postId), {
        content: JSON.stringify(updatedTasks),
        metadata: { ...input.metadata, tasks: updatedTasks },
        updatedAt: new Date().toISOString(),
      });
    },
  });
```
(zod usage note, PATCH-018 lesson: `z.record(z.string(), z.unknown())` is
the two-argument v4 form, verified against the installed zod 4.3.6.)

### 2. NEW file — `lib/infra/canvas/postsRepository.ts` (exact, whole file, 53 lines; CTO compile-verified)
```ts
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { PostId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { PostsRepository, PostTasksWriteFields } from '../../domain/canvas/posts';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface PostsUpdateQuery {
  eq(column: 'id', value: PostId): Promise<{ error: SupabaseErrorLike | null }>;
}

interface PostsSupabaseClient {
  from(table: 'padlets'): {
    update(payload: {
      content: PostTasksWriteFields['content'];
      metadata: PostTasksWriteFields['metadata'];
      updated_at: PostTasksWriteFields['updatedAt'];
    }): PostsUpdateQuery;
  };
}

export class SupabasePostsRepository implements PostsRepository {
  constructor(private readonly client: PostsSupabaseClient) {}

  async updateTasks(id: PostId, fields: PostTasksWriteFields): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({
        content: fields.content,
        metadata: fields.metadata,
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the post tasks', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createPostsRepository(): PostsRepository {
  return new SupabasePostsRepository(
    createBrowserSupabaseClient() as unknown as PostsSupabaseClient,
  );
}
```
(The `as unknown as` double-cast at the factory boundary is the established
house idiom — identical to `workspaceSettingsRepository.ts` L115. It is NOT
a deviation and needs no disclosure. `createBrowserSupabaseClient()` returns
the very same `createClientComponentClient()` instance shape the component
constructs today — see `lib/infra/supabase/browserClient.ts`, 7 lines.)

### 3. NEW file — `lib/domain/canvas/posts.test.ts` (exact, whole file, 129 lines, 6 tests; CTO ran them GREEN against §1 at authoring)
```ts
import { describe, expect, it } from 'vitest';
import { createToggleTaskCommand } from './posts';
import type { PostsRepository, PostTasksWriteFields } from './posts';
import type { PostId } from '../core/ids';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const ctx = { userId: null };

const groceriesMetadata = {
  todoTitle: 'Groceries',
  tasks: [
    { id: 'task-1', text: 'milk', completed: false },
    { id: 'task-2', text: 'bread', completed: false, dueDate: '2026-07-10', assignee: 'sam' },
  ],
};

function createFakeRepository() {
  const updateTasksCalls: Array<{ id: PostId; fields: PostTasksWriteFields }> = [];
  let updateTasksResult: Result<void, DomainError> = ok(undefined);

  const repository: PostsRepository = {
    updateTasks: async (id, fields) => {
      updateTasksCalls.push({ id, fields });
      return updateTasksResult;
    },
  };

  return {
    repository,
    updateTasksCalls,
    setUpdateTasksResult(result: Result<void, DomainError>) {
      updateTasksResult = result;
    },
  };
}

describe('canvas.toggleTask', () => {
  it('flips completed on the matching task only and preserves every other field', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask(
      { postId: 'post-1', taskId: 'task-2', metadata: groceriesMetadata },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(updateTasksCalls).toHaveLength(1);
    expect(updateTasksCalls[0].id).toBe('post-1');
    expect(updateTasksCalls[0].fields.metadata.tasks).toEqual([
      { id: 'task-1', text: 'milk', completed: false },
      { id: 'task-2', text: 'bread', completed: true, dueDate: '2026-07-10', assignee: 'sam' },
    ]);
  });

  it('writes content as the stringified updated tasks and keeps the rest of metadata', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    await toggleTask({ postId: 'post-1', taskId: 'task-1', metadata: groceriesMetadata }, ctx);

    const { fields } = updateTasksCalls[0];
    expect(fields.content).toBe(JSON.stringify(fields.metadata.tasks));
    expect(fields.metadata.todoTitle).toBe('Groceries');
    expect(new Date(fields.updatedAt).toISOString()).toBe(fields.updatedAt);
  });

  it('writes an empty task list when metadata has no tasks (legacy || [] path)', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask(
      { postId: 'post-1', taskId: 'task-1', metadata: { todoTitle: 'Empty' } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(updateTasksCalls[0].fields.content).toBe('[]');
    expect(updateTasksCalls[0].fields.metadata).toEqual({ todoTitle: 'Empty', tasks: [] });
  });

  it('rejects a truthy non-array tasks value without writing', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask(
      { postId: 'post-1', taskId: 'task-1', metadata: { tasks: 'corrupt' } },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(updateTasksCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const { repository, setUpdateTasksResult } = createFakeRepository();
    setUpdateTasksResult(err(domainError('unavailable', 'db down')));
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask(
      { postId: 'post-1', taskId: 'task-1', metadata: groceriesMetadata },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects invalid input without calling the repository', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(updateTasksCalls).toHaveLength(0);
  });
});
```

### 4. NEW file — `lib/infra/canvas/postsRepository.test.ts` (exact, whole file, 87 lines, 3 tests; CTO ran them GREEN against §2 at authoring)
```ts
import { describe, expect, it } from 'vitest';
import { SupabasePostsRepository } from './postsRepository';
import { asPostId } from '../../domain/core/ids';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(error: FakeError | null = null) {
  const fromTables: string[] = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const eqCalls: Array<{ column: string; value: string }> = [];

  const client = {
    from(table: 'padlets') {
      fromTables.push(table);
      return {
        update(payload: {
          content: string;
          metadata: Record<string, unknown>;
          updated_at: string;
        }) {
          updateCalls.push(payload);
          return {
            eq: async (column: 'id', value: string) => {
              eqCalls.push({ column, value });
              return { error };
            },
          };
        },
      };
    },
  };

  return { client, fromTables, updateCalls, eqCalls };
}

const fields = {
  content: '[{"id":"task-1","completed":true}]',
  metadata: { todoTitle: 'Groceries', tasks: [{ id: 'task-1', completed: true }] },
  updatedAt: '2026-07-09T12:00:00.000Z',
};

describe('SupabasePostsRepository', () => {
  it('sends the exact legacy payload to padlets filtered by the post id', async () => {
    const { client, fromTables, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTasks(asPostId('post-1'), fields);

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(updateCalls).toEqual([
      {
        content: fields.content,
        metadata: fields.metadata,
        updated_at: fields.updatedAt,
      },
    ]);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTasks(asPostId('post-1'), fields);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('performs exactly one update per call', async () => {
    const { client, updateCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    await repository.updateTasks(asPostId('post-1'), fields);
    await repository.updateTasks(asPostId('post-2'), fields);

    expect(updateCalls).toHaveLength(2);
  });
});
```

### 5. `components/collabboard/PostCardContent.tsx` — three bound edits, nothing else
This file uses DOUBLE quotes and 4-space indentation — the added lines below
match that, deliberately different from §1–§4's single-quote domain style.

**5a. Imports.** DELETE old line 6:
```tsx
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
```
ADD, immediately after old line 13
(`import { extractAIContentFromPadletMetadata } from "@/lib/ai/normalize-ai-content";`),
these three lines in this order:
```tsx
import { createToggleTaskCommand } from "@/lib/domain/canvas/posts";
import { asUserId } from "@/lib/domain/core/ids";
import { createPostsRepository } from "@/lib/infra/canvas/postsRepository";
```
Net: the import block is 8 lines → 10 lines; everything else in it
byte-identical.

**5b. Client construction.** DELETE old line 238 exactly:
```tsx
    const supabase = createClientComponentClient();
```
Blank-line binding (PATCH-024 lesson — say what happens to the neighbors):
delete ONLY that line. Post-edit, `}: PostCardContentProps) {` is followed by
exactly ONE blank line (the old L239), then `const type = normalizeType(padlet.type);`.

**5c. Handler body.** REPLACE old lines 372–398 — byte-exactly this block:
```tsx
                                onChange={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    const updatedTasks =
                                        padlet.metadata?.tasks?.map((t: { id: string; completed: boolean }) =>
                                            t.id === task.id ? { ...t, completed: !t.completed } : t
                                        ) || [];

                                    const updatedMetadata = { ...padlet.metadata, tasks: updatedTasks };

                                    try {
                                        const { error } = await supabase
                                            .from("padlets")
                                            .update({
                                                content: JSON.stringify(updatedTasks),
                                                metadata: updatedMetadata,
                                                updated_at: new Date().toISOString(),
                                            })
                                            .eq("id", padlet.id);

                                        if (error) throw error;
                                        onScan?.();
                                    } catch (err) {
                                        console.error("Failed to toggle task:", err);
                                    }
                                }}
```
— with exactly this block (27 lines → 20 lines):
```tsx
                                onChange={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    const toggleTask = createToggleTaskCommand(createPostsRepository());
                                    const result = await toggleTask(
                                        {
                                            postId: padlet.id,
                                            taskId: task.id,
                                            metadata: padlet.metadata ?? {},
                                        },
                                        { userId: currentUserId ? asUserId(currentUserId) : null }
                                    );

                                    if (result.ok) {
                                        onScan?.();
                                    } else {
                                        console.error("Failed to toggle task:", result.error);
                                    }
                                }}
```
Disclosed behavior-shape notes (bound, not deviations): (1) the second
`console.error` argument changes from the raw thrown supabase error to the
command's `DomainError` (which carries the original as `.cause`) —
dev-console-only, no UI change; (2) `padlet.metadata ?? {}` reproduces the
legacy spread-of-undefined semantics (`{ ...undefined }` is `{}`); (3) the
`{ userId: ... }` context uses the component's EXISTING optional
`currentUserId` prop — the command does not gate on it, exactly as the
legacy write never checked the user (RLS is the enforcement, unchanged).

**EVERYTHING else in the file byte-identical** — all rendering, all other
handlers, the eslint-disable header line, the `Padlet` type import, all 22
importers untouched.

### 6. `eslint.boundaries.config.mjs` — one line
DELETE the line:
```
  'components/collabboard/PostCardContent.tsx',
```
The list goes 3 entries → 2 (CanvasClient, FreeformPadletCards). Nothing
else in the config changes.

## Verification sequence (paste real output for every step)
Operational rules — ALL binding: banner-port rule (read the Next dev startup
banner; `next dev` silently rebinds to :3001); `Get-NetTCPConnection
-LocalPort 3000 -State Listen` count is the ONLY port gate; shell-bound
numerics (Git Bash unless a gate says otherwise); **stale `.next/types`
rule: if tsc names a file absent from `git ls-files`, stop the server,
delete `.next`, restart, re-probe, rerun tsc before suspecting source**;
before ANY commit read `git status --short` — a staged line you did not
create is a STOP signal; commit with an explicit pathspec listing exactly
this patch's files; **disclosure rule: report EVERY off-spec line, number,
whitespace difference, and comment difference — including in test files and
including changes you judge harmless ("no runtime effect" is a review
conclusion, not grounds to skip reporting; PATCH-018/021/024 chain).**

```bash
# Phase A — baseline on the OLD tree (dev server running, banner port verified):
PW_BASE_URL=http://localhost:3000 npx playwright test
# expected: 27 passed / 18 files. board-lifecycle is the PostCardContent
# render net. If the number differs, REPORT it before edits.

# Phase B — implement §1-§6, then:
npm run test:unit
# expected: 85 tests / 20 files (76 + 6 new domain + 3 new infra; 18 + 2 files)
npx tsc --noEmit           # 0 errors, zero casts beyond the §2 factory idiom
# per-file greps (Git Bash) — derived from measured pre-edit + additions - deletions:
grep -c "supabase" components/collabboard/PostCardContent.tsx         # 3 -> 0 (exit 1; the three new import paths contain no 'supabase')
grep -c "@supabase" components/collabboard/PostCardContent.tsx        # 1 -> 0 (exit 1)
grep -c "createClientComponentClient" components/collabboard/PostCardContent.tsx  # 2 -> 0 (exit 1)
grep -c "padlets" components/collabboard/PostCardContent.tsx          # 1 -> 0 (exit 1; the write moved to infra)
grep -c "toggleTask" components/collabboard/PostCardContent.tsx       # 0 -> 2 (const line + await line; the IMPORT line's
#   'createToggleTaskCommand' has capital T after 'create...Toggle' and does NOT contain lowercase 'toggleTask' -
#   substring-collision check done at authoring)
grep -c "ToggleTask" components/collabboard/PostCardContent.tsx       # 0 -> 2 (import line + const line)
grep -c "asUserId" components/collabboard/PostCardContent.tsx         # 0 -> 2 (import + ctx line)
grep -c "createPostsRepository" components/collabboard/PostCardContent.tsx  # 0 -> 2 (import + const line)
grep -c "onScan" components/collabboard/PostCardContent.tsx           # 4 -> 4 (unchanged; the replaced block keeps exactly one call)
grep -c "currentUserId" components/collabboard/PostCardContent.tsx    # 9 -> 10 (+1: the ctx line)
wc -l components/collabboard/PostCardContent.tsx                      # 936 -> 930 (+3 imports -1 import -1 client -7 handler block)
# new files byte-equality is checked by the reviewer; sizes as a fast gate:
wc -l lib/domain/canvas/posts.ts            # 61
wc -l lib/infra/canvas/postsRepository.ts   # 53
wc -l lib/domain/canvas/posts.test.ts       # 129
wc -l lib/infra/canvas/postsRepository.test.ts  # 87
# grandfather + boundaries:
grep -c "PostCardContent" eslint.boundaries.config.mjs                # 1 -> 0 (exit 1)
npx eslint --no-inline-config -c eslint.boundaries.config.mjs "components/collabboard/PostCardContent.tsx" --no-ignore
# expected: NO output, exit 0 (the file is clean WITHOUT its grandfather entry)
npm run check:boundaries   # green repo-wide (CanvasClient + FreeformPadletCards still ignored)
# byte-untouched gates:
git diff --ignore-space-at-eol -- "app/dashboard/canvas/[id]/CanvasClient.tsx" components/collabboard/canvas/ui/FreeformPadletCards.tsx   # empty
git diff --ignore-space-at-eol -- components/collabboard/canvas/hooks/   # empty

# Phase C — e2e (dev server, banner port verified; canvas route warms via board-lifecycle):
PW_BASE_URL=http://localhost:3000 npx playwright test
# expected: 27 passed / 18 files - identical to Phase A. No spec changed in this patch.

# FINAL (owner stops the dev server first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # 0 - this gate, no other port check
npm run verify             # typecheck + boundaries + unit + production build, all green
git status --porcelain     # clean after the commit
```

## Deviation rule (binding)
Report EVERY line that differs from the bindings — imports, whitespace,
comments, quote style, and any gate NUMBER that comes out different.
Expected deviations: **NONE.** If tsc forces a cast anywhere, STOP and
report; do not add it.

## Commit
ONE atomic commit (all six §Bindings items). Before staging: read
`git status --short` — any entry you did not create is a STOP. Commit with
the explicit pathspec:
```
git commit -m "refactor(canvas): open the canvas ops seam -- PostsRepository + canvas.toggleTask, first consumer PostCardContent (grandfather 3->2, PATCH-025)" -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts components/collabboard/PostCardContent.tsx eslint.boundaries.config.mjs
```

## Rollback
Single `git revert` (new files deleted, component and config restored).

## Acceptance Criteria
- [ ] Pre-edit census pasted, matches ALL blocks (incl. the 1-error eslint probe)
- [ ] Phase A: 27/18 green pasted BEFORE any edit
- [ ] All four new files byte-equal to §1–§4
- [ ] Component edits exactly §5a/5b/5c incl. the blank-line binding; file 930 lines
- [ ] Grandfather list 3 → 2 (§6 only)
- [ ] `npm run test:unit` 85/20; tsc 0; boundaries green; eslint no-ignore probe clean
- [ ] CanvasClient, FreeformPadletCards, canvas hooks byte-untouched (git diff empty)
- [ ] Phase C: 27/18 green, no spec file changed
- [ ] Stopped-server gate 0; `npm run verify` green; status clean
- [ ] Single atomic pathspec commit; hash reported; every off-spec line/number/whitespace/comment disclosed (expected: none)

## Reviewer checklist (CTO or successor; §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] Byte-diff all four new files against §1–§4 (extract the fenced blocks, `diff`)
- [ ] Diff PostCardContent vs bindings with `--ignore-space-at-eol`; the ONLY
      changes are §5a/5b/5c; check the blank line at old L239 survived
- [ ] Confirm the unit tests were not weakened (byte-equality covers this)
- [ ] Confirm the grandfather removal is the §6 line only — no other config drift
- [ ] Run board-lifecycle standalone AND the full suite; both green
- [ ] At review closeout: PATCH_REFERENCE §7 row + pattern entry if designated;
      CURRENT_TASK batch row; health per §12 (first monolith-adjacent seam
      consumed — the architecture axis finally has the monolith moving);
      LESSONS_LEARNED only if something new surfaced

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 025,
`{{TITLE}}` = canvas ops seam (PostsRepository + canvas.toggleTask). Add:
"Read `.fable5/docs/PATCH_REFERENCE.md` §0 and §6 first, then
`.fable5/docs/CANVASCLIENT_SITE_MAP.md` §2-§3 for what you must NOT touch.
Four new files are whole-file bound — byte-equality is checked at review.
The component gets exactly three bound edits; everything else in it is
byte-identical, and CanvasClient/FreeformPadletCards/the canvas hooks are
byte-untouched. The unit tests are bound and were already run green by the
CTO — if one fails against your implementation, your implementation
deviates; fix it to the binding, never edit a test. Read the dev-server
banner port. If tsc names a ghost file, apply the stale-.next/types rule.
Before staging read `git status --short` — a line you didn't create is a
STOP. Commit with the bound pathspec. Report every off-spec line, number,
whitespace, and comment difference. E2E credentials are in `.env.local` —
never print them. Final `npm run verify` only after the owner stops the
server."

## Estimated Difficulty
low-medium — the highest-risk asset (the moved write's semantics) is locked
by pre-verified tests; the residual risk is fidelity of the three component
edits and resisting any "cleanup" of a 936-line legacy file mid-edit.
