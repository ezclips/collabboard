# PATCH-017 — Extraction: settings-root (workspace settings) + the storage seam (Pattern H)

**Status:** DONE (2026-07-08, commit `ff84152`) — CTO review PASSED.
**Amendment 1 issued: characterization rebound to the e2e account's reachable
state (cookie-only session → the page's localStorage token guard fails
first); the "non-empty name" and banner⇄Save assertions were CTO spec
defects.** No deviations beyond the two pre-accepted ones (DomainError
wraps thrown storage/write errors; console-only difference).
**Complexity:** medium (three new seam files + one command, but every decision
is pre-made below)
**Assigned model:** **GPT-5.4**
**Pattern:** A/E composition (repository reads + command write, references:
PATCH-004, PATCH-009) **plus NEW Pattern H — storage gateway** (enters
PATCH_REFERENCE at review — it is NOT in the catalog yet, by design; this
patch is the complete, self-contained spec. Do not stop looking for
"Pattern H" elsewhere).
**Depends on:** PATCH-016 (sequence only). PATCH-018/019 depend on THIS.

## Purpose
Move `app/dashboard/settings/page.tsx` (357 lines) off direct Supabase:
`workspace_settings` read/update/insert and `workspaces` update go behind a
domain command + two repositories; the avatars logo upload goes behind the
first storage gateway (`lib/infra/supabase/storage.ts` — the seam PATCH-018
reuses). Grandfather list 9 → 8.

## Scope
Exactly six Supabase call sites in one file (census below): one
`maybeSingle` read, two `workspace_settings` writes, one `workspaces`
update, one storage upload, one `getPublicUrl`. Nothing else.

## Explicit NON-goals (owner-bound; violating any of these fails review)
- **The page's `getAccessToken()` localStorage scavenger (lines 35–47) and
  BOTH manual JWT decodes (`atob(token.split('.')[1])` → `payload.sub`)
  stay byte-identical in the page.** They are PATCH-023's authorized
  behavior change; centralizing them is PATCH-018's job. Not here.
- The `fetch('/api/workspace/settings-access', ...)` call and its Bearer
  header: untouched.
- No auth behavior changes (this page makes NO `auth.*` calls — census
  confirms; do not add any).
- No storage behavior changes: same bucket (`avatars`), same path scheme,
  same `{ upsert: true }`, same public-URL consumption.
- No UX/rendering/toast changes; no validation added (an EMPTY workspace
  name is savable today — the command's zod schema must allow `''`; do NOT
  add `.min(1)`).
- Nothing from PATCH-018/019/020+ pulled forward.

## CTO note — the discovered scavenger does not change this patch's shape
The 2026-07-08 census note ("settings-root = repos + storage") missed that
this page ALSO has a (narrower) token-scavenger. Ruling: the scavenger's
outputs (`token`, `userId`) become plain ARGUMENTS to the new seam calls;
the scavenger itself does not move. The boundary freeze bans `@supabase/*`
imports, which this page will no longer have; the scavenger uses only
`localStorage` and is tracked by the 023 security flag in CURRENT_TASK.

## Pre-edit census (paste ALL output; STOP on any mismatch)
```bash
# 1. The only @supabase surface is the import + client creation:
grep -n "@supabase" app/dashboard/settings/page.tsx
# expected: exactly 1 line — line 4, createClientComponentClient import
# 2. Variable-INDEPENDENT call census (PATCH_REFERENCE §0). NOTE: the call
#    chains are MULTI-LINE (`await supabase.storage` / newline / `.from(...)`),
#    so the census anchors on the METHOD lines, not the client variable:
grep -nE "\.from\('[^']*'\)" app/dashboard/settings/page.tsx
# expected EXACTLY 6 lines:
#   L81  .from('workspace_settings')   (maybeSingle read)
#   L122 .from('workspace_settings')   (update)
#   L128 .from('workspace_settings')   (insert)
#   L140 .from('workspaces')           (update)
#   L179 .from('avatars')              (storage upload)
#   L184 .from('avatars')              (storage getPublicUrl)
grep -nE "\.storage\b" app/dashboard/settings/page.tsx
# expected EXACTLY 2 lines: L178 and L183 (both `supabase.storage`)
grep -nE "\.auth\.|\.rpc\(" app/dashboard/settings/page.tsx
# expected: NO output, exit 1 — the page never calls supabase.auth or rpc
# 3. Consumed row fields (must stay within the selected columns):
grep -oE "settingsRow\??\.[a-zA-Z_]+" app/dashboard/settings/page.tsx | sort -u
# expected: settingsRow?.id  settingsRow?.workspace_logo  settingsRow?.workspace_name
# 4. The scavenger that STAYS (count it now; must be identical post-edit):
grep -c "getAccessToken\|atob(" app/dashboard/settings/page.tsx
# expected: 6  (definition L35, calls L52/L112/L169, atob decodes L114/L171)
wc -l app/dashboard/settings/page.tsx   # expected: 357
```
Anything more, less, or different: STOP, report, change nothing.

