# PATCH-365 — Guest links in Share canvas: create, QR code, turn off

**Status:** approved

## Goal
A board owner can create a guest link from the board's Share window, show it as a QR
code for a room to scan, see the board's active guest links, and turn one off.

## Reason
The owner asked for the guest safety controls (from the Padlet / Miro / Klaxoon review:
QR code, freeze board, approve guest posts, hide names). Checking the code for the QR
code showed a bigger gap: **the board's Share window cannot create a guest link at
all.** Its "Invite link" tab calls `/api/invitations/create-link` (a workspace invite,
`/invite/<code>`, which needs an account). The guest flow from PATCH-357/358
(`/share/<token>` → "Join as guest") is only reachable today by calling
`POST /api/share-link` by hand; the presence demo did exactly that. Every other safety
control assumes an owner can hand out — and take back — a guest link.

## Why now / why this order
First of four safety patches: 365 guest links + QR + turn off → 366 freeze board →
367 approve guest posts → 368 hide names. Turning a link off also covers the known
follow-up "removed people can rejoin while the link is valid".

## Expected Outcome
Share canvas has a fourth tab, **Guest link**:
- A small form: permission (Can view / Can comment / Can edit, default Can edit),
  expiry (Never / 1 day / 7 days / 30 days, default 7 days), optional password, and a
  **Create guest link** button.
