# PATCH-368 — Hide guest names: guests show as "Guest NN"

**Status:** approved

## Goal
The board owner can switch on **Hide guest names**. Guests then appear to everyone
else as a stable alias like "Guest 42" instead of the name they typed, everywhere a
guest's name reaches another person. Last of the four guest safety controls.

## Reason
Honest feedback in retrospectives and anonymous brainstorming: Klaxoon and Mural let
the organiser hide participants' identities. Our guests type a name when they join
(PATCH-358), and that name shows in presence, Kanban member lists and comment authors.

## Expected Outcome
- **Switch.** Share canvas → Guest link tab, under "Approve guest posts first": a switch
  **Hide guest names** with the hint "Guests appear as Guest 1–99 to everyone. You still
  see real names on the People tab." Owner-only (same pattern as `GuestApprovalToggle`).
- **While on**, every viewer — other guests, editors AND the owner on the board itself —
  sees each OTHER guest as `Guest NN`:
  - presence stack + list (initials become "G", colour unchanged);
  - Kanban member names (assignee pickers, member lists — whatever reads
    `get_board_members_with_profile`), avatar hidden;
  - NEW comments written by a guest store the alias as their author name (existing
    comments are not rewritten).
  A guest still sees themself as "You" / their own name. Registered users' names are
  never hidden. The owner's **People tab keeps real names** (access management), with a
  small note "Hidden from others while Hide guest names is on".
- Switching it on/off reaches open tabs live (no reload) — `boards` is already in the
  realtime publication (PATCH-366).
- The real name must not be sent to other clients while on: a guest's presence payload
  carries `name: null`, so it never travels over the channel.

## The alias (one rule, in TS and SQL)
`guestAlias(userId) = 'Guest ' + ((parseInt(userId.slice(0, 4), 16) % 99) + 1)`.
SQL twin: `'Guest ' || ((('x' || substr(u.id::text, 1, 4))::bit(16)::int % 99) + 1)`.
Stable per user and the same in every viewer. A test must pin both to the same values
for a few fixed UUIDs (the SQL twin is checked as a string in the migration source test,
plus the TS values).

## Files to Create
- `supabase/migrations/20261014210000_hide_guest_names.sql` — ONE transaction:
  1. `ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS hide_guest_names boolean NOT
     NULL DEFAULT false;` + comment.
  2. Owner/admin guard trigger `boards_guard_hide_guest_names` BEFORE UPDATE OF
     hide_guest_names (same body pattern as `guard_board_guest_approval`).
  3. `CREATE OR REPLACE public.get_board_members_with_profile(board_id uuid)` — copy the
     CURRENT body verbatim from `20261014140000_kanban_share_access.sql` (same signature,
     same return columns, same SECURITY/search_path/grants) and change ONLY
     `display_name` and `avatar_url`: when the board's `hide_guest_names` is true AND the
     member is anonymous (`u.is_anonymous`) AND `u.id <> auth.uid()` → the SQL alias and
     a NULL avatar. Everything else unchanged (emails stay hidden from guests as in 360).
  4. Self-check DO block (column, trigger, function exists).
- `lib/domain/presence/guestAlias.ts` (+ test) — `guestAlias(userId)`,
  `displayNameFor({ name, userId, isGuest, isMe, hideGuestNames })` → alias when
  hidden + guest + not me, else the name.
- `components/collabboard/canvas/hooks/useBoardGuestSettings.ts` (+ test) — returns
  `{ hideGuestNames }` for a board: one read of `boards.hide_guest_names`, then a
  `postgres_changes` UPDATE subscription on `boards` `id=eq.<id>` with a UNIQUE topic per
  instance (`useId`, the PATCH-366 lesson: two channels on one topic drop events);
  ignores updates where the flag did not change.
- `components/collabboard/canvas/ui/GuestNamesToggle.tsx` (+ test) — owner-only switch,
  `role="switch"`, `aria-checked`, `data-hide-guest-names-toggle`; 42501 toast.

## Files to Modify
- `components/collabboard/presence/useBoardPresence.ts` — take `hideGuestNames`; when
  true and the current user is a guest, track `name: null`; re-track when the flag
  changes (the channel stays). Tests.
- `lib/domain/presence/boardPresence.ts` / `BoardPresenceStack.tsx` — render names via
  `displayNameFor` (a guest with `name: null` and the flag off falls back to "Guest");
  initials from the displayed label. Tests.
- `app/dashboard/canvas/[id]/CanvasClient.tsx` — call `useBoardGuestSettings(canvasId)`
  once and pass `hideGuestNames` to `useBoardPresence` (all three returns already share
  that hook call). Minimal lines; report them.
- Comment author on write: find where a Freeform post comment and a Kanban card
  comment get their author display name when created. When the board flag is on and
  the writer is a guest, store `guestAlias(userId)` instead. Report the files; if a
  comment path reads the name at RENDER time from the members RPC instead, the
  migration already covers it — say which.
- `components/collabboard/canvas/ui/CanvasGuestLinksTab.tsx` — render
  `<GuestNamesToggle boardId={canvasId} />` under the approval toggle.
- `components/collabboard/canvas/ui/CanvasPeopleTab.tsx` — the one-line note when the
  flag is on (read it with the new hook).
- `vitest.config.ts` only if a new test path is not matched.

## Find and report (do not build beyond this)
List every other place a guest's typed name (`user_metadata.display_name` / `name`)
can reach another user (grep for `display_name`, `full_name`, `user_metadata.name`,
`raw_user_meta_data`). For each: covered by this patch / not covered + why. Do not
change unlisted files without asking.

## Files that MUST NOT be touched
`.claude/settings.json`, `lib/server/ai/providers/anthropic.test.ts`, earlier
migrations. No SQL apply, no git, no production build.

## Architecture Notes
- Hiding is enforced where data leaves for others: the RPC (server) and the guest's own
  presence payload (it never sends the name). Rendering also applies the alias so a
  stale payload never shows a name.
- The owner sees aliases on the board too (honest retros); the People tab is the
  owner's access tool and keeps real names.

## Commit
  Commit message:
  feat(sharing): hide guest names — guests show as "Guest NN"

## Rollback Plan
Revert the app commit; re-run the 360 RPC definition; leave the column.

## Acceptance Criteria (PM, live, after the owner applies)
Freeform + Kanban throwaway boards, two guests, owner:
1. Flag on → within seconds, guest B's and the owner's presence lists show guest A as
   `Guest NN` (no reload); A's presence payload has `name: null` (frame capture).
2. Kanban: the members RPC returns `Guest NN` for A to B and to the owner; A sees own
   name; registered owner's name unchanged.
3. A new comment by A stores the alias.
4. Flag off → real names return live.
5. A guest cannot flip the flag.
6. `npx tsc --noEmit` clean; affected tests pass.

## Required Tests
Alias (fixed UUIDs → fixed numbers, 1..99 range), `displayNameFor` cases, settings hook
(unique topics, ignores unrelated updates), toggle, presence payload `name: null` when
hidden and re-track on flip, stack renders alias, migration source test (body copied
from 360 with only the two columns changed — assert the alias expression, the
`is_anonymous` and `<> auth.uid()` terms, the guard trigger, self-check).

## Estimated Difficulty
medium
