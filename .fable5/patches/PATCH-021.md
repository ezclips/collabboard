# PATCH-021 — Extraction: members page; workspace membership/invitation CRUD behind a raw-passthrough facade

**Status:** draft (awaiting owner approval — second and final patch of batch 020–021)
**Complexity:** medium-high (thirteen raw call-site swaps, behind ten new
facade functions, across a 1,817-line file; the file is large but the
Supabase surface is narrow and localized to six functions — the other
~1,700 lines are modal/table JSX and local state that this patch does not
touch)
**Assigned model:** **GPT-5.5 — REQUIRED, not GPT-5.4.** Ruling: this page's
mutating actions are ALL destructive-or-irreversible-in-e2e-terms — remove a
real member, delete/revoke a real invitation, change a real member's role,
create a real invite link, and send REAL invitation emails via
`/api/invitations/invite-users` — five distinct untestable/mutation-heavy
call paths, more than PATCH-020's five MFA calls. Per PATCH_REFERENCE §5.10
(Pattern J) and the confirmed LESSONS_LEARNED ruling ("count the untestable
call sites, not just 'is this security-sensitive'"), a patch with this many
untestable mutation paths requires the stronger implementer; GPT-5.4 is
acceptable ONLY as an owner-authorized fallback with the reviewer treating
every wrapper diff as suspect.
**Pattern:** E-family composite, using the RAW-PASSTHROUGH exception
established by Patterns I/J (candidate extension of Pattern J to
non-auth table CRUD — enters the catalog at review, not before, per house
convention). Reuses NOTHING from `legacyToken.ts` or `passwordSecurity.ts`
(both are scoped exclusively to their own named pages) — this page needs its
own facade because its session is already correct (cookie-only client via
`useSupabase()`, confirmed live for the e2e account, see Characterization
below) and its writes are on different tables entirely.
**Depends on:** none (independent of PATCH-020; both are batch 020–021).

## Purpose
Move `app/dashboard/settings/members/page.tsx` (1,817 lines) off direct
Supabase. Full-file census (2026-07-09): its ONLY Supabase surface is
THIRTEEN raw touches in six functions — `loadMembers` (getUser,
`resolveCurrentWorkspace(supabase, ...)`, workspace_members select,
workspace_invitations select — 4), `handleUpdateMemberRole`
(workspace_members update — 1), `handleRemoveMember` (workspace_members
delete — 1), `loadWorkspaceCanvases` (getUser fallback,
`resolveCurrentWorkspace(supabase, ...)`, boards select — 3),
`handleCreateInviteLink`/`handleInviteUser` (getSession ×2, for the
Authorization header on two ALREADY-EXTERNAL API fetches — untouched — 2),
`handleUpdateInvitation` (workspace_invitations update — 1),
`revokeInvitation` (workspace_invitations delete — 1) — plus a raw
`@supabase/supabase-js` `User` type import (the actual boundary-lint
trigger; the page's `useSupabase()` hook itself does not violate the
`@supabase/*` import ban). All thirteen touches move behind TEN new
facade functions (three of the ten are each reused across two call sites:
`getCurrentAuthUser`, `getCurrentAuthSession`, `resolveWorkspaceForUser`);
the `User` type import is replaced by a narrow local interface capturing
only the five fields the page actually reads. The ~1,700 lines of modal
state, `RoleDropdown`, canvas-picker UI, and rendering are UNTOUCHED — this
is a pure data-access relocation, not a UI refactor. Grandfather 5 → 4.

## What this patch is NOT
- NOT a behavior change. `resolveCurrentWorkspace` (in `lib/workspace/context.ts`,
  already outside `app/**`/`components/**` and therefore untouched by the
  boundary lint) keeps being called with a raw `SupabaseClient` exactly as
  today — the facade supplies that client, it does not change the function's
  signature, error handling, or the ignorable-error-code logic inside it.
- NOT a domain-layer patch. No commands, no repositories returning `Result`,
  no error-shape translation — see the facade's header comment for the
  deliberate raw-shape ruling (same exception as Patterns I/J: the page's
  own `error.code`/`error.message` checks and toast texts consume the raw
  supabase shape directly).
- NOT a UI or permission-logic change. `canManageMembers`, the owner-row
  disabled state on Edit-role/Remove, and every toast text stay
  byte-identical.
- NOT a change to the two API routes (`/api/invitations/create-link`,
  `/api/invitations/invite-users`) or their Authorization-header
  construction — only the `getSession()` call that feeds the header moves
  into the facade; the header-building logic and the fetch calls stay in
  the page, untouched.

## CTO note — why untestable mutation APIs are executable here
`workspace_members` update/delete, `workspace_invitations` update/delete,
and the two invitation-creating API calls are all §0-class "escalate"
surfaces because a real member could be removed or a real email sent by a
careless spec. That judgment is exercised HERE: every wrapper is bound
verbatim below, the page diff is bound verbatim, and the characterization
spec is READ-ONLY by design (see its section) — it never triggers Create
invite link, Invite user, Edit role, or Remove, and asserts that the two
row-action buttons are DISABLED for the e2e account's own owner row (so
even an accidental click would no-op, not mutate). The implementer makes no
membership/invitation decisions; the reviewer's checklist requires
line-by-line scrutiny of the five untestable wrappers, same discipline as
Pattern J.