- After creating (and on open), a list of this board's active guest links. Each row
  shows the permission, "Expires in 6 days" / "Never expires", "Password" if set,
  how many times it was opened, and buttons **Copy**, **QR code**, **Turn off**
  (inline confirm, like People's remove).
- If a password was set, it is shown once after creating, with a Copy button (the
  server only keeps its hash).
- **QR code** opens a full-screen white overlay (for a projector): a large QR code of
  the link, "Scan to join <board title>", the link as text underneath, a close button,
  and Escape closes it.
- A non-owner who opens the tab sees "Only the board owner can manage access." (the
  same text as People) and no form.
- The tab works in Kanban and Gantt too (they render the same `CanvasShareModal`).

## Files to Create
- `lib/domain/sharing/guestLinks.ts` (+ `guestLinks.test.ts`) — pure helpers, no IO:
  - `type GuestLinkPermission = 'view' | 'comment' | 'edit'`.
  - `interface GuestLink { id; permission; createdAt; expiresAt: string | null;
    isPasswordProtected: boolean; accessCount: number; url: string }`.
  - `toGuestLink(row, origin): GuestLink` — maps a `share_links` row
    (`id, token, permission, created_at, expires_at, password_hash, access_count`).
    `isPasswordProtected = !!password_hash`; **the hash is never put on the object**.
    `url = origin + '/share/' + token`.
  - `isGuestLinkActive(row, now)` — false when `expires_at` is in the past.
  - `guestLinkPermissionLabel(p)` → `Can view` / `Can comment` / `Can edit`.
  - `guestLinkExpiryLabel(expiresAt, now)` → `Never expires`, `Expires today`,
    `Expires tomorrow`, `Expires in N days`.
  - `GUEST_LINK_EXPIRY_OPTIONS` = `[{label:'Never', days:null}, {label:'1 day', days:1},
    {label:'7 days', days:7}, {label:'30 days', days:30}]`.
- `app/api/boards/[id]/share-links/route.ts` — **GET**: the board's active guest links.
  Copy the authority pattern of `app/api/boards/[id]/collaborators/route.ts` exactly
  (signed-in user; `getBoardPermission` with the admin client must satisfy `admin`,
  else 403 `Only the board owner can manage access.`). Then read with the admin client:
  `share_links` where `board_id = id` and `share_target = 'board'`, newest first,
  limit 50; drop expired rows with `isGuestLinkActive`; return
  `{ links: GuestLink[] }` via `toGuestLink(row, origin)` (origin =
  `NEXT_PUBLIC_APP_URL || request.nextUrl.origin`, as `POST /api/share-link` does).
  Errors: 401 / 403 / 500 with a plain message; log server-side.
- `app/api/boards/[id]/share-links/[linkId]/route.ts` — **DELETE**: same authority
  check; delete `share_links` where `id = linkId AND board_id = id AND share_target =
  'board'`, `select('id')`; 404 `Link not found.` if nothing was deleted; 200
  `{ ok: true }`. Validate both ids as UUIDs (400 otherwise).
- `components/collabboard/canvas/ui/CanvasGuestLinksTab.tsx` (+ test) — the tab.
  Mirrors `CanvasPeopleTab` (load on mount, inline confirm, errors shown, never
  swallowed). Creates with the EXISTING `POST /api/share-link` body
  `{ boardId, permission, shareTarget: 'board', expirationDays, password }`, then
  reloads the list. Password: a checkbox "Require a password" reveals an input
  (min 4 characters, client-side check, max 128). Copy uses `navigator.clipboard`
  with a toast like the modal's other copy buttons.
- `components/collabboard/canvas/ui/GuestLinkQrOverlay.tsx` (+ test) — the
  full-screen overlay. `QRCodeSVG` from `qrcode.react`, `level="M"`, size
  `min(70vh, 70vw)` (compute from `window.innerWidth/innerHeight` with a sensible
  fallback, e.g. 320, for tests), `marginSize={2}`. `role="dialog"`, `aria-modal`,
  `aria-label="QR code for the guest link"`. z-index above the share modal
  (the modal is `z-[3100]`; use `z-[3200]`). Escape and the close button call
  `onClose`; Escape must not also close the share modal underneath (stop propagation
  / handle it in the overlay only).

Stable test hooks (live tests use them): `data-guest-links` (tab root),
`data-guest-link-permission` (select), `data-guest-link-expiry` (select),
`data-guest-link-password-toggle`, `data-guest-link-password`,
`data-guest-link-create`, `data-guest-link-row` + `data-guest-link-id="<id>"`,
`data-guest-link-copy`, `data-guest-link-qr`, `data-guest-link-off`,
`data-guest-link-off-confirm`, `data-guest-link-new-password` (the shown-once
password), `data-guest-qr-overlay`, `data-guest-qr-close`; the tab button
`data-share-tab="guests"`.

## Files to Modify
- `package.json` / `package-lock.json` — add **`qrcode.react` pinned exactly at
  `4.2.0`** (`npm install qrcode.react@4.2.0 --save-exact`). It supports React 19
  (peer `^16.8 || … || ^19`), MIT, renders SVG, no canvas. Nothing else in
  dependencies may change; report the lockfile diff size.
- `components/collabboard/canvas/ui/CanvasShareModal.tsx` — add the tab: `ShareTab`
  gains `'guests'`; a fourth tab button **Guest link** (lucide `QrCode` icon) between
  "Invite link" and "People"; render `<CanvasGuestLinksTab canvasId canvasTitle />`.
  Keep the tab row from overflowing on the `max-w-xl` modal (shorten "Email invite"
  to "Email" if needed). The footer's primary button logic must not show
  "Create link" / "Send" for the guests tab (only Close). Keep the file under
  ~470 lines.
- `app/api/share-link/route.ts` — for `shareTarget === 'board'` only, the caller must
  satisfy **`admin`** (board owner/admin), not merely the level being granted:
  403 `Only the board owner can create guest links.` Post-level shares are unchanged.
- `vitest.config.ts` — only if a new test file is not matched by an existing glob.

## Files that MUST NOT be touched
`.claude/settings.json`, `lib/server/ai/providers/anthropic.test.ts`, the redeem
route, the share page / GuestJoinCard, any migration. No SQL apply, no git.

## Architecture Notes
- `share_links` is a service-role table (it carries a password hash): read and delete
  only through the admin client, only after the admin check. Never return
  `password_hash` or any other row field beyond `GuestLink`.
- The token is returned to the board owner only, who created (or co-owns) the link.
- Turning a link off stops NEW joins. People who already joined keep access until
  removed on the People tab — say so in one muted line under the list:
  "Turning a link off stops new people joining. Remove people who already joined on
  the People tab."
- Keep routes thin; put shaping/labels in `guestLinks.ts` so they are unit-tested.

## Migration Notes
None. `share_links` already has every column used
(`id, board_id, padlet_id, token, permission, share_target, password_hash,
expires_at, access_count, created_by, created_at`) — confirmed by the PM in
`supabase/baseline/schema_snapshot_2026-07-05.sql` line 1950. Use no other column.

## Potential Risks
- Tab row overflow on a narrow modal → check at 576px width in the component test by
  asserting the four buttons render; the PM checks visually live.
- Escape handling: the overlay must not close the share modal too.
- `qrcode.react` ESM/CJS under Next 15/Vitest — if the import fails in tests, report
  it; do not mock the library away in the overlay test (render it and assert an
  `svg` exists).

## Commit
  Commit message:
  feat(sharing): guest links in Share canvas — create, QR code, turn off

## Rollback Plan
Revert the commit; no data changes. Links created meanwhile stay valid and can be
deleted later.

## Acceptance Criteria
1. Owner: Share canvas → Guest link → Create → a row appears with Copy / QR code /
   Turn off; the link opens the guest join card in a fresh browser.
2. QR overlay shows an SVG QR whose encoded value is exactly the row's URL; Escape
   closes only the overlay.
3. Turn off → confirm → the row disappears; the link now shows the share page's
   not-found / invalid state for a new visitor.
4. A non-owner gets the 403 message on the tab, and `POST /api/share-link` with
   `shareTarget: 'board'` from a non-admin returns 403.
5. Password link: the password is shown once; a guest must enter it before joining.
6. `npx tsc --noEmit` clean; affected tests pass.

## Required Tests
- `guestLinks.test.ts`: mapping (no hash leaks — assert the object has no
  `password_hash`/`token` keys other than inside `url`), active/expired, labels
  (today / tomorrow / N days / never), permission labels.
- `CanvasGuestLinksTab.test.tsx` (fetch mocked): loads and lists; create posts the
  exact body and reloads; password toggle + min-length validation; shown-once
  password; turn off needs confirm then calls DELETE and removes the row; 403 shows
  the owner-only message and hides the form; a failed create shows the error.
- `GuestLinkQrOverlay.test.tsx`: renders an `svg`; shows the URL text and title;
  Escape and the close button call `onClose`.
- `CanvasShareModal.test.tsx`: the Guest link tab button exists and renders the tab.
- `app/api/share-link` board-target admin rule: add a focused test if the route
  already has a test file; otherwise test the decision as a small exported pure
  function next to the route logic (report which).

## Estimated Difficulty
medium
