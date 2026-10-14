# PATCH-369 — Compact Share canvas window

**Status:** approved

## Goal
The Share canvas window fits on a normal laptop screen: its header and close button are
never cut off, and the Guest link tab (owner, no links yet) is at most ~560 px tall.

## Reason
Owner screenshot (2026-10-15): after PATCH-365..368 the window is taller than the screen
— the title is cut off at the top and "Close" sits at the very bottom. Causes: a
"Canvas access" box that only repeats the board title, three bordered switch cards each
with a two-line hint, a stacked form (Permission, Expiry, checkbox, full-width button),
an always-shown footnote, and a footer row whose only button duplicates the X.

## Design (UI only — no behaviour, no data changes)
1. **Frame.** The dialog becomes a flex column with `max-h-[calc(100dvh-2rem)]`: header
   and footer stay put, the body scrolls (`overflow-y-auto`). It can never be cut off.
2. **Header.** One line: `Share “{canvasTitle}”` (truncate long titles), `py-4`,
   `text-lg`. Drop the "Invite people directly to …" subtitle.
3. **Remove the "Canvas access" box** (the explanation and the title field). The
   **Freeze board** switch moves to a single compact row directly above the tab bar.
4. **One switch-row component** for Freeze / Approve guest posts first / Hide guest
   names: new `components/collabboard/canvas/ui/ShareSwitchRow.tsx` (+ test) — one line:
   label, a small info icon (lucide `Info`, 14 px) whose hint is the `title` attribute
   and an `aria-describedby` sr-only text, then the switch on the right. No card border
   per row; the Guest link tab groups its two rows in one bordered list with a divider.
   Row height ~40 px. The approval toggle's amber "N post(s) already waiting…" hint
   still shows under its row when N > 0 (it carries information, not decoration). Each
   toggle keeps its own data loading/writing logic and its `data-*` hook; only the
   markup goes through `ShareSwitchRow`.
5. **Guest link form.** Permission and Expiry side by side (`grid grid-cols-2 gap-3`,
   small labels). "Require a password" checkbox and **Create guest link** on ONE row
   (checkbox left, button right, not full width). The password input appears under that
   row only when checked.
6. **List area.** Empty state: one muted line "No guest links yet." The footnote
   ("Turning a link off stops new people joining…") shows only when there is at least
   one link.
7. **Footer.** Hidden on the Guest link and People tabs (the X closes). On Email and
   Invite link tabs keep it, with `py-3`.
8. Keep every existing `data-*` hook unchanged (live tests use them):
   `data-share-tab`, `data-guest-links`, `data-guest-link-*`, `data-board-freeze-toggle`,
   `data-guest-approval-toggle`, `data-hide-guest-names-toggle`, `role="switch"`,
   `aria-checked`. Add `data-share-modal` on the dialog panel (for measuring).

## Files to Create
- `components/collabboard/canvas/ui/ShareSwitchRow.tsx` (+ test).

## Files to Modify
- `components/collabboard/canvas/ui/CanvasShareModal.tsx` (+ test)
- `components/collabboard/canvas/ui/BoardFreezeToggle.tsx` (+ test)
- `components/collabboard/canvas/ui/GuestApprovalToggle.tsx` (+ test)
- `components/collabboard/canvas/ui/GuestNamesToggle.tsx` (+ test)
- `components/collabboard/canvas/ui/CanvasGuestLinksTab.tsx` (+ test)

## Files that MUST NOT be touched
Everything else. No SQL, no git, no production build.

## Commit
  Commit message:
  fix(sharing): compact Share canvas window that fits the screen

## Acceptance Criteria (PM, live)
1. In the shared browser's normal window, owner, Guest link tab, no links: the
   `data-share-modal` panel is fully inside the viewport (top ≥ 0, bottom ≤ innerHeight)
   and ≤ ~560 px tall; header visible.
2. With 3 links + password field open, the body scrolls; header stays visible.
3. All four tabs still work; live tests 365/366/367/368 selectors still resolve.
4. `npx tsc --noEmit` clean; affected tests pass.

## Required Tests
`ShareSwitchRow` (label, hint via title + sr-only text, switch toggles, disabled state),
each toggle still renders its data hook and calls its writer, the modal renders without
the Canvas access box and hides the footer on guests/people tabs, the form row layout
(both selects present, checkbox and button on one row, password field only when checked),
footnote only with links.

## Estimated Difficulty
easy