## Pre-edit census (paste ALL output; STOP on any mismatch)
Run in **Git Bash** (this is a `bash` block). Shell-explicit equivalents for
the numeric gates are bound inline per PATCH-019 Amendment 1 (two tools,
same bytes — bind both).
```bash
f="app/dashboard/settings/members/page.tsx"
# 1. @supabase surface:
grep -n "@supabase" "$f"
# expected EXACTLY 1 line: L5 `import type { User } from '@supabase/supabase-js';`
# 2. useSupabase hook + client identifier:
grep -n "useSupabase\|const { supabase }" "$f"
# expected EXACTLY 2 lines: L4 (import), L167 (`const { supabase } = useSupabase();`)
grep -c "supabase\." "$f"
# expected: 4 — NOT the full call-site count. This gate only catches the
# four single-line `supabase.auth.*` calls; the seven `.from('table')`
# calls are written as `await supabase\n    .from(...)`, so "supabase"
# and the dot land on DIFFERENT lines and this pattern cannot see them
# (same multi-line-chain grep gotcha as PATCH-017's self-review). Do not
# treat this gate as proof of the full surface — gates 3 below cover the
# `.from()` sites explicitly, one table at a time.
# 3. The thirteen raw Supabase touches (4 auth + 2 resolveCurrentWorkspace
#    + 7 table calls), by table/method:
grep -n "supabase\.auth\." "$f"
# expected EXACTLY 4 lines: L238 getUser, L467 getUser, L531 getSession, L653 getSession
grep -n "\.from('workspace_members')" "$f"
# expected EXACTLY 3 lines: L264 (select), L350 (update), L391 (delete)
grep -n "\.from('workspace_invitations')" "$f"
# expected EXACTLY 3 lines: L304 (select), L749 (update), L825 (delete)
grep -n "\.from('boards')" "$f"
# expected EXACTLY 1 line: L488 (select)
grep -n "resolveCurrentWorkspace(supabase" "$f"
# expected EXACTLY 2 lines: L242, L475
# 4. API fetches (UNTOUCHED — only the getSession feeding their headers moves):
grep -n "fetch('/api" "$f"
# expected EXACTLY 2 lines: L539 (/api/invitations/create-link),
#                           L661 (/api/invitations/invite-users)
# 5. Line count — Git Bash wc -l counts ALL lines incl. the file's 133 blank
#    lines. PowerShell equivalents (PATCH-019 Amendment 1 rule):
#      (Get-Content $f).Count                          -> 1817  ACCEPTED
#      (Get-Content $f | Measure-Object -Line).Lines   -> 1684  (skips blanks) ACCEPTED
#    Any other value: STOP.
wc -l "$f"   # expected: 1817
```
Anything more, less, or different: STOP, report, change nothing.

