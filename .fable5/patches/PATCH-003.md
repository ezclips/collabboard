# PATCH-003 — Domain layer foundation (`lib/domain` skeleton)

**Status:** APPROVED (owner, 2026-07-07) — delegated to Codex GPT-5.4.
Execute the Final Implementation Specification below. Codex must not edit
`.fable5/` or `.claude/`. CTO review criteria on return: authorized files only ·
no product code touched · purity-canary proof demonstrated · unit tests green ·
verification outputs pasted · commit hash exists. CTO re-runs all verification
independently.
**Complexity:** easy-medium · **Estimated implementation time:** 45–90 minutes
**Assigned model (proposed):** GPT-5.4 (Codex) via CODER_HANDOFF_TEMPLATE.md

## Goal
Create the minimum architectural foundation for Phase 1: `lib/domain/` with a
`Result` type, error taxonomy, branded IDs, a `defineCommand` abstraction, the
first repository *interface*, written conventions, unit tests for the pure
logic, and mechanical enforcement of domain purity (no React/Next/Supabase
imports inside `lib/domain`).

## Reason
Every later patch (PATCH-004+ extractions from `CanvasClient.tsx` and the
settings pages) needs a place to put code and a contract to follow. Without a
pre-agreed Result/error/command shape, each extraction would invent its own,
recreating the inconsistency we're escaping. This patch is pure foundation:
**zero runtime behavior changes, zero existing code moved.**

## Why this patch comes first (before any extraction)
- The net (PATCH-001) and the freeze (PATCH-002) are in place; the seam is the
  third step of the codified strategy (LESSONS_LEARNED: net → freeze → seam →
  extract). Extracting without the seam means improvised shapes that get
  re-refactored later.
- It is the cheapest possible next step: additive files only, one-revert
  rollback, no product surface touched — ideal first patch for the domain
  layer while the delegation workflow is still being bedded in.
- Playbook §7 note: interfaces-before-implementations is allowed **only at
  planned seams**; `lib/domain` is the documented bet from ARCHITECTURE.md §2.

## Scope boundaries (from owner, verbatim intent)
IN: `lib/domain/` folder structure, Result type, error taxonomy, repository
interface, command abstraction, conventions doc, unit tests, purity lint.
OUT (explicitly): moving any existing Supabase calls · changing CanvasClient ·
changing UI behavior · realtime · state management · database schema changes.

## Files to Create
- `lib/domain/CONVENTIONS.md` — the rules of the layer (content specified below)
- `lib/domain/core/result.ts` — `Result<T, E>`, `ok`, `err`, `isOk`, `isErr`
- `lib/domain/core/errors.ts` — `DomainError` taxonomy + constructors
- `lib/domain/core/ids.ts` — branded `BoardId`, `PostId`, `UserId` + casts
- `lib/domain/core/command.ts` — `CommandContext`, `defineCommand` factory
- `lib/domain/core/result.test.ts` — unit tests
- `lib/domain/core/command.test.ts` — unit tests (validation → `validation`
  error; thrown exception → `unknown` error; happy path)
- `lib/domain/boards/repository.ts` — `BoardRepository` interface (types only)
- `vitest.config.ts` — minimal config scoped to `lib/domain/**/*.test.ts`

## Files to Modify
- `package.json` — devDependency `vitest` (MIT, dev-only; TESTING.md's chosen
  runner); scripts: `"test:unit": "vitest run"`; `verify` becomes
  `typecheck && check:boundaries && test:unit && build`
- `package-lock.json` — via `npm install` only (never hand-edited)
- `eslint.boundaries.config.mjs` — add a second, independent block: files
  `lib/domain/**/*.ts` must not import `react`, `react-*`, `next`, `next/*`,
  `@supabase/*`, or anything from `components/` or `app/` (domain purity,
  enforced from day one)
- `.github/workflows/ci.yml` — add blocking step "Unit tests" running
  `npm run test:unit` (after boundary check, before build)

## Files that MUST NOT be touched
- Anything under `components/`, `app/`, `supabase/`, `types/`, `e2e/`
- `next.config.ts`, `middleware.ts`, `playwright.config.ts`, `eslint.config.mjs`
- Anything under `.fable5/` or `.claude/`
- No dependency changes beyond `vitest` (no plugins, no test utils — pure logic
  needs none)