## Bindings

### 1. Domain — `lib/domain/settings/workspace.ts` — exactly:
```ts
import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { UserId } from '../core/ids';
import type { Result } from '../core/result';
import { err } from '../core/result';

/** Mirrors the three columns the settings page selects today. */
export interface WorkspaceSettingsRow {
  readonly id: string;
  readonly workspaceName: string | null;
  readonly workspaceLogo: string | null;
}

export interface WorkspaceSettingsWriteFields {
  readonly workspaceName: string;
  readonly workspaceLogo: string | null;
  readonly updatedAt: string;
}

export interface WorkspaceSettingsRepository {
  /** null = no row for this workspace (maybeSingle semantics, not an error). */
  findByWorkspaceId(workspaceId: string): Promise<Result<WorkspaceSettingsRow | null, DomainError>>;
  updateById(id: string, fields: WorkspaceSettingsWriteFields): Promise<Result<void, DomainError>>;
  insert(
    fields: WorkspaceSettingsWriteFields & { readonly workspaceId: string; readonly userId: UserId },
  ): Promise<Result<void, DomainError>>;
}

export interface WorkspacesRepository {
  updateNameAndLogo(
    workspaceId: string,
    fields: { readonly name: string; readonly logoUrl: string | null; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>>;
}

/** Empty name is deliberately allowed — the legacy page saves '' today. */
export const saveWorkspaceSettingsSchema = z.object({
  workspaceId: z.string(),
  settingsRowId: z.string().nullable(),
  workspaceName: z.string(),
  workspaceLogo: z.string().nullable(),
});

export const createSaveWorkspaceSettingsCommand = (
  settingsRepository: WorkspaceSettingsRepository,
  workspacesRepository: WorkspacesRepository,
) =>
  defineCommand({
    name: 'settings.saveWorkspace',
    input: saveWorkspaceSettingsSchema,
    execute: async (input, ctx) => {
      if (!ctx.userId) {
        return err(
          domainError('permission_denied', 'A signed-in user is required to save workspace settings'),
        );
      }
      // ONE timestamp for both tables — mirrors the legacy page exactly.
      const updatedAt = new Date().toISOString();
      const fields = {
        workspaceName: input.workspaceName,
        workspaceLogo: input.workspaceLogo,
        updatedAt,
      };
      // Write order and partial-failure semantics preserved from the legacy
      // page (PATCH-017): settings row first; if it fails, workspaces is NOT
      // touched. If workspaces then fails, the settings write stays applied.
      const settingsResult = input.settingsRowId
        ? await settingsRepository.updateById(input.settingsRowId, fields)
        : await settingsRepository.insert({
            ...fields,
            workspaceId: input.workspaceId,
            userId: ctx.userId,
          });
      if (!settingsResult.ok) return settingsResult;
      return workspacesRepository.updateNameAndLogo(input.workspaceId, {
        name: input.workspaceName,
        logoUrl: input.workspaceLogo,
        updatedAt,
      });
    },
  });
```

### 2. Infra — `lib/infra/settings/workspaceSettingsRepository.ts`
PATCH-004/-015 structure: `SupabaseErrorLike`, narrow structural client
interface, class, factory bound to `createBrowserSupabaseClient`. Exact
query shapes (payload keys are the CONTRACT — reviewer compares to the old
page byte-for-byte):
- `findByWorkspaceId`:
  `from('workspace_settings').select('id, workspace_name, workspace_logo').eq('workspace_id', workspaceId).maybeSingle()`
  Mapping: `error` → `err(domainError('unavailable', 'Could not load workspace settings', { cause: error }))`;
  no row → `ok(null)`; row → `ok({ id: data.id, workspaceName: data.workspace_name ?? null, workspaceLogo: data.workspace_logo ?? null })`.
  (`maybeSingle` returns `data: null` with NO error for zero rows — no
  PGRST116 branch here, unlike `.single()` repositories.)