## Bindings

### 1. New file — `lib/infra/supabase/workspaceMembers.ts` (exact, whole file)
```ts
import { createBrowserSupabaseClient } from './browserClient';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';
import type { WorkspaceContext } from '@/lib/workspace/context';

/**
 * PATCH-021: narrow raw-passthrough wrappers for the members settings
 * page's workspace_members / workspace_invitations / boards CRUD, plus the
 * two auth calls it needs. All calls run on the STANDARD cookie/browser
 * client - the same client the page previously obtained via useSupabase().
 *
 * DELIBERATE house-style exception (same ruling as legacyToken.ts and
 * passwordSecurity.ts): these return RAW supabase shapes, not Result - the
 * page's error handling (error.code checks, error.message toasts) consumes
 * those shapes directly, and a behavior-preserving extraction must not
 * translate them. Do not add consumers beyond the pages the patches name.
 *
 * resolveWorkspaceForUser is a THIN pass-through to the existing
 * lib/workspace/context.ts helper (already outside app/**/components/** and
 * therefore already outside the boundary lint) - it supplies the client,
 * nothing about that helper's own logic changes.
 */

export function getCurrentAuthUser() {
    return createBrowserSupabaseClient().auth.getUser();
}

export function getCurrentAuthSession() {
    return createBrowserSupabaseClient().auth.getSession();
}

export function resolveWorkspaceForUser(
    user: Parameters<typeof resolveCurrentWorkspace>[1],
): Promise<WorkspaceContext | null> {
    return resolveCurrentWorkspace(createBrowserSupabaseClient(), user);
}

export function listWorkspaceMembers(workspaceId: string) {
    return createBrowserSupabaseClient()
        .from('workspace_members')
        .select('id, member_user_id, member_email, role, status, joined_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true });
}

export function updateMemberRole(membershipId: string, workspaceId: string, role: string, updatedAt: string) {
    return createBrowserSupabaseClient()
        .from('workspace_members')
        .update({ role, updated_at: updatedAt })
        .eq('id', membershipId)
        .eq('workspace_id', workspaceId);
}

export function removeWorkspaceMember(membershipId: string, workspaceId: string) {
    return createBrowserSupabaseClient()
        .from('workspace_members')
        .delete()
        .eq('id', membershipId)
        .eq('workspace_id', workspaceId);
}

export function listPendingInvitations(workspaceId: string) {
    return createBrowserSupabaseClient()
        .from('workspace_invitations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('redeemed_at', null)
        .order('created_at', { ascending: false });
}

export function updateInvitation(
    invitationId: string,
    patch: { role: string; email_domain: string | null; canvas_ids: string[] | null },
) {
    return createBrowserSupabaseClient()
        .from('workspace_invitations')
        .update(patch)
        .eq('id', invitationId);
}

export function deleteInvitation(invitationId: string) {
    return createBrowserSupabaseClient()
        .from('workspace_invitations')
        .delete()
        .eq('id', invitationId);
}

export function listWorkspaceCanvasOptions(workspaceId: string) {
    return createBrowserSupabaseClient()
        .from('boards')
        .select('id, title, layout')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
}
```
(`createBrowserSupabaseClient()` wraps the SAME `createClientComponentClient`
singleton `useSupabase()` provided — both ultimately call
`supabaseBrowser()`'s cached instance via `lib/supabase/browser.ts`; identical
client, no behavior change. `resolveWorkspaceForUser`'s parameter type is
derived with `Parameters<...>` specifically so it can NEVER drift from
`resolveCurrentWorkspace`'s real signature — do not hand-write the user
shape.)

### 2. Page rewrite — `app/dashboard/settings/members/page.tsx`