## Risks
- **Vitest/tsconfig interaction:** test files are typechecked by `tsc --noEmit`.
  Mitigation baked into the spec: explicit `import { describe, it, expect }
  from 'vitest'` (no globals mode) so no tsconfig change is needed. If
  typecheck still fails on vitest types, STOP and report (do not edit
  tsconfig).
- **Vitest version drift:** install `vitest@^3`; record the resolved version in
  the report. If `^3` doesn't exist or fails on Node 24, try latest stable and
  report the substitution.
- **Speculative API surface:** deliberately minimized — no Result combinators
  (map/flatMap), no base-repository generics, no event types. Those get added
  when a consumer demands them (playbook §7 delete test).
- **Spec code is UNEXECUTED** (lesson: PATCH-002 spec defects) — expect small
  iteration at verification time; deviations must be reported, not silently
  adapted (except trivial type-error fixes within the created files, which are
  allowed and must be listed in the report).

## Rollback
Single `git revert` of the patch commit; additionally `npm install` to restore
the lockfile state. Nothing imports `lib/domain` yet, so reverting cannot break
any consumer.

## Acceptance Criteria
- [ ] `npm run test:unit` green (≥ 8 assertions across result + command tests)
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run check:boundaries` green on clean tree
- [ ] Domain purity proof: a temporary file `lib/domain/__purity-canary.ts`
      containing `import React from 'react';` makes `check:boundaries` FAIL;
      removed afterwards; check green again (canary must not survive the commit)
- [ ] `npm run build` NOT run (dev server may be running; build is exercised in CI)
- [ ] `git diff` touches only the listed files; nothing under `components/`,
      `app/`, `.fable5/`
- [ ] Commit exists with the specified message; hash reported

## Verification Steps (run every one; paste real output)
```bash
npm install                       # brings in vitest; lockfile updates
npm run test:unit                 # green
npx tsc --noEmit                  # 0 errors
npm run check:boundaries          # green
printf "import React from 'react';\nexport const x = React;\n" > lib/domain/__purity-canary.ts
npm run check:boundaries          # MUST fail citing no-restricted-imports
rm lib/domain/__purity-canary.ts
npm run check:boundaries          # green again
git status --porcelain            # only listed files
```

## Estimated Difficulty
easy-medium (mostly transcription; the only judgment is fixing trivial type
errors inside the new files)

---

# Final Implementation Specification (execute exactly this)

Preconditions: clean `git status` on `master`; do NOT run `npm run build` or
Playwright (dev server may be running — SKILL.md guard). Read
`.fable5/docs/SKILL.md` first.

## Step 1 — Install vitest
```bash
npm install -D vitest@^3
```

## Step 2 — CREATE `lib/domain/CONVENTIONS.md`
```markdown
# Domain Layer Conventions

The domain layer is the ONLY path between UI and infrastructure
(ARCHITECTURE.md §2). Rules, enforced by eslint.boundaries.config.mjs where
mechanically possible:

1. **Purity:** nothing in `lib/domain` imports React, Next.js, `@supabase/*`,
   or anything from `components/` / `app/`. Repository *implementations* live
   in `lib/infra/**` (created in PATCH-004+) and are injected.
2. **Results, not throws:** every public function returns
   `Promise<Result<T>>` (or `Result<T>`). Throwing across the domain boundary
   is a bug; `defineCommand` converts stray throws into `unknown` errors.
3. **Errors are codes:** UI maps `DomainError.code` to user copy. `message` is
   developer-facing and must never be shown to users verbatim.
4. **Zod at every boundary:** command inputs are validated by the command's
   schema before `execute` runs. Never trust caller-supplied shapes.
5. **Branded IDs:** `BoardId`/`PostId`/`UserId` from `core/ids.ts` — never raw
   `string` for entity ids in domain signatures.
6. **Naming:** commands are `entity.verb` (`board.softDelete`); one feature
   folder per aggregate (`boards/`, `posts/`, `comments/`); repositories are
   interfaces named `<Entity>Repository`.
7. **Minimalism:** no combinators, base classes, or generics until a second
   concrete consumer needs them (CTO_PLAYBOOK §7). Additions to `core/`
   require CTO sign-off in the patch that needs them.
```

## Step 3 — CREATE `lib/domain/core/result.ts`
```ts
import type { DomainError } from './errors';

/**
 * Discriminated result. Domain functions return this instead of throwing —
 * callers must handle both arms (CONVENTIONS.md rule 2).
 */