- `updateById(id, fields)`:
  `from('workspace_settings').update({ workspace_name: fields.workspaceName, workspace_logo: fields.workspaceLogo, updated_at: fields.updatedAt }).eq('id', id)`
  error → `err(domainError('unavailable', 'Could not save workspace settings', { cause: error }))`; else `ok(undefined)`.
- `insert(fields)`:
  `from('workspace_settings').insert({ workspace_id: fields.workspaceId, user_id: fields.userId, workspace_name: fields.workspaceName, workspace_logo: fields.workspaceLogo, updated_at: fields.updatedAt })`
  same error mapping. EXACTLY these five keys — no `id`, no `created_at`.

### 3. Infra — `lib/infra/workspaces/workspacesRepository.ts`
Same structure. One method:
- `updateNameAndLogo(workspaceId, fields)`:
  `from('workspaces').update({ name: fields.name, logo_url: fields.logoUrl, updated_at: fields.updatedAt }).eq('id', workspaceId)`
  error → `err(domainError('unavailable', 'Could not save workspace', { cause: error }))`; else `ok(undefined)`.
Factory: `createWorkspacesRepository()`.

### 4. Infra — `lib/infra/supabase/storage.ts` — exactly (Pattern H seam):
```ts
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { createBrowserSupabaseClient } from './browserClient';

export interface StorageUploadOptions {
  readonly upsert?: boolean;
  readonly cacheControl?: string;
}

interface StorageErrorLike {
  readonly message?: string;
}

interface StorageSupabaseClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        file: File,
        options?: StorageUploadOptions,
      ): Promise<{ error: StorageErrorLike | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
}

/**
 * Pattern H — the browser storage seam (PATCH-017; catalog entry lands at
 * review). Thin, bucket-parameterized, behavior-preserving: upload maps
 * errors to Result, getPublicUrl is synchronous and cannot fail upstream.
 */
export interface StorageGateway {
  upload(
    bucket: string,
    path: string,
    file: File,
    options?: StorageUploadOptions,
  ): Promise<Result<void, DomainError>>;
  getPublicUrl(bucket: string, path: string): string;
}

export class SupabaseStorageGateway implements StorageGateway {
  constructor(private readonly client: StorageSupabaseClient) {}

  async upload(
    bucket: string,
    path: string,
    file: File,
    options?: StorageUploadOptions,
  ): Promise<Result<void, DomainError>> {
    try {
      const { error } = await this.client.storage.from(bucket).upload(path, file, options);
      if (error) {
        return err(domainError('unavailable', 'Could not upload file', { cause: error }));
      }
      return ok(undefined);
    } catch (cause: unknown) {
      return err(domainError('unavailable', 'Could not upload file', { cause }));
    }
  }

  getPublicUrl(bucket: string, path: string): string {
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
}

export function createStorageGateway(): StorageGateway {
  return new SupabaseStorageGateway(
    createBrowserSupabaseClient() as unknown as StorageSupabaseClient,
  );
}
```

### 5. Page rewrite — `app/dashboard/settings/page.tsx`
- Remove line 4 (`createClientComponentClient` import) and line 17
  (`const supabase = createClientComponentClient();`). Add:
  ```ts
  import { asUserId } from '@/lib/domain/core/ids';
  import { createSaveWorkspaceSettingsCommand } from '@/lib/domain/settings/workspace';
  import { createWorkspaceSettingsRepository } from '@/lib/infra/settings/workspaceSettingsRepository';
  import { createWorkspacesRepository } from '@/lib/infra/workspaces/workspacesRepository';
  import { createStorageGateway } from '@/lib/infra/supabase/storage';
  ```
  and inside the component (PATCH-009 wiring style; add `useMemo` to the
  React import):
  ```ts
  const workspaceSettingsRepository = useMemo(() => createWorkspaceSettingsRepository(), []);
  const workspacesRepository = useMemo(() => createWorkspacesRepository(), []);
  const storageGateway = useMemo(() => createStorageGateway(), []);
  const saveWorkspaceSettings = useMemo(
    () => createSaveWorkspaceSettingsCommand(workspaceSettingsRepository, workspacesRepository),
    [workspaceSettingsRepository, workspacesRepository],
  );
  ```