- REPLACE line 4 (`import { useSupabase } from '@/lib/supabase';`) and
  DELETE line 5 (`import type { User } from '@supabase/supabase-js';`) with:
  ```ts
  import {
      deleteInvitation,
      getCurrentAuthSession,
      getCurrentAuthUser,
      listPendingInvitations,
      listWorkspaceCanvasOptions,
      listWorkspaceMembers,
      removeWorkspaceMember,
      resolveWorkspaceForUser,
      updateInvitation,
      updateMemberRole,
  } from '@/lib/infra/supabase/workspaceMembers';
  ```
- ADD immediately after the `WorkspaceCanvasOption` interface (after old line
  164), a narrow replacement for the deleted `User` type — captures exactly
  the five fields this page reads (verified by full-file grep of every
  `user.`/`currentUser.` field access):
  ```ts
  interface MembersPageUser {
      id: string;
      email: string | null;
      created_at: string;
      user_metadata?: {
          display_name?: string;
          avatar_url?: string;
      };
  }
  ```
  Change `const [currentUser, setCurrentUser] = useState<User | null>(null);`
  → `const [currentUser, setCurrentUser] = useState<MembersPageUser | null>(null);`.
  Every existing `currentUser.*`/`user.*` field access (`.id`, `.email`,
  `.user_metadata?.display_name`, `.user_metadata?.avatar_url`,
  `.created_at`) stays byte-identical — `MembersPageUser` is shape-compatible
  with the real Supabase `User` at every field this page touches, so no
  cast is expected. **If tsc forces one anyway, STOP and report before
  committing** (per the disclosure rule — do not silently add a cast).
- DELETE line 167 (`const { supabase } = useSupabase();`).
- `loadMembers`: `const { data: { user } } = await supabase.auth.getUser();`
  → `const { data: { user } } = await getCurrentAuthUser();`. Two lines
  later, `const resolvedWorkspace = await resolveCurrentWorkspace(supabase, user);`
  → `const resolvedWorkspace = await resolveWorkspaceForUser(user);`. The
  `workspace_members` select block:
  ```
  const { data: workspaceMembers, error } = await supabase
      .from('workspace_members')
      .select('id, member_user_id, member_email, role, status, joined_at, created_at')
      .eq('workspace_id', resolvedWorkspace.workspaceId)
      .order('created_at', { ascending: true });
  ```
  → `const { data: workspaceMembers, error } = await listWorkspaceMembers(resolvedWorkspace.workspaceId);`
  The `workspace_invitations` select block:
  ```
  const { data: invitations } = await supabase
      .from('workspace_invitations')
      .select('*')
      .eq('workspace_id', resolvedWorkspace.workspaceId)
      .is('redeemed_at', null)
      .order('created_at', { ascending: false });
  ```
  → `const { data: invitations } = await listPendingInvitations(resolvedWorkspace.workspaceId);`
- `handleUpdateMemberRole`:
  ```
  const { error } = await supabase
      .from('workspace_members')
      .update({ role: editingRole, updated_at: new Date().toISOString() })
      .eq('id', editingMember.membership_id)
      .eq('workspace_id', workspaceContext.workspaceId);
  ```
  → `const { error } = await updateMemberRole(editingMember.membership_id, workspaceContext.workspaceId, editingRole, new Date().toISOString());`
- `handleRemoveMember`:
  ```
  const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('id', member.membership_id)
      .eq('workspace_id', workspaceContext.workspaceId);
  ```
  → `const { error } = await removeWorkspaceMember(member.membership_id, workspaceContext.workspaceId);`
- `loadWorkspaceCanvases`: `const { data: authData } = await supabase.auth.getUser();`
  → `const { data: authData } = await getCurrentAuthUser();`. The fallback
  `resolveCurrentWorkspace(supabase, user)` → `resolveWorkspaceForUser(user)`.
  The `boards` select block:
  ```
  const { data, error } = await supabase
      .from('boards')
      .select('id, title, layout')
      .eq('workspace_id', wsId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
  ```
  → `const { data, error } = await listWorkspaceCanvasOptions(wsId);`
