# PATCH-009 — Extraction: dashboard settings page (two repositories, joined read)

**Status:** in progress (GPT-5.4) — **Amendment 1 issued after a correct block; resume instructions at the bottom**
**Complexity:** medium (largest of the batch; still fully bound)
**Assigned model:** **GPT-5.4** — every decision is bound below. If ANY
query result or page behavior does not match this spec's description, STOP
and report; do not adapt.
**Depends on:** PATCH-007 (`getCurrentUser`) — hard prerequisite.
**Canonical reference:** PATCH-004 (commit `5278468`).

## Goal
Move `app/dashboard/settings/dashboard/page.tsx` (300 lines, tables
`dashboard_settings` + `workspace_members` with a `workspaces` join) onto the
seam; grandfather list 18 → 17. First page composing TWO repositories.

## Bindings (the only decisions in this patch)

### Domain — `lib/domain/settings/dashboard.ts`
- Types lifted from the page verbatim:
  `Library` (`id: string; name: string; username: string;
  type: 'personal' | 'workspace'; avatar_url?: string; show: boolean`),
  `DashboardSettingsData` = `{ libraries: Library[]; defaultWorkspace: string }`.
- zod for the command input: `librarySchema` mirroring `Library`
  (`avatar_url: z.string().optional()`), and
  `z.object({ libraries: z.array(librarySchema), defaultWorkspace: z.string() })`.
- `DashboardSettingsRepository` interface:
  `load(userId): Promise<Result<DashboardSettingsRow | null, DomainError>>`
  where `DashboardSettingsRow = { readonly defaultWorkspace: string | null;
  readonly libraries: unknown | null }` — `libraries` stays `unknown` because
  the page validates/merges it itself (`savedById` map with `?? true`
  fallback); preserve that page logic untouched.
  `save(userId, settings: DashboardSettingsData): Promise<Result<void, DomainError>>`.
- ONE command: `createSaveDashboardSettingsCommand(repository)` →
  `defineCommand({ name: 'settings.saveDashboard', ... })`; missing
  `ctx.userId` → `permission_denied`. BOTH page save sites (library toggle
  and default-workspace change) go through this one command.

### Domain — `lib/domain/workspaces/memberships.ts`
- `WorkspaceMembership` lifted from the page's `WorkspaceRow` verbatim:
  `{ workspace_id: string; role: string;
  workspaces: { id: string; name: string; logo_url: string | null } | null }`.
- `WorkspaceMembershipsRepository` interface:
  `listForUser(userId): Promise<Result<WorkspaceMembership[], DomainError>>`.
- No command (read-only), no zod (no external input).

### Infra
- `lib/infra/settings/dashboardSettingsRepository.ts` — PATCH-004 structure.
  load: `from('dashboard_settings').select('*').eq('user_id', userId).single()`;
  `PGRST116` → `ok(null)`; other error → `unavailable` with cause; row →
  `ok({ defaultWorkspace: data?.default_workspace ?? null, libraries: data?.libraries ?? null })`.
  save (upsert) payload exactly:
  `{ user_id, libraries, default_workspace: defaultWorkspace, updated_at: new Date().toISOString() }`
  (note the snake_case column names).
- `lib/infra/workspaces/workspaceMembershipsRepository.ts` — query EXACTLY as
  the page does today (verbatim select string):
  ```
  from('workspace_members').select(`
      workspace_id,
      role,
      workspaces:workspace_id (
          id,
          name,
          logo_url
      )
  `).eq('user_id', userId)
  ```
  error → `unavailable` with cause; success → `ok(data ?? [])` cast to
  `WorkspaceMembership[]` (no validation — mirror-the-shape rule).

### Page rewrite
- `getCurrentUser()` (from PATCH-007) replaces `auth.getUser()` — the page
  needs `email` for its username derivation (`email?.split('@')[0] || 'user'`)
  and keeps a local user-ish state; store the `CurrentUser` value where the
  page stored the Supabase `User` and adjust member access (`.id`, `.email`)
  — the `User` type import from `@supabase/supabase-js` must go.
- The page currently issues the workspace_members query from TWO call sites
  (initial + a retry/fallback path). Both call sites call
  `membershipsRepository.listForUser(...)` — preserve the page's existing
  control flow around them exactly (including the retry).
- All error paths map to the page's existing outcomes (`setLoadError(...)`,
  console.warn, defaults) — console-only differences allowed, UI differences
  not. `toast.success('Default workspace updated')` stays exactly where it is.

## Files to Create
- `lib/domain/settings/dashboard.ts`
- `lib/domain/settings/dashboard.test.ts` — command rejects missing userId;
  validates input shape (one full fixture); passes ctx userId to fake repo.
- `lib/domain/workspaces/memberships.ts`
- `lib/infra/settings/dashboardSettingsRepository.ts`
- `lib/infra/settings/dashboardSettingsRepository.test.ts` — row-found
  (column mapping incl. snake_case), no-row PGRST116 → ok(null), db-error;
  upsert payload asserted field-by-field.
- `lib/infra/workspaces/workspaceMembershipsRepository.ts`
- `lib/infra/workspaces/workspaceMembershipsRepository.test.ts` — rows
  passthrough, empty → `ok([])`, db-error → `unavailable`.
- `e2e/characterization/dashboard-settings.spec.ts` — Phase A first: login →
  open `/dashboard/settings/dashboard` → assert libraries list renders →
  toggle one library's visibility → reload → assert persisted → toggle back.
  Two-pass discovery rule applies.