- `loadSettings` — replace ONLY the maybeSingle block (lines 80–84; the
  `// Load workspace_settings row if it exists` comment on line 79 stays)
  with:
  ```ts
  const settingsResult = await workspaceSettingsRepository.findByWorkspaceId(workspaceId);
  // PATCH-017: the legacy page destructured `data` and IGNORED read errors —
  // an err here must behave exactly like "no row" (fall through to API values).
  const settingsRow = settingsResult.ok ? settingsResult.value : null;
  ```
  and update the three consumers to the camelCase row:
  `settingsRow?.workspaceName || data.workspace_name || 'My Workspace'`,
  `settingsRow?.workspaceLogo || data.workspace_logo || null`,
  `settingsRowId: settingsRow?.id ?? null`. Everything else in
  `loadSettings` (token guard, fetch, toasts, setState) byte-identical.
- `saveSettings` — lines 108–117 (guard, token, atob, userId) byte-identical.
  Replace lines 118–143 (the `now` + three write blocks) with:
  ```ts
  const result = await saveWorkspaceSettings(
    {
      workspaceId: workspace.workspaceId,
      settingsRowId: workspace.settingsRowId,
      workspaceName,
      workspaceLogo: logoUrl,
    },
    { userId: asUserId(userId) },
  );
  if (!result.ok) throw result.error;
  ```
  Success toast + `await loadSettings()` + catch/finally byte-identical.
- `uploadLogoFile` — validation, token, atob, `fileExt`/`filePath` lines
  byte-identical. Replace ONLY the two storage blocks (lines 178–185) with:
  ```ts
  const uploadResult = await storageGateway.upload('avatars', filePath, file, { upsert: true });
  if (!uploadResult.ok) throw uploadResult.error;
  const publicUrl = storageGateway.getPublicUrl('avatars', filePath);
  ```
  then `setLogoUrl(publicUrl);` and everything after byte-identical.
- ALL rendering (lines 199–357): untouched.

## Files to Create
- `lib/domain/settings/workspace.ts` (verbatim §1)
- `lib/infra/settings/workspaceSettingsRepository.ts` (§2)
- `lib/infra/workspaces/workspacesRepository.ts` (§3)
- `lib/infra/supabase/storage.ts` (verbatim §4)
- `lib/domain/settings/workspace.test.ts` (unit, below)
- `lib/infra/settings/workspaceSettingsRepository.test.ts` (unit, below)
- `lib/infra/workspaces/workspacesRepository.test.ts` (unit, below)
- `lib/infra/supabase/storage.test.ts` (unit, below)
- `e2e/characterization/workspace-settings-root.spec.ts` (below)

## Files to Modify
- `app/dashboard/settings/page.tsx` (§5)
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/page.tsx',`

## MUST NOT touch
`app/api/**` (incl. the settings-access route); the page's
`getAccessToken`/`atob` lines and the API fetch; `lib/infra/supabase/`
`browserClient.ts`/`currentUser.ts`/`authState.ts`/`serverClient.ts`;
`lib/domain/core/**`; `vitest.config.ts` (its include already covers every
new test path — verified 2026-07-08); all other pages/components/specs;
`.fable5/`; `.claude/`. No new dependencies.

## Unit-test requirements (fake clients/repos; PATCH-015 test style)
- `workspaceSettingsRepository.test.ts`: row passthrough + snake→camel
  mapping; `maybeSingle` no-row → `ok(null)`; db error → `err`; update
  payload EXACTLY `{ workspace_name, workspace_logo, updated_at }` with
  `eq('id', ...)`; insert payload EXACTLY the five bound keys.
- `workspacesRepository.test.ts`: update payload EXACTLY
  `{ name, logo_url, updated_at }` with `eq('id', workspaceId)`; error → err.
- `storage.test.ts`: upload passes bucket/path/file/options through
  (assert `{ upsert: true }` arrives verbatim); upload error → `err`;
  thrown upload → `err`; `getPublicUrl` returns the fake's publicUrl.