- `handleCreateInviteLink`: `const { data: { session } } = await supabase.auth.getSession();`
  → `const { data: { session } } = await getCurrentAuthSession();`. Nothing
  else in this function changes — the header-building `if (session?.access_token)`
  block and the `fetch('/api/invitations/create-link', ...)` call stay
  byte-identical.
- `handleInviteUser`: `const { data: { session } } = await supabase.auth.getSession();`
  → `const { data: { session } } = await getCurrentAuthSession();`. Nothing
  else in this function changes — same header/fetch pattern, byte-identical.
- `handleUpdateInvitation`:
  ```
  const { error } = await supabase
      .from('workspace_invitations')
      .update({
          role: updateLinkRole,
          email_domain: isLinkInvitation && updateLinkRestrictDomain ? updateLinkEmailDomain : null,
          canvas_ids: nextCanvasIds,
      })
      .eq('id', updatingInvitationId);
  ```
  → `const { error } = await updateInvitation(updatingInvitationId, { role: updateLinkRole, email_domain: isLinkInvitation && updateLinkRestrictDomain ? updateLinkEmailDomain : null, canvas_ids: nextCanvasIds });`
- `revokeInvitation`:
  ```
  const { error } = await supabase
      .from('workspace_invitations')
      .delete()
      .eq('id', invitation.id);
  ```
  → `const { error } = await deleteInvitation(invitation.id);`
- EVERYTHING else byte-identical: `RoleDropdown`, both interfaces
  (`Member`, `Invitation`, `WorkspaceMemberRow`, `WorkspaceInvitationRow`),
  ALL modal state and handlers not listed above (`handleCreateInviteLink`'s
  and `handleInviteUser`'s fetch/header/result-parsing logic,
  `copyGeneratedLink`, `copyInvitationPassword`, `toggleInvitationPassword`,
  `getMaskedPassword`, `openUpdateInvitationModal`, `resendInvitation`,
  `copyInvitationLink`, `getInitials`, `getRolePillClassName`,
  `getCanvasTypeLabel`, `groupedCanvasOptions`, `toggleCanvasSelection`,
  `closeInviteLinkModal`, `closeInviteUserModal`), and ALL rendering (every
  modal, every table, every button, every toast text).

## Files to Create
- `lib/infra/supabase/workspaceMembers.ts` (§1)
- `e2e/characterization/members-page.spec.ts` (below)

## Files to Modify
- `app/dashboard/settings/members/page.tsx` (§2)
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/members/page.tsx',`

## MUST NOT touch
`app/api/**` (both invitation routes hard-forbidden);
`lib/workspace/context.ts` (its internal logic, including
`ensureWorkspaceBootstrap` and the ignorable-error-code handling, is
UNCHANGED — the facade only supplies its client argument);
`lib/infra/supabase/storage.ts`/`browserClient.ts`/`currentUser.ts`/
`authState.ts`/`serverClient.ts`/`legacyToken.ts`/`passwordSecurity.ts`
(none of PATCH-020's or earlier patches' consumers-list gains an entry);
`lib/domain/**`; all other pages/components/specs; `.fable5/`; `.claude/`.
No new dependencies.

## Unit tests
NONE new — every wrapper binds the real browser client (same ruling as
PATCH-018/019/020 helpers; not constructible in the node test env).
`npm run test:unit` must stay green at **76 tests / 18 files** (state the
unchanged count; if it differs, STOP and report — do not reconcile).

