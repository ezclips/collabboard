# PATCH-367 — Approve guest posts before others see them

**Status:** approved

## Goal
The board owner can switch on "Approve guest posts first". A new post from a guest is
then visible only to that guest and the owner until the owner approves it; declining
deletes it.

## Reason
Guest safety controls, third of four (365 links + QR, 366 freeze, **367 approval**,
368 hide names). Padlet's moderation ("which posts require approval") is the standard
answer to "a stranger with the link posts something rude on the projector".

## Expected Outcome
- **Switch.** In Share canvas → Guest link tab, at the top, the owner sees a switch
  **Approve guest posts first** with the hint "New guest posts stay hidden from
  everyone else until you approve them." Default off. Non-owners don't see it.
- **Guest posts while on.** A guest adds a note → it appears for the guest with a
  dashed outline and the label "Waiting for approval". Other guests and editors do not
  see it at all (not in the DOM, not via the REST API).
- **Owner.** Sees the pending note with the same dashed outline, the label and two
  buttons: **Approve** and **Decline** (Decline asks inline, then deletes the post).
  A small owner-only pill near the top shows "N guest posts waiting" while N > 0.
- **Approve** → the note becomes a normal note and appears **live** on every open tab
  (no reload). Decline → it disappears for the guest live.
- Registered users, the owner and posts made while the switch is off are unaffected.
  Turning the switch off does NOT auto-approve existing pending posts (they stay
  pending until approved or declined) — say so in the hint under the switch when N > 0.