- `workspace.test.ts` (command): null `ctx.userId` → `permission_denied`
  and NO repo called; `settingsRowId` present → `updateById` called,
  `insert` NOT called; `settingsRowId` null → `insert` called with
  `ctx.userId`, `updateById` NOT called; settings write failure →
  command errs and `workspacesRepository` NOT called; both writes receive
  the SAME `updatedAt` string; workspaces failure after settings success →
  command errs (and the test asserts the settings write DID run).
Current suite is 43 tests / 11 files. Expect ≥14 new tests; `npm run
test:unit` output must LIST all four new files by name and state the new
total.

## Amendment 1 (2026-07-09) — characterize the REACHABLE state: the e2e session is cookie-only, so the page's token guard fails before any Supabase call · CTO decision

**Blockage (GPT-5.4, correct stop — no code changed):** step 3 asserted a
non-empty workspace-name input "for ANY account"; observed OLD-page value
is `""`.

**CTO reproduction (2026-07-09, OLD page, live dev server, the e2e storage
state):** localStorage is EMPTY (`[]`); the session lives only in the
`sb-…-auth-token` COOKIE; `getAccessToken()` scans localStorage → null →
`loadSettings` early-returns at its FIRST guard. Observed, all
deterministic: toast "Not authenticated — please log in again"; ZERO
requests to `/api/workspace/settings-access` and zero Supabase reads; name
input `""` and DISABLED; "Save changes" DISABLED; read-only banner ABSENT
(it requires a loaded workspace); all three rows render.

**Root cause (CTO spec defect):** steps 3 and 5 were written from
`loadSettings`' happy path; the source has four early-return paths that
leave the name `''`, and the e2e account deterministically hits the first.
Third instance of the assert-reachability defect family (PATCH-012
"renders on most pages"; PATCH-014 wrong-confirmation toast) — this time
in a Fable-authored spec: the dry-run obligation was honored for census
commands but NOT for characterization assertions. Lesson updated.

**Product-bug note (preserve, do NOT fix here):** the page is unusable for
ANY cookie-session user — its localStorage assumption is stale relative to
the cookie-based auth-helpers login. This makes PATCH-023's scavenger
normalization a FUNCTIONAL REPAIR, not just hygiene. Recorded in
CURRENT_TASK; behavior preserved byte-identical in this patch.

**Decision:** characterize the deterministic failure-path state. This is a
real net for the extraction: it proves the rewrite keeps the token guard
FIRST (seam construction at mount must not crash or reorder ahead of it).
The seams themselves are e2e-unreachable for this account — repository/
command/gateway correctness rides the unit tests + review, per the
PATCH-014/015 risk-acceptance shape. Accepted by CTO.

## Characterization requirements — `e2e/characterization/workspace-settings-root.spec.ts` **[flow rebound by Amendment 1]**
Phase A first: green against the OLD page, then unchanged against the NEW.
Authenticated project (keep the standard
`test.skip(!hasE2ECredentials, ...)` guard — the spec characterizes the
signed-in-but-cookie-only state).
**Read-only by design: the spec must NEVER click "Save changes", never open
the logo modal, never upload — it would write shared workspace state.**
Flow:
1. `goto('/dashboard/settings')`; assert the `Settings` heading renders
   (30s timeout — the loading spinner must resolve).
2. IMMEDIATELY next (the toast auto-dismisses in ~4s and fires at the same
   render tick as the form): assert the "Not authenticated — please log in
   again" toast (`[data-sonner-toast]`; deterministic for the e2e session —
   cookie-only, empty localStorage).