## Characterization — `e2e/characterization/members-page.spec.ts`
**Every assertion below was CTO-probed against the OLD page with the real
e2e storage state on 2026-07-09.** Observed: the e2e account is its
workspace's OWNER with zero other members and zero pending invitations —
`useSupabase()`'s cookie session satisfies `getUser` directly (this page,
like integrations, WORKS for the e2e account — no scavenger, no
cookie-only wall). The heading `Members` collides in a bare
`getByRole('heading', {name:'Members'})` query (there is a second, unrelated
"Members" heading elsewhere on the settings shell) — bind `level: 1`
to disambiguate, not `.first()` (level is the real distinguishing property,
order is not guaranteed to be stable). **CSS-transform trap (PATCH-020
Amendment 3 lesson): the "You" badge on the owner's own row is visually
`YOU` via a Tailwind `uppercase` class — the raw DOM text is `You`
(capital Y only). Bind `getByText('You', { exact: true })`, never `YOU`,
and never probe it with `.innerText()`.** The owner's own row has its
Edit-role and Remove-member buttons present in the DOM but DISABLED
(`title="Edit role"` / `title="Remove member"` are their accessible names —
they are icon-only buttons with no visible text).

**NEVER click:** `Create invite link`, `Invite user` (sends REAL email via
the API route), the `Edit role` button (even though disabled for the
owner's own row — do not exercise it), the `Remove member` button (same),
any invitation-row action (copy link/password, the update-invitation
pencil, revoke). This page's disabled-buttons-for-self-row property means
even an errant click on Edit-role/Remove would no-op — the spec still must
never attempt it, in case the account's role or membership state ever
changes.

```ts
import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('members page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the members list and pending-invitations empty state without mutating anything', async ({ page }) => {
    await page.goto('/dashboard/settings/members', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pending invitations' })).toBeVisible();
    // This encodes the test account's current solo-owner, zero-invitations state; rebind if the workspace ever gains a second member or a pending invitation.
    await expect(page.getByText("There aren't any pending invitations currently.")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('table tbody tr')).toHaveCount(0);

    await expect(page.getByText('e2e.causal793@silomails.com')).toBeVisible();
    // CSS uppercase trap (PATCH-020 Amendment 3): the badge paints as "YOU" but its raw text is "You" — bind the raw text, never the painted casing.
    await expect(page.getByText('You', { exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Edit role' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove member' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Create invite link' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite user' })).toBeVisible();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });
});
```
ONE test, exactly as bound — the page's every OTHER interaction is a real
mutation or a real email send, so there is nothing further safe to
characterize without an authorized behavior-change patch (compare to
PATCH-023's authorized-mutation program; this patch adds none).

## Verification sequence (paste real output for every step)
Operational rules bound from PATCH-018/019/020 (PATCH_REFERENCE §6):
1. **Dev-server banner rule (PATCH-020 incident):** read the Next.js
   startup banner. If it says it fell back to a different port, STOP and
   reconcile with the owner before running anything; `PW_BASE_URL` must
   match the banner port.
2. ONE client at a time against the dev server — no probes, curls, or
   second suites while Playwright runs.
3. Warm the canvas route before the full suite (board-lifecycle
   participates): run
   `PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/board-lifecycle.spec.ts`
   once and let it pass BEFORE the timed full run.
4. Board-creation failures during e2e are diagnosed via DB FIRST: count the
   e2e workspace's ACTIVE boards (`deleted_at IS NULL`) against
   `FREE_PLAN_BOARD_LIMIT = 3` and report to the owner for cleanup — quota
   pollution is an environment fault, never a reason to edit code.
5. Numeric gates are shell-bound (PATCH-019 Amendment 1): every expected
   number below states its producing command; a mismatch from a DIFFERENT
   command is not a gate result — run the bound command.
6. Probe with `getByText`/raw text content, never `.innerText()`, whenever
   the bound assertion itself is `getByText`/`toHaveText` — CSS
   `text-transform` (`uppercase`, `lowercase`, `capitalize`) changes what
   `.innerText()` shows without changing the underlying DOM text
   (PATCH-020 Amendment 3; this spec's own "You"/"YOU" badge is a second
   instance of exactly this trap, already corrected above).
7. Report EVERY off-spec line or NUMBER (test counts included) — "no
   runtime effect" is the reviewer's conclusion to draw, never grounds to
   skip reporting (PATCH-018/019/020 disclosure rule).

```bash
# Phase A — OLD page (dev server running, banner port verified = 3000):
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/members-page.spec.ts
# expected: 1 passed — paste output

# Phase B — implement §1, §2 (NOT the boundaries line yet), then:
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/members-page.spec.ts
# expected: 1 passed — paste output
npm run test:unit          # unchanged: 76 tests / 18 files — state it
npx tsc --noEmit           # 0 errors, zero new casts anywhere
# post-edit greps (Git Bash), page:
f="app/dashboard/settings/members/page.tsx"
grep -c "@supabase" "$f"                # 0  (exit 1 expected)
grep -c "useSupabase" "$f"               # 0  (exit 1 expected)
grep -c "supabase\." "$f"                # 0  (exit 1 expected; no import-path collision in this file)
grep -c "workspaceMembers" "$f"           # 1  (the import)
grep -c "MembersPageUser" "$f"            # 2  (type def + useState annotation)
grep -c "resolveWorkspaceForUser" "$f"    # 3  (1 import + 2 call sites, replacing the two resolveCurrentWorkspace(supabase, ...) calls)
grep -n "fetch('/api" "$f"                # still EXACTLY 2 lines, same two routes
# facade:
grep -c "createBrowserSupabaseClient" lib/infra/supabase/workspaceMembers.ts   # 11 (1 import + 10 direct calls, one per exported function below)
grep -c "export function" lib/infra/supabase/workspaceMembers.ts               # 10
# workspace/context.ts must be byte-untouched:
git diff --ignore-space-at-eol -- lib/workspace/context.ts
# expected: NO output

# Phase C — boundaries line removed, then:
npm run check:boundaries   # green; grandfather list = 4 entries (count them)
# Full suite — warm-up rule 3 first, then:
PW_BASE_URL=http://localhost:3000 npx playwright test
# expected total: 27 tests (26 pre-patch per `npx playwright test --list`
# + 1 new = 27 in 18 files). If the count differs, REPORT it — do not
# reconcile silently.

# FINAL (owner stops the dev server first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"
# must print 0 — this gate and no other port check (Windows/WSL disagree)
npm run verify             # typecheck + production build + boundaries
git status --porcelain     # clean after the commit
```
Local e2e runs use the config's 2 workers — never override with `--workers`.

## Deviation rule (binding)
Report EVERY line that differs from the bindings above — including casts
tsc forces, import-order changes a formatter makes, and any gate number
that comes out different (test counts included). Expected deviations:
**NONE.**

## Commit
ONE atomic commit (implementation + spec + grandfather line).
  Commit message:
  refactor(members): extract workspace membership/invitation CRUD behind workspaceMembers facade

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches ALL blocks (shell-bound numbers)
- [ ] New e2e spec green against OLD page first, then NEW (both pasted);
      it never clicks Create invite link/Invite user/Edit role/Remove
      member/any invitation-row action; the one probed test only
- [ ] `npm run test:unit` green at 76/18 — unchanged, stated
- [ ] `npx tsc --noEmit` 0 errors, zero new casts anywhere (MembersPageUser
      must be shape-compatible with every field the page reads)
- [ ] `npm run check:boundaries` green with the entry removed (list = 4)
- [ ] Full e2e suite green, 27 tests (26 + 1 arithmetic stated), canvas
      route warmed first, banner port verified
- [ ] Post-edit greps exact per the bound commands
- [ ] `lib/workspace/context.ts` diff is EMPTY (byte-untouched)
- [ ] `workspaceMembers.ts` byte-equal to §1
- [ ] Grandfather list = 4 (count stated)
- [ ] Single atomic commit; hash reported; every off-spec line disclosed
      (expected: none)

## Reviewer checklist (CTO or successor; CTO_PLAYBOOK §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] Diff-vs-Bindings with `--ignore-space-at-eol`; page changes are ONLY:
      the import-block swap, the `User`→`MembersPageUser` type
      substitution, the deleted `useSupabase()` line, thirteen raw
      call-site swaps behind the ten new facade functions
- [ ] **All five real-mutation wrappers get line-by-line scrutiny**
      (`updateMemberRole`, `removeWorkspaceMember`, `updateInvitation`,
      `deleteInvitation`, plus `getCurrentAuthSession`'s two consumers
      feeding the invite-creation/invite-email API calls) — each argument
      must match the ORIGINAL query's exact filter chain (both `.eq()`
      calls on the two workspace-scoped member operations; the exact
      `.update()` payload shape on invitations)
- [ ] `resolveWorkspaceForUser`'s parameter type is `Parameters<typeof
      resolveCurrentWorkspace>[1]`, not a hand-written duplicate of the
      user shape — confirms it can never silently drift
- [ ] `lib/workspace/context.ts` diff is EMPTY — this is the review's
      highest-value single check, since a change there would alter
      workspace resolution for EVERY page that calls it, not just this one
- [ ] `MembersPageUser` covers exactly the five fields grepped in
      authoring (`id`, `email`, `user_metadata.display_name`,
      `user_metadata.avatar_url`, `created_at`) — no more, no less
- [ ] e2e spec: `level: 1` disambiguation on the Members heading (not
      `.first()`); "You" bound lowercase-Y-capital, never "YOU"; zero
      clicks on any of the five forbidden controls
- [ ] At review closeout: §7 row for 021 (+ pattern catalog entry if the
      raw-passthrough-CRUD extension of Pattern J is accepted); **batch
      020–021 closeout** in CURRENT_TASK; health ledger per §12; rule on
      whether GPT-5.5 vs GPT-5.4 actually implemented it

## Expected grandfather reduction
5 → 4 (`app/dashboard/settings/members/page.tsx` removed; count re-verified
at review). Remaining 4: PostCardContent, FreeformPadletCards, CanvasClient,
collabboard canvas page — all batch-5/canvas-program territory (Phase 2
entry, NOT mechanical; per CURRENT_TASK's standing plan, PATCH-022 is a
CTO decision brief, not a GPT-5.4/5.5 delegation).

## Handoff (owner: paste this to GPT-5.5)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 021,
`{{TITLE}}` = members workspace membership/invitation CRUD extraction. Add:
"Read `.fable5/docs/PATCH_REFERENCE.md` §0, §5.10 (Pattern J), and §6
first. Five of the ten facade functions wrap real mutations or feed real
side effects (`updateMemberRole`, `removeWorkspaceMember`,
`updateInvitation`, `deleteInvitation`, plus `getCurrentAuthSession`
feeding the real invite-creation/invite-email API calls) — no test can
safely exercise them, so your diff fidelity is the only net; copy the
bindings exactly, especially every `.eq()` filter chain. The file is 1,817
lines but you are touching only thirteen raw call sites (condensed into ten
new facade functions) plus one type — do not reformat, do not touch
`RoleDropdown`, any modal, or any rendering. `lib/workspace/context.ts`
must come out of `git diff` with ZERO changes — if your editor's
auto-import or auto-format touches it, revert that file specifically before
committing. The e2e spec must NEVER click Create invite link, Invite user,
Edit role, Remove member, or any invitation-row action — the only test
asserts the read-only solo-owner state and that Edit-role/Remove are
DISABLED for the owner's own row. Read the dev-server startup banner: if
Next says it fell back to a different port, stop and reconcile. Report
every off-spec line and every off-spec NUMBER (test counts included); zero
deviations are expected. Warm the canvas route before the full suite; one
client at a time against the dev server; board-creation failures are
diagnosed via DB quota first; the stopped-server gate is the PowerShell
listener count. E2E credentials are in `.env.local` — never print them.
Final `npm run verify` only after the owner stops the server."

## Estimated Difficulty
medium-high — the file is large and the diff touches thirteen scattered
call sites across six functions, but each swap is mechanical; the real
risk is argument-shape fidelity on the five untestable mutation wrappers
and
leaving `lib/workspace/context.ts` completely untouched despite it being
the most tempting file to "helpfully" refactor alongside this one.
