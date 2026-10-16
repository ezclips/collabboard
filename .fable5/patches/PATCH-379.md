# PATCH-379 — Guest lockdown: own posts only, no section edits, post rate limit, no AI/upload tools

**Status:** done

## Goal
A guest (anonymous user, `public.is_guest()`) on a Padlet-style board can create posts and
comment/react, but can never change or delete anyone else's work, cannot restructure the
board, cannot flood it, and does not see tools they are not allowed to use.

## Reason
Owner (2026-10-16): "make sure the guest don't have access to upload images/pdf and AI in the
main toolbar unless the admin gives permission … Board AI filtered so the guest can't abuse
it … comments … do we have the guest locked away so he can't cause any mischief, even
hacking?" PM audit (code + migrations, 2026-10-16):
- LOCKED already (PATCH-358+): every AI route refuses guests (`GUEST_AI_REFUSAL` in
  `lib/server/billing/aiCredits.ts`, used by the chat route and the shared
  `boardNotesAiRun` pipeline for notes-actions / notes-to-cards / board-setup); uploads
  refused in routes (`GUEST_UPLOAD_REFUSAL`) and by restrictive `storage.objects` policies;
  middleware keeps guests on their board; a restrictive read guard returns 0 rows for
  every non-board table; post HTML is DOMPurify-sanitized; AI SVG is built escaped.
- GAP 1 (critical): `padlets`, `board_sections`, `canvas_lines` are on the guest WRITE
  allow-list (`20261014120000_guest_write_guard.sql`) and their permissive policies only
  require editor rights — a guest with an edit link can UPDATE/DELETE ANY post and section.
- GAP 2: the toolbar shows guests the AI and upload/media tools (only Facilitate checks
  `isGuest`), which then fail server-side.
- GAP 3: nothing limits how many posts a guest inserts.

## Design
### 1. Migration — `supabase/migrations/20261016120000_guest_lockdown.sql` (do NOT run)
Guarded/re-runnable, BEGIN/COMMIT, self-check at the end; service role (no `auth.uid()`)
and non-guests pass unchanged everywhere. Authorship = `metadata.createdBy` (stamped by the
PATCH-364 trigger; a guest cannot forge it).
- `padlets` BEFORE UPDATE trigger `padlets_guard_guest_edits`: if `is_guest()` and
  `OLD.metadata->>'createdBy'` IS DISTINCT FROM `auth.uid()::text`: allow ONLY changes to
  `metadata.comments`, `metadata.detachedComments`, `metadata.reactions` (plus `updated_at`);
  any other column or metadata key differing → RAISE 'Guests can only change their own
  posts' (42501). Within those keys, entries authored by someone else must be unchanged
  (a guest may add/edit/remove only entries whose author id is theirs) — find the author
  field each entry carries; if an entry type has NO author id, report it and treat the
  whole key as append-only for guests (old entries must stay byte-identical, in order).
  Comments switched off on the board (the Canvas settings "Comments" flag — find its
  column) → comment keys are frozen for guests too.
- `padlets` BEFORE DELETE trigger: guest deleting a post not created by them → RAISE.
- `board_sections`: guests may not INSERT/UPDATE/DELETE (restrictive policies with
  `not is_guest()`), so a guest cannot rename, reorder, add or remove columns/sections.
- `canvas_lines`: guests may INSERT; UPDATE/DELETE only rows they created (find the
  creator column; if none exists, guests may not UPDATE/DELETE lines — report which).
- Rate limit: BEFORE INSERT on `padlets` for guests: more than 30 posts by this guest on
  this board in the last 10 minutes → RAISE 'You are posting too fast. Please wait a moment.'
  (counts `metadata->>'createdBy' = auth.uid()::text`; an index if needed).
- Kanban tables: out of scope (note it; own patch later).
### 2. Client
- `canvasToolbarRegistry.tsx`: for guests hide the AI create tool(s) and every upload /
  media / import tool (image, file/PDF, Drive/OneDrive import, …); keep note/text/link/
  draw/comment tools that a guest may use. Report the final guest tool list.
- Post menus/editors: a guest sees Edit/Delete/Move only on their own posts (one pure helper
  `canGuestModifyPost(post, user)` in `lib/domain/auth/guest.ts` + test, used wherever the
  layouts decide to show those controls); comment/react stays available.
- A trigger refusal surfaces as one friendly toast (the existing write-error path), not a
  silent revert.

## Files
Create: the migration. Modify: `canvasToolbarRegistry.tsx`, `lib/domain/auth/guest.ts`
(+test), and the post-control call sites you find (report them). Tests of the components you
change may be edited without asking; ask before touching anything else. No SQL execution,
no git, no build.

## Commit
  fix(security): guests can only change their own posts; no section edits, rate limit

## Acceptance Criteria (PM, live, after the owner applies the SQL)
Anonymous guest on a throwaway Columns board via an edit link: own post create/edit/delete
works; editing or deleting the OWNER's post is refused (direct REST too); commenting and
reacting on the owner's post works; altering the owner's comment is refused; renaming /
adding / deleting a column is refused; the 31st post within 10 min is refused with the
message; the toolbar shows no AI/upload tools and no Edit/Delete on others' posts. The
owner and a registered editor are unaffected. tsc clean; per-test gate unchanged.

## Required Tests
`canGuestModifyPost`; toolbar guest tool list; post controls hidden for guests on others'
posts; the SQL rules described precisely in comments (no test can run SQL).

## Estimated Difficulty
hard