## Files to Modify
- `app/dashboard/settings/dashboard/page.tsx`
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/dashboard/page.tsx',`

## MUST NOT touch
`lib/domain/core/**`, everything under `lib/domain/settings/` except the new
`dashboard.ts(.test.ts)`, `lib/infra/supabase/**` (reuse only), all other
pages/components, existing e2e specs, `.fable5/`, `.claude/`.
No new dependencies.

## Risks
- Two repositories on one page — keep them separate; do NOT merge into one
  "dashboardRepository" (workspace memberships are a workspace-domain concern
  that later pages reuse).
- snake_case ↔ camelCase mapping lives ONLY in infra.
- The retry/fallback second query call site is easy to miss — both must go
  through the repository or the boundary check will still fail.
- `libraries` JSONB is `unknown` by design at the load boundary — resist
  typing it; the page's merge logic is the tolerant reader.

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] New e2e spec green against OLD page first, then NEW page (pasted)
- [ ] `npm run test:unit` green; output LISTS all three new test files
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Existing e2e suite still green
- [ ] `grep -c "@supabase" app/dashboard/settings/dashboard/page.tsx` → 0
- [ ] Grandfather list = 17
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# Phase A — net first, against the CURRENT page
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/dashboard-settings.spec.ts
# Phase B — after domain+infra+tests
npm run test:unit
npx tsc --noEmit
# Phase C — after the page rewrite
PW_BASE_URL=http://localhost:3000 npx playwright test
grep -c "@supabase" app/dashboard/settings/dashboard/page.tsx   # 0
# Phase D — grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Estimated Difficulty
medium — most files in the batch, but every interface, query, and mapping is
specified; zero open decisions.

## Amendment 1 (2026-07-07) — corrected membership bindings · CTO decision

**Blockage (GPT-5.4, correct stop; no code changes):** the spec's bound
query `from('workspace_members')...eq('user_id', userId)` does not exist in
the page. CTO census error — the select string was grepped but the filter
chains were not read. Actual behavior (verified by full read):

1. PRIMARY: `.eq('member_user_id', user.id).eq('status', 'active')`
2. FALLBACK (only when primary returned ZERO rows AND `user.email` exists):
   `.eq('member_email', user.email.toLowerCase()).eq('status', 'active')` —
   with its OWN error handling (fallback error → warn, keep `[]`; it never
   overwrites on error).
3. The page also consumes `user.user_metadata?.display_name` (personal
   library name) — `getCurrentUser` (id+email) is insufficient.

**Decision 1 — the email fallback is PRESERVED.** It serves members invited
by email whose rows aren't linked to a user id yet; dropping it would hide
their workspaces. Extraction patches change zero behavior — not negotiable.

**Decision 2 — shape: TWO explicit methods; fallback control flow stays in
the page.** Replace the spec's `listForUser(userId)` binding with:

```ts
// lib/domain/workspaces/memberships.ts
export interface WorkspaceMembershipsRepository {
  listActiveByUserId(userId: UserId): Promise<Result<WorkspaceMembership[], DomainError>>;
  listActiveByEmail(emailLowercased: string): Promise<Result<WorkspaceMembership[], DomainError>>;
}
```
Infra: each method wraps ONE query verbatim (same select string as the page,
plus the exact `.eq` chains above; the narrow client interface must model
two chained `.eq` calls). Error → `err(unavailable, { cause })`; success →
`ok(data ?? [])` cast. **`.toLowerCase()` stays at the page call site**
(caller logic today, caller logic after). The page keeps its exact control
flow: primary → warn-on-err/log-on-ok → if empty && email → fallback →
fallback's own warn/replace logic. Console mapping: existing console.warn
lines log `result.error` instead of the raw supabase error (console-only
difference, allowed).

**Decision 3 — extend `CurrentUser` additively (authorized change to
PATCH-007's artifact).** In `lib/infra/supabase/currentUser.ts`:
- `CurrentUser` gains `readonly displayName: string | null;`
- `getCurrentUser` maps it: `displayName: (user.user_metadata as { display_name?: string } | undefined)?.display_name ?? null`
- `getCurrentUserId` remains untouched. Existing consumer (logs page)
  unaffected — the field is additive.
Page mapping: `user.user_metadata?.display_name || username` becomes
`user.displayName || username` (`||` kept — empty-string display names fall
back to username exactly as today).

**Updated tests (replaces the spec's memberships test description):**
`workspaceMembershipsRepository.test.ts` covers BOTH methods × three cases
(rows passthrough, empty → `ok([])`, db-error → `unavailable`) and asserts
each method hits the right column pair (`member_user_id`+`status` /
`member_email`+`status`) via the fake client.

**Strengthened census rule (applies to this resume and all future E
patches):** pre-edit, paste the FULL query call sites —
`grep -n -B2 -A14 "\.from('workspace_members')" <page>` and the same for
`dashboard_settings` — and diff them against these bindings. Any mismatch:
STOP again.

**Resume instructions (GPT-5.4):**
1. Keep the clean worktree; this amendment replaces the memberships binding
   and adds the CurrentUser extension. Everything else in the spec stands
   (dashboard_settings bindings verified correct as written).
2. Run the strengthened census first; paste it.
3. Implement per Decisions 2–3; phase order unchanged (e2e net first).
4. MUST-NOT list: unchanged EXCEPT `lib/infra/supabase/currentUser.ts` is
   now authorized for the exact additive change above.
5. Report "Amendment 1 applied, CTO-authorized" in Decisions made.