## Files to Create
- `supabase/migrations/20261014200000_guest_post_approval.sql` — ONE transaction:
  1. `ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS guest_posts_need_approval
     boolean NOT NULL DEFAULT false;` + comment.
  2. `public.can_review_board_posts(b uuid) RETURNS boolean` (plpgsql, STABLE,
     SECURITY DEFINER, `SET search_path = public`): owner (`boards.user_id =
     auth.uid()`) OR `get_board_permission(b, auth.uid())::text = 'admin'`. Revoke from
     PUBLIC/anon, grant to authenticated, service_role.
  3. Trigger function `public.guard_padlet_approval()` + trigger
     `padlets_guard_approval` BEFORE INSERT OR UPDATE OF metadata ON padlets:
     - INSERT: strip any client `pendingApproval`; then if `auth.uid()` is not null,
       `public.is_guest()`, and the board (`coalesce(NEW.board_id, NEW.canvas_id)`)
       has `guest_posts_need_approval = true` → add `"pendingApproval": true`.
     - UPDATE: if the caller can review the board (`can_review_board_posts`) → keep
       NEW as sent (removing the key = approve). Otherwise force the key back to OLD's
       state (present with OLD's value, or absent) — nobody else can approve, and
       nobody can mark someone's post pending.
     - Service role (no `auth.uid()`) passes unchanged.
     Revoke EXECUTE from PUBLIC, anon, authenticated (trigger-only).
  4. Restrictive SELECT policy `padlets_pending_hidden` ON padlets TO authenticated
     USING: `(metadata->>'pendingApproval') IS NULL
       OR metadata->>'createdBy' = (select auth.uid())::text
       OR public.can_review_board_posts(coalesce(board_id, canvas_id))`.
     The first term short-circuits for normal posts (no function call).
  5. Trigger `boards_guard_guest_approval` BEFORE UPDATE OF guest_posts_need_approval
     ON boards: only the owner/admin (same rule as 366's frozen_at guard; service role
     passes) may change it, else `RAISE … ERRCODE '42501'`.
  6. Self-check DO block: column, functions, both triggers, the policy exist.
  Header comment: why; guests only (anonymous users), registered collaborators are not
  moderated; service-role readers (AI routes) are not filtered by RLS; Realtime
  postgres_changes applies the SELECT policy per subscriber, so pending INSERTs only
  reach the author and reviewers, and the approving UPDATE reaches everyone.
- `lib/domain/canvas/postApproval.ts` (+ test) — pure: `isPendingApproval(metadata)`,
  `approvedMetadata(metadata)` (a NEW object without `pendingApproval`; never mutate),
  `pendingCount(padlets)`, label constants (`PENDING_LABEL = 'Waiting for approval'`).
- `components/collabboard/canvas/ui/GuestApprovalToggle.tsx` (+ test) — self-sufficient
  like `BoardFreezeToggle` (takes `boardId`; reads `user_id, guest_posts_need_approval`
  and the current user; owner-only; writes the column; error toast on 42501).
  `role="switch"`, `aria-checked`, `data-guest-approval-toggle`.
- `components/collabboard/canvas/ui/PendingPostsPill.tsx` (+ test) — owner-only pill
  "N guest post(s) waiting", hidden at 0; `data-pending-pill`. If CanvasClient already
  has a "focus/scroll to padlet" function, clicking the pill focuses the oldest pending
  post; otherwise the pill is informational (report which).

## Files to Modify
- `components/collabboard/canvas/hooks/useCanvasData.ts` — `handleRealtimePadletChange`:
  an `UPDATE` for an id not in state must be ADDED (it is a post that just became
  visible to this viewer — an approval). Keep every other branch as is. Test it.
- The Freeform post card (`components/collabboard/canvas/ui/FreeformPadletCards.tsx`,
  the same generic-post strip PATCH-364 touched): when `isPendingApproval(metadata)`,
  dashed outline (keep size/layout), the label, and — for the owner only — Approve and
  Decline (inline confirm) buttons. Hooks: `data-pending-approval`,
  `data-approve-post`, `data-decline-post`, `data-decline-post-confirm`.
  Approve writes `approvedMetadata(metadata)` through the existing post-update path
  (whatever FreeformPadletCards / CanvasClient already uses for metadata updates);
  Decline uses the existing delete path. Report which functions you used. Owner =
  the same `isBoardOwner(...)` CanvasClient already computes — pass it down the way
  other per-board flags reach this component (report how).
- `components/collabboard/canvas/ui/CanvasGuestLinksTab.tsx` — render
  `<GuestApprovalToggle boardId={canvasId} />` at the top of the tab (owner sees it;
  the tab already shows the owner-only message to others).
- `app/dashboard/canvas/[id]/CanvasClient.tsx` — mount `PendingPostsPill` in the
  main return (Freeform) with `pendingCount(padlets)` and owner flag. Minimal lines;
  report them.
- `vitest.config.ts` only if a new test path is not matched.

## Files that MUST NOT be touched
`.claude/settings.json`, `lib/server/ai/providers/anthropic.test.ts`, earlier
migrations. No SQL apply, no git, no production build.

## Architecture Notes
- The database decides visibility (RLS) and who may approve (trigger). The UI only
  draws what the API returns plus the owner's buttons.
- Out of scope (state in the report): Kanban cards by guests; non-Freeform layouts get
  the dashed outline only if they share the same card component — report what you
  found, do not build new UI for them.
- `isPendingApproval` reads `metadata.pendingApproval === true` only.

## Potential Risks
- The realtime UPDATE-for-unknown-id branch must not resurrect a post the viewer just
  deleted locally (the existing `locallyModifiedPadletsRef` skip covers own edits;
  check the delete path marks it too, report).
- `useCanvasData` / `FreeformPadletCards` / `CanvasClient` are large: touch the
  minimum.

## Commit
  Commit message:
  feat(sharing): approve guest posts before others see them

## Rollback Plan
Drop the policy, both triggers, the functions; leave the column. Pending posts become
visible to all (their `pendingApproval` key is then cosmetic); revert the app commit.

## Acceptance Criteria (PM, live, after the owner applies)
Throwaway Freeform board, switch on, guest A and guest B (edit link), owner:
1. A's note: A sees it labelled; B does not see it (DOM and REST); owner sees it with
   Approve/Decline and the pill says 1.
2. A tries to PATCH its own note's metadata without `pendingApproval` → still pending.
3. Owner approves → B sees the note live without reload; pill gone.
4. A second note → owner declines → gone for A live.
5. Switch off → a new guest note is visible to everyone at once.
6. A guest cannot flip `guest_posts_need_approval` (refused).
7. `npx tsc --noEmit` clean; affected tests pass.

## Required Tests
Domain helpers (immutability of `approvedMetadata`), realtime UPDATE-unknown-id adds,
toggle (owner-only, writes, 42501 toast), pill (count, hidden at 0), post card
(pending label for author, buttons only for owner, decline needs confirm), migration
source test (policy restrictive with the short-circuit first term, both triggers, guest
+ flag condition on insert, reviewer-only removal on update, self-check).

## Estimated Difficulty
medium-hard
