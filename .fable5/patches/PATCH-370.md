# PATCH-370 — Guest features on Wall, Columns, Grid, Timeline and Map

**Status:** approved

## Goal
The guest features built for Freeform (PATCH-364 guest colour, 367 approve guest posts,
368 hidden names in comments) also work on the other Padlet-style layouts: Wall,
Columns, Grid, Timeline and Map. Kanban, Gantt, Scheduler and Drawing are out of scope.

## Reason
Owner (2026-10-15): "add like padlet.com to the other padlet-like canvases in my app,
not Kanban, Scheduler or Gantt". PM audit:
- Board-wide pieces already work everywhere (guest links/QR, freeze + banner, presence,
  share window); the DB-side freeze and pending-post hiding are layout-independent.
- **Gap 1:** on non-Freeform layouts a pending guest post is hidden from others
  correctly, but the owner has **no Approve/Decline** and no pending look, and the
  pill cannot jump to it.
- **Gap 2:** the guest-colour strip is Freeform-only.
- **Gap 3:** comment author names are built inline at ~20 sites with different fallbacks
  (`full_name || email-prefix || 'User'`, `email-prefix || 'You'`, `… || 'Anonymous'`).
  A guest has no email, so a guest's comment is stored as **"You"/"User"/"Anonymous"**
  (everyone then reads "You"), and Hide guest names is ignored outside Freeform cards.
All non-Freeform layouts render a post's body with the shared
`components/collabboard/PostCardContent.tsx` (Wall via WallCanvas/RowColumnContainerCard,
Columns, Grid via GridLayoutRenderer, Timeline via ChronoTimelineCanvas, Map via
PostPopup), so most of this lands in one place.

## Design
### A. One comment-author name (fixes Gap 3 and a real bug)
- `lib/domain/presence/guestAlias.ts`: add
  `commentAuthorName(user, { hideGuestNames })` — guest (`is_anonymous`): alias when
  hidden, else `user_metadata.display_name || 'Guest'`; registered:
  `user_metadata.full_name || user_metadata.name || email prefix || 'Member'`. Tests.
- `CanvasClient.tsx`: compute it ONCE (`const commentAuthor = useMemo(...)`) and pass it
  to every `currentUserName=` prop in the file (9 sites), and to `CanvasModals` as a new
  prop used by its ~11 `currentUserName=` sites. Also use it for FreeformPadletCards'
  `commentAuthorName` (replace PATCH-368's local helper with the shared function).
  Never store the literal "You".
- Out of scope: comment writes in components that read the user themselves rather than
  a `currentUserName` prop — list them in the report.

### B. Pending approval on every Padlet-style layout (Gap 1)
- Extract PATCH-367's pending bar from FreeformPadletCards into
  `components/collabboard/canvas/ui/PendingApprovalBar.tsx` (+ test): props
  `{ canApprove, onApprove, onDecline }`, the inline Decline confirm, the same
  `data-pending-approval`, `data-approve-post`, `data-decline-post`,
  `data-decline-post-confirm` hooks. FreeformPadletCards uses it (no behaviour change).
- `PostCardContent.tsx`: new optional props `canApproveGuestPosts`,
  `onApproveGuestPost(id, approvedMeta)`, `onDeclineGuestPost(id)`. When
  `isPendingApproval(padlet.metadata)` AND the approve callbacks are provided, render
  `PendingApprovalBar` at the top of the content and a dashed amber outline on the
  content root. FreeformPadletCards does NOT pass them (it has its own bar) — so no
  double bar on Freeform.
- `CanvasClient.tsx`: pass `canApproveGuestPosts={isBoardOwner(...)}`,
  `onApproveGuestPost={approveGuestPostNow}` and `onDeclineGuestPost={deletePadletById}`
  down the existing prop paths of WallCanvas, ColumnsLayout, GridLayoutRenderer,
  ChronoTimelineCanvas and the Map PostPopup — the minimal hop through each to
  PostCardContent (report each file touched). For the author (a guest), the bar shows
  the label only (canApprove false) — pass the callbacks to everyone and `canApprove`
  only to the owner.
- Pill focus on non-Freeform layouts: add `data-post-card-id={padlet.id}` on
  PostCardContent's root (NOT `data-padlet-id`, which Freeform already uses — no
  duplicates) and, when not Freeform, the pill scrolls the oldest pending
  `[data-post-card-id]` into view (`scrollIntoView({ block: 'center' })`) and gives it a
  2 s highlight ring.

### C. Guest colour on every Padlet-style layout (Gap 2)
- `PostCardContent.tsx`: when `guestPostStripColor(padlet.metadata)` returns a colour
  (and the caller did not opt out — FreeformPadletCards passes `hideGuestStrip` so its
  own strip is not doubled), render a 4 px top band in that colour with
  `title="Added by a guest"` and `data-guest-strip`.

## Files
Create: `PendingApprovalBar.tsx` (+ test). Modify: `guestAlias.ts` (+ test),
`PostCardContent.tsx` (+ test), `FreeformPadletCards.tsx`, `CanvasClient.tsx`,
`CanvasModals.tsx`, and ONLY the pass-through files between CanvasClient and
PostCardContent for Wall / Columns / Grid / Timeline / Map (WallCanvas,
RowColumnContainerCard, ColumnsLayout, ColumnsCanvasRow, GridLayoutRenderer,
ChronoTimelineCanvas, map PostPopup and its parent — report exactly which). Ask before
touching anything else. No SQL, no git, no production build. Keep all existing
`data-*` hooks.

## Commit
  Commit message:
  feat(sharing): guest approval, colour and names on Wall, Columns, Grid, Timeline, Map

## Acceptance Criteria (PM, live)
For each of Wall, Columns, Grid, Timeline (and Map if a guest can post there): approval
ON, a guest posts → the owner sees the dashed card with Approve/Decline and can
approve (another guest then sees it live) and decline; the pill scrolls to it; a guest
post (approval off) shows the guest-colour band; with Hide guest names on, a guest's
new comment is stored as the alias; a registered user's comment is stored with their
name, never "You". Freeform still behaves exactly as before (live-367 passes). tsc
clean; affected tests pass.

## Required Tests
`commentAuthorName` cases (guest hidden / guest visible / registered / no metadata →
never "You"), PendingApprovalBar (label only vs buttons, confirm), PostCardContent
(bar only when pending AND callbacks given; band when guest; `data-post-card-id`;
no band when `hideGuestStrip`), a source test that CanvasClient no longer contains
inline `currentUserName={user?.` expressions.

## Estimated Difficulty
medium