export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { readonly ok: true; readonly value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { readonly ok: false; readonly error: E } {
  return !r.ok;
}
```

## Step 4 — CREATE `lib/domain/core/errors.ts`
```ts
/**
 * Closed error taxonomy. UI maps `code` to user-facing copy; `message` is
 * developer-facing only (CONVENTIONS.md rule 3). Extend the union ONLY via a
 * CTO-approved patch.
 */
export type DomainErrorCode =
  | 'validation'        // input failed schema/invariant checks
  | 'not_found'         // entity does not exist or is soft-deleted
  | 'permission_denied' // caller lacks the required capability
  | 'conflict'          // version/uniqueness conflict; retry may help
  | 'rate_limited'      // app- or provider-level throttle
  | 'quota_exceeded'    // plan entitlement limit reached
  | 'unavailable'       // infrastructure failure (network, DB down)
  | 'unknown';          // unexpected exception; always report to telemetry

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  /** Machine-readable extras (e.g. zod issues). Never user-facing. */
  readonly details?: unknown;
  /** Original thrown value, for logging only. */
  readonly cause?: unknown;
}

export function domainError(
  code: DomainErrorCode,
  message: string,
  extras?: { details?: unknown; cause?: unknown },
): DomainError {
  return { code, message, details: extras?.details, cause: extras?.cause };
}
```

## Step 5 — CREATE `lib/domain/core/ids.ts`
```ts
/**
 * Branded entity ids — prevents cross-entity id mixups at compile time.
 * Casts (`asBoardId`) belong at system boundaries (route params, DB rows),
 * not sprinkled through business logic.
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type BoardId = Brand<string, 'BoardId'>;
export type PostId = Brand<string, 'PostId'>;
export type UserId = Brand<string, 'UserId'>;

export const asBoardId = (id: string): BoardId => id as BoardId;
export const asPostId = (id: string): PostId => id as PostId;
export const asUserId = (id: string): UserId => id as UserId;
```

## Step 6 — CREATE `lib/domain/core/command.ts`
```ts
import { z } from 'zod';
import type { Result } from './result';
import { err } from './result';
import type { DomainError } from './errors';
import { domainError } from './errors';
import type { UserId } from './ids';

/** Who is acting. `null` user = anonymous (share-link visitor). */
export interface CommandContext {
  readonly userId: UserId | null;
}

export interface Command<I, O> {
  readonly name: `${string}.${string}`; // entity.verb (CONVENTIONS.md rule 6)
  (input: unknown, ctx: CommandContext): Promise<Result<O, DomainError>>;
}

/**
 * The single write-path constructor (ARCHITECTURE.md rule 3, first form).
 * Validates input with zod, converts stray throws into `unknown` errors so
 * exceptions never cross the domain boundary.
 */
export function defineCommand<I, O>(definition: {
  name: `${string}.${string}`;
  input: z.ZodType<I>;
  execute: (input: I, ctx: CommandContext) => Promise<Result<O, DomainError>>;
}): Command<I, O> {
  const run = async (input: unknown, ctx: CommandContext): Promise<Result<O, DomainError>> => {
    const parsed = definition.input.safeParse(input);
    if (!parsed.success) {
      return err(
        domainError('validation', `Invalid input for ${definition.name}`, {
          details: parsed.error.issues,
        }),
      );
    }
    try {
      return await definition.execute(parsed.data, ctx);
    } catch (cause: unknown) {
      return err(
        domainError('unknown', `Unhandled exception in ${definition.name}`, { cause }),
      );
    }
  };
  return Object.assign(run, { name: definition.name }) as Command<I, O>;
}
```

## Step 7 — CREATE `lib/domain/boards/repository.ts`
```ts
import type { Result } from '../core/result';
import type { DomainError } from '../core/errors';
import type { BoardId, UserId } from '../core/ids';

/**
 * Minimal board read/write contract — the exemplar repository interface.
 * Implementations live in lib/infra (PATCH-004+); the domain never imports
 * them directly, they are injected. Methods are added ONLY when an extraction
 * patch needs them (CONVENTIONS.md rule 7) — do not pre-build CRUD.
 */
export interface BoardSummary {
  readonly id: BoardId;
  readonly title: string;
  readonly activeLayout: string;
  readonly deletedAt: string | null;
}

