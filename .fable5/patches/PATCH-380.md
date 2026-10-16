# PATCH-380 — Owner decides what guests may do; owner can remove guests

**Status:** done

## Goal
In Share > Guest link the board owner gets two switches, both OFF by default:
"Guests may upload images and PDFs" and "Guests may use Board AI" (usage is charged to the
owner's plan, as Board AI already is). In "People with access" the owner can **Remove**
anyone, and deleting a guest link can also remove the people who joined with it. Guests no
longer see the Canvas settings tool.

## Reason
Owner (2026-10-16): guests must not upload or use AI "unless the admin user gives them
permission"; and "the guest can only access canvases the admin grants him". PM check
(2026-10-16): a guest link already grants ONE board (`board_collaborators` row on redeem);
other boards return nothing. GAP: deleting a link does not remove guests who already
joined (their `board_collaborators` / `kanban_board_members` rows stay), and "People with
access" (`app/api/boards/[id]/collaborators/route.ts`, GET only) has no Remove. PATCH-379
live run: guests still see `canvas-settings`.

## Design
### 1. Migration — `supabase/migrations/20261016130000_guest_permissions.sql` (do NOT run)
BEGIN/COMMIT, re-runnable, self-check at the end.
- `boards`: `guest_uploads_allowed boolean NOT NULL DEFAULT false`,
  `guest_ai_allowed boolean NOT NULL DEFAULT false`.
- BEFORE UPDATE trigger `boards_guard_guest_permissions`: if either column changes and
  `auth.uid()` is not null and is not `boards.user_id` → RAISE 'Only the board owner can
  change what guests may do' (42501). Service role (no uid) passes.
- `board_collaborators`: `joined_via_link_id uuid NULL REFERENCES share_links(id) ON DELETE
  SET NULL` + index. (Existing rows stay NULL.)
- New table `guest_activity (id bigint identity PK, board_id uuid NOT NULL REFERENCES
  boards(id) ON DELETE CASCADE, user_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN
  ('ai','upload')), created_at timestamptz NOT NULL DEFAULT now())`, index
  `(board_id, user_id, kind, created_at)`. RLS ENABLED with NO policies, REVOKE ALL from
  anon/authenticated — only the service role touches it (the PATCH-358 guest guard is a
  one-time loop and does not cover new tables; this table needs no guest policy because
  nobody but the server can read or write it).

### 2. Server — one helper, used everywhere a guest is refused today
`lib/server/sharing/guestPermissions.ts` (+test):
`guestMay(admin, { boardId, userId, kind: 'ai'|'upload', now })` →
`{ ok: true } | { ok: false, refusal }`. Reads the board flag (service role); the caller
must be an `editor` collaborator of THAT board (`get_board_permission`); caps per guest per
board: **AI 20 per 24 h**, **upload 20 per 10 min** (count `guest_activity`);
`recordGuestActivity(...)` inserts one row after a successful call/upload. Refusals:
flag off → the existing `GUEST_AI_REFUSAL` / `GUEST_UPLOAD_REFUSAL`; cap hit →
`{ error: 'Guest limit reached. Please try again later.', code: 'guest_limit' }` 429.
No boardId → refused (fail closed). A throw → 503, never "allowed".
- **AI:** the guest checks in `checkBoardAiCredits` / `checkAiActionCredits` /
  `checkManagedAiCredits` (`lib/server/billing/aiCredits.ts`) call `guestMay(kind 'ai')`
  instead of refusing outright; everything after is unchanged, so the BOARD's plan (the
  owner's workspace) is checked and charged; a guest never uses a BYOK key. Record the
  activity only when the model was actually called.
- **Board AI for guests is answer-only:** no `<board-changes>` proposals (do not pass the
  PATCH-372 proposal instructions for a guest), chips = the answer kinds only
  (`actionsForLayout` gets an `answerOnly` option, reuse the Map rule).
- **Uploads:** guests never write to Storage directly (PATCH-358's
  `guest_no_storage_*` policies stay as they are — NO storage policy change). New route
  `POST /api/boards/[id]/guest-upload` (multipart, one file): guest only; `guestMay
  ('upload')`; type allow-list by sniffed bytes AND declared type: png, jpeg, gif, webp,
  pdf — **no SVG/HTML**; ≤ 10 MB; stores with the admin client in `padlet-files` at
  `guest-uploads/<boardId>/<userId>/<uuid>.<ext>`; returns `{ url }`. Every client upload
  path a guest can reach once the flag is on (image editor upload tab, image post, link
  image, Padlet post composer attachments if any — find them and list them) uses this route
  when the user is a guest. Existing server upload routes that return
  `GUEST_UPLOAD_REFUSAL` keep refusing guests (Wiki/knowledge documents, imports,
  PDF-area images stay owner/member only).
- **Remove a person:** `DELETE /api/boards/[id]/collaborators/[userId]` — board admin only
  (`boardPermissionSatisfies(..., 'admin')`), cannot remove the owner; deletes the
  `board_collaborators` row and the matching `kanban_board_members` row (admin client).
- **Redeem** (`app/api/share-link/redeem/route.ts`): set `joined_via_link_id` on the
  upsert (only when it inserts or upgrades; never overwrite an existing value with null).
- **Delete link** (`app/api/boards/[id]/share-links/[linkId]/route.ts`): optional body
  `{ removeJoined: true }` → after deleting the link, delete the collaborator (+ kanban
  member) rows with `joined_via_link_id = linkId` on that board; respond with the count.
- **Owner toggles:** PATCH of the two flags through the existing board settings write path
  the Share modal already uses (or a small `PATCH /api/boards/[id]/guest-permissions`,
  owner only) — reuse what exists.

### 3. Client
- `CanvasGuestLinksTab.tsx`: two `ShareSwitchRow`s ("Guests may upload images and PDFs" /
  "Guests may use Board AI", helper text "Uses your AI credits"), owner only, data attrs
  `data-guest-permission="uploads|ai"`. Deleting a link opens a confirm: "Also remove the
  N people who joined with this link?" (checkbox, default ON; N from the people list).
- People list: a Remove button per person except the owner (`data-remove-person=<userId>`),
  confirm, then the row disappears.
- `canvasToolbarRegistry.tsx`: add `canvas-settings` to `GUEST_FORBIDDEN_TOOL_TYPES`;
  when `guestUploadsAllowed` → a guest gets `image` back; when `guestAiAllowed` → the
  Board AI button shows for guests (answer-only chips). `ai-component`, `upload`,
  `import`, `knowledge-pdf`, `library`, `container` stay forbidden for guests.
- Flags come from the boards row CanvasClient already loads; if the existing boards
  realtime subscription (PATCH-374/377 hooks) makes a live update cheap, update the guest's
  toolbar live — otherwise on reload. Report which.
- A removed guest: their next write/read fails; on the next load they get the existing
  "no access" page. Report what they see.

## Files
Create: the migration, `guestPermissions.ts` (+test), the guest-upload route (+test), the
collaborator DELETE route (+test). Modify: `aiCredits.ts` (+tests), Board AI chat route /
execution (guest answer-only), `boardAiPadletActions.ts` (answerOnly), the redeem route, the
link DELETE route, `CanvasGuestLinksTab.tsx` (+people list component), `CanvasShareModal.tsx`
if needed, `canvasToolbarRegistry.tsx`, `CanvasClient.tsx` (flags, guest upload path), the
client upload call sites you find (list them). Tests of the files you change may be edited
without asking; ask before touching anything else. No SQL execution, no git, no build.

## Commit
  feat(sharing): owner lets guests upload or use Board AI; remove people from a board

## Acceptance Criteria (PM, live, after the owner applies the SQL)
Throwaway Columns board, anonymous guest via an edit link:
1. Flags off: guest has no Image tool, no Board AI button, no Canvas settings; direct POST
   to guest-upload → 403; Board AI chat API → 403.
2. Owner turns uploads on: guest sees Image, uploads a PNG → image post appears; an SVG and
   an 11 MB file are refused; 21st upload in 10 min → 429.
3. Owner turns AI on: guest sees the Board AI button with answer chips only, asks a
   question → cited answer, credit row on the owner's workspace with the guest's user_id;
   no Apply proposals.
4. A registered editor (second account) cannot change the flags (refused).
5. Owner removes the guest in People with access → guest's next post is refused and a
   reload shows no access. Second guest joins via a link; owner deletes the link with
   "also remove" → that guest loses access; with the box unticked → keeps access.
6. Guest opening another board's URL sees no content.
tsc clean; per-test gate unchanged. SQL pre-flight on PGlite before the SQL goes to the owner.

## Required Tests
`guestMay` (flag off/on, not a collaborator, caps, no board, throw → 503); aiCredits guest
paths; upload route (type sniffing, SVG refused, size, cap, non-guest refused); collaborator
DELETE (admin only, owner not removable, kanban row removed); link delete with/without
removeJoined; redeem sets `joined_via_link_id`; toolbar guest lists with each flag; answer-only
chips for guests; Share switches owner-only.

## Estimated Difficulty
hard

## Addendum 1 (PM live run, 2026-10-16)
- Guest Board AI chat returned a silent 503: PATCH-358's restrictive guest policies on
  `board_ai_threads` / `board_ai_messages` refused the guest's own thread. Migration
  `20261016140000_guest_board_ai_chat.sql` (APPLIED): a guest may read/write only their OWN
  thread and its messages, and only while `boards.guest_ai_allowed` is on. The chat route now
  logs the storage error code on every thread/message 503.
- Guest AI scoped to the Board AI chat only (`checkBoardAiCredits({ allowGuest })`, chat route
  only); `checkAiActionCredits` keeps refusing guests.
- Guest uploads also wired into the Image tool upload tab and the crop/draw save
  (`uploadFileForViewer`); "Upload a PDF" hidden in the drawer for guests.
- Placement prompts (Columns, Wall, Drawing) offer guests only "Add to Existing".

## Result
Live `live-380.mjs` 30/30 (three anonymous guests + the registered second account, throwaway
boards). PGlite pre-flight: check-380 14/14, check-380b 14/14. tsc clean; gate 61 = 61 by name.