3. Assert the `Workspace settings` label and the three rows render:
   `Logo`, `Name`, `Workspace URL` (the `collabboard.app/` prefix is the
   URL row's witness).
4. Assert the name input (`getByPlaceholder('Enter workspace name')`) has
   value `""` AND is disabled.
5. Assert "Save changes" is DISABLED and the read-only banner
   ("You have read-only access") is NOT visible — the banner requires a
   loaded workspace, and none loads in this state.
Do NOT assert on the API or Supabase network (there is none in this path —
that absence is the point). The write path and all three seams are
deliberately NOT e2e-covered (unreachable for this account); they are
covered by the command/repository/gateway unit tests + review. Same
risk-acceptance shape as PATCH-014/015.

## Known deviations (pre-accepted; do not "fix", do not extend)
1. `uploadLogoFile` used to `throw` the raw Supabase storage error; it now
   throws a `DomainError` wrapping it. Only `console.error` output changes
   (§6: console-only differences allowed). Toasts identical.
2. Same for `saveSettings` (`throw error` → `throw result.error`).
3. The command validates input with zod (house rule 6). With the bound
   schema this cannot reject any value the page can produce today
   (empty strings allowed, nullables bound).

## Required comments in code (reviewer checks presence)
- The err→null mapping comment in `loadSettings` (bound in §5).
- The write-order/partial-failure comment in the command (bound in §1).
- The Pattern H doc comment on the gateway (bound in §4).

## Verification sequence (in order; paste all output)
```bash
# (pre-edit census first, then Phase A:)
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/workspace-settings-root.spec.ts   # OLD page
npm run test:unit          # all 4 new files listed, new total stated
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test    # full suite (20 tests), NEW page
grep -c "@supabase" app/dashboard/settings/page.tsx      # 0 (printed value is the criterion; exit 1 expected)
grep -c "getAccessToken\|atob(" app/dashboard/settings/page.tsx   # still 6 — scavenger untouched
# grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Local e2e runs use the config's 2 workers — never override with `--workers`.

## Commit
ONE atomic commit (implementation + tests + spec + grandfather line).
  Commit message:
  refactor(settings): extract workspace settings onto domain seam + storage gateway

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches ALL four expected blocks
- [ ] New e2e spec green against OLD page first, then NEW (both pasted),
      and it contains NO Save click, NO logo-modal interaction, NO upload
- [ ] Spec matches the Amendment 1 flow exactly: failure-path state
      (empty+disabled input, disabled Save, absent banner, auth toast
      asserted immediately after the heading); NO non-empty-name assertion,
      NO banner⇄Save equivalence, NO network assertions **[Amendment 1]**
- [ ] `npm run test:unit` green; four new test files listed by name;
      new total stated (≥57)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Full e2e suite green (20 tests) against the running dev server
- [ ] `grep -c "@supabase" app/dashboard/settings/page.tsx` prints 0
- [ ] `grep -c "getAccessToken\|atob(" ...` still prints 6 (scavenger intact)
- [ ] Grandfather list = 8 (count stated)
- [ ] Single atomic commit; hash reported

## Reviewer checklist (CTO or successor; CTO_PLAYBOOK §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] Diff-vs-Bindings with `--ignore-space-at-eol`; the ONLY page changes
      are the import block, the useMemo block, and the three replaced
      call-site regions bound in §5
- [ ] `git diff HEAD~1 -- app/dashboard/settings/page.tsx` shows the
      scavenger + atob + API-fetch lines UNCHANGED (byte-identical)
- [ ] Insert/update payload keys compared byte-for-byte against the OLD
      page (five keys / three keys / three keys — no additions)
- [ ] Command partial-failure order test exists and actually asserts
      "workspaces NOT called on settings failure"
- [ ] Zod schema allows empty workspaceName ('' savable, as today)
- [ ] No `'use client'` file imports `serverClient`; the new gateway binds
      the BROWSER client (this is client-side storage, not Pattern G)
- [ ] e2e spec is mutation-free (three named interactions absent)
- [ ] Pattern H entered into PATCH_REFERENCE (§5.8 + §7 row) at review
      closeout — the catalog's reviewed-reference rule

## Expected grandfather reduction
9 → 8 (`app/dashboard/settings/page.tsx` removed; count re-verified at
review).

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 017,
`{{TITLE}}` = workspace settings + storage gateway. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0 and §6 first. Pattern H is NOT in the
catalog yet — the patch file is the complete spec. The page's localStorage
token code and atob decodes are hard-frozen: your diff must leave those
lines byte-identical. The e2e spec must never click Save or touch the logo
modal — it would write shared workspace state. Two pre-accepted deviations
are bound in the patch (DomainError replaces raw thrown errors —
console-only); do not add more. Local e2e = 2 workers by config; do not
override. Run every verification command and paste real output; the patch
is not done until the atomic commit exists. E2E credentials are in
`.env.local` — never print them. PW_BASE_URL against the running dev
server; final `npm run verify` only after the owner stops it."

## Estimated Difficulty
medium — four new files but zero open decisions; the two traps are the
frozen scavenger lines and the mutation-free e2e spec.