export interface BoardRepository {
  findById(id: BoardId): Promise<Result<BoardSummary, DomainError>>;
  listForUser(userId: UserId): Promise<Result<readonly BoardSummary[], DomainError>>;
  softDelete(id: BoardId): Promise<Result<void, DomainError>>;
}
```

## Step 8 — CREATE `vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/domain/**/*.test.ts'],
    environment: 'node',
  },
});
```

## Step 9 — CREATE the two test files

`lib/domain/core/result.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, ok } from './result';

describe('Result', () => {
  it('ok carries the value and narrows via isOk', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r) && r.value).toBe(42);
  });

  it('err carries the error and narrows via isErr', () => {
    const r = err({ code: 'not_found' as const, message: 'missing' });
    expect(r.ok).toBe(false);
    expect(isErr(r) && r.error.code).toBe('not_found');
  });
});
```

`lib/domain/core/command.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineCommand } from './command';
import { ok } from './result';
import type { CommandContext } from './command';

const ctx: CommandContext = { userId: null };

const echo = defineCommand({
  name: 'test.echo',
  input: z.object({ text: z.string().min(1) }),
  execute: async (input) => ok(input.text.toUpperCase()),
});

const boom = defineCommand({
  name: 'test.boom',
  input: z.object({}),
  execute: async () => {
    throw new Error('exploded');
  },
});

describe('defineCommand', () => {
  it('runs execute on valid input', async () => {
    const r = await echo({ text: 'hi' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toBe('HI');
  });

  it('rejects invalid input with a validation error (execute never runs)', async () => {
    const r = await echo({ text: '' }, ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('validation');
    expect(!r.ok && r.error.details).toBeTruthy();
  });

  it('rejects non-object input with a validation error', async () => {
    const r = await echo('not-an-object', ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('validation');
  });

  it('converts thrown exceptions into unknown errors', async () => {
    const r = await boom({}, ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('unknown');
    expect(!r.ok && (r.error.cause as Error).message).toBe('exploded');
  });

  it('exposes its entity.verb name', () => {
    expect(echo.name).toBe('test.echo');
  });
});
```

## Step 10 — MODIFY `package.json`
In `"scripts"`: add `"test:unit": "vitest run",` and replace `verify` with:
```json
"verify": "npm run typecheck && npm run check:boundaries && npm run test:unit && npm run build"
```
(devDependencies gains `vitest` via Step 1 — do not hand-edit versions.)

## Step 11 — MODIFY `eslint.boundaries.config.mjs`
Append a third config object to the exported array (after the existing rule
object), leaving everything else untouched:
```js
  {
    // Domain purity (PATCH-003): lib/domain imports no UI or infrastructure.
    files: ['lib/domain/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'next', 'next/*', '@supabase/*', '@/components/*', '@/app/*'],
              message:
                'lib/domain must stay pure: no UI, no framework, no infrastructure imports (lib/domain/CONVENTIONS.md rule 1).',
            },
          ],
        },
      ],
    },
  },
```
Also extend the `check:boundaries` script's positional globs in `package.json`
to include the new tree: append `"lib/domain/**/*.ts"` as a third quoted glob.

## Step 12 — VERIFY
Run the Verification Steps block from the patch body above, in order, pasting
ALL real output. The purity canary MUST fail and MUST NOT survive.

## Step 13 — COMMIT
Exactly the listed files. Message:
```
feat(domain): add domain layer foundation — Result, errors, ids, defineCommand, BoardRepository interface (PATCH-003)
```

## Step 14 — REPORT
Use the format from CODER_HANDOFF_TEMPLATE.md, including the resolved vitest
version and any type-error fixes you made inside the created files.

## Hard boundaries (reject-on-touch)
`components/`, `app/`, `supabase/`, `types/`, `e2e/`, `.fable5/`, `.claude/`,
`next.config.ts`, `middleware.ts`, `playwright.config.ts`, `eslint.config.mjs`,
`tsconfig.json`. The purity canary must not survive the commit.

---

# Handoff instructions for GPT-5.4 (owner: paste this)

Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with:
- `{{NUMBER}}` = 003
- `{{TITLE}}` = Domain layer foundation (`lib/domain` skeleton)
- Optional block: "No credentials needed. Do NOT run `npm run build` or any
  Playwright test — a dev server may be running. `npm install` IS required
  (Step 1). The spec's code is unexecuted: trivial type-error fixes inside the
  files you create are allowed but must be itemized in your report; anything
  beyond that = stop and report."
