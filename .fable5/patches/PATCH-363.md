# PATCH-363 — Presence: see who is on the board right now

## Why
Step 3 of the visitor plan (after share links, guests and access management): before
timer and dot-voting, everyone on a board should see who else is there, guests
included, by name. The same channel will carry the timer and votes later, so it must be
access-checked from the start.

## Design

### 1. A private, access-checked board channel (migration)
Supabase Realtime **public** channels can be joined by anyone who knows the channel name.
Use a **private** channel `board:<boardId>`, authorised by RLS on `realtime.messages`
(Supabase "Realtime Authorization"; supabase-js 2.93 supports `config: { private: true }`).

New `supabase/migrations/20261014170000_board_presence_channel.sql`, one transaction:
- `public.can_join_board_channel(topic text) RETURNS boolean`: plpgsql, STABLE,
  SECURITY DEFINER, `SET search_path = public`.
  - Accept only topics matching `^board:[0-9a-f-]{36}$`; anything else → false. Never
    cast invalid text.
  - Return true if `public.get_board_permission(<id>, auth.uid()) IS NOT NULL` (owner,
    workspace, collaborator) OR a `kanban_board_members` row exists for
    `(<id>, auth.uid())`.
  - `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.
- Policies on `realtime.messages`, `TO authenticated`, each dropped if it exists first:
  - `board_channel_receive` FOR SELECT USING
    `realtime.messages.extension IN ('presence','broadcast') AND public.can_join_board_channel((select realtime.topic()))`;
  - `board_channel_send` FOR INSERT WITH CHECK the same.
- Header comment: why private; guests included (they pass `get_board_permission` via
  `board_collaborators`); existing public `postgres_changes` channels are untouched.

### 2. Who am I (pure)
`lib/domain/presence/boardPresence.ts` (+ tests):
- `presenceIdentity(user)` → `{ userId, name, isGuest }`:
  - name = `user_metadata.full_name`, then `name`, then `display_name`, trimmed and
    capped at 40 characters, else 'Member';
  - **never the email**, because guests see this.
- `presenceColor(userId)`: a stable color from a fixed palette of 8 accessible colors,
  chosen by a hash of the id.
- `initials(name)`: up to 2 letters.
- `presencePeople(state, myUserId)`: turns a Supabase presence state into a list with
  one entry per user (several tabs of the same user count once; keep the earliest
  `joinedAt`), with me first and the rest sorted by `joinedAt`.
- `overflow(list, max = 5)` → `{ visible, hidden }`.

### 3. Hook
`components/collabboard/presence/useBoardPresence.ts`:
- `useBoardPresence(boardId, user)` subscribes to
  `supabase.channel('board:' + boardId, { config: { private: true, presence: { key: user.id } } })`.
- On `SUBSCRIBED` it tracks `{ name, isGuest, color, joinedAt }`.
- On presence `sync` it recomputes the people list.
- Cleanup: `untrack` + `removeChannel`.
- Returns `{ people, status }`, where status is `'connecting' | 'live' | 'unavailable'`.
  `CHANNEL_ERROR` → `'unavailable'`: log once with `console.error`, no toast spam, and
  the stack hides itself.

### 4. UI
`components/collabboard/presence/BoardPresenceStack.tsx`:
- A small pill fixed at the **bottom-right** of the canvas viewport (16px from both
  edges; this corner is empty on Freeform and Kanban), with a z-index above the canvas
  and below modals.
- Overlapping round avatars (28px) with initials on the person's color; me marked with
  a ring; up to 5 shown, then "+N".
- Hover, or click on touch, opens a small list of everyone: avatar, name, "(you)", a
  "Guest" tag.
- Hidden when only I am present? No: show it whenever live, so the owner sees "just
  me".
- `data-presence-stack`, `data-presence-person`, `data-presence-overflow` and
  `data-presence-list` attributes.

Mount it in `app/dashboard/canvas/[id]/CanvasClient.tsx` once for every layout, with
the board id and the signed-in user the page already has. Do not add a new `getUser()`
call. Add only the import and a few lines; the file is large, so keep the logic in the
new files.

## Tests
- Domain: names, never the email, guest flag, color stability, initials, dedupe across
  tabs, me first, overflow.
- Hook (mocked channel): subscribe with `private: true`, track after `SUBSCRIBED`, sync
  → list, `CHANNEL_ERROR` → unavailable, cleanup.
- Component: renders up to 5 + "+N", "(you)", the "Guest" tag in the list.
- Migration source test: topic regex, `get_board_permission` + Kanban fallback,
  revoke/grant, both policies on `realtime.messages`.

## Allowed files
The migration (+ source test), `lib/domain/presence/boardPresence.ts` (+ test),
`components/collabboard/presence/*` (+ tests), and the mount lines in
`CanvasClient.tsx`. Check the vitest globs (`components/collabboard/**` and
`lib/domain/**`). Ask before touching anything else. No SQL apply, no git. Run
`npx tsc --noEmit` and the affected tests.

## Verification (PM, live, after the owner applies)
Throwaway Freeform board plus a throwaway Kanban board:
- The owner's tab shows 1 (me).
- A guest joins by edit link → both tabs show 2, with the right names; the guest sees
  no email anywhere.
- The guest closes the tab → the owner shows 1 within a few seconds.
- A registered second account WITHOUT access subscribes to `board:<id>` → refused or
  sees no one.
- Screenshots of the stack and the open list on both layouts.

## Addendum 1 — Kanban and Gantt need the stack too
Live: Freeform passed every check (1 → 2 → 1, names, Guest tag, "(you)", no email),
and the outsider was refused (CLOSED, 0 people). But Kanban showed NO stack: `CanvasClient`
returns early for `isKanbanLayout` (the `<>…</>` with `KanbanShell` + `BoardAiChatDrawer`)
and for `isGanttLayout` (`<GanttShell …/>`), and the stack is mounted only in the main
return. The hook already runs for every layout. Render the same
`<BoardPresenceStack people={boardPresence.people} status={boardPresence.status} myUserId={user?.id ?? ''} />`
inside the Kanban fragment, and wrap the Gantt return in a fragment with it. No other
changes. Allowed files: `CanvasClient.tsx`. Run `npx tsc --noEmit`. No git.

## Addendum 2 — the avatars must not move when the list opens (owner's screenshot)
In `BoardPresenceStack.tsx` the list is in normal flow above the button inside the fixed
box. Opening it widens the box to `w-56`, and the button, which is left-aligned in the
box, jumps left; the list and the avatars line up on the LEFT. In a bottom-right corner
both must line up on the RIGHT, and the avatars must never move.

Fix:
- The fixed box only wraps the button (it keeps `bottom: 16, right: 16`) and gets
  `relative`.
- The list becomes `absolute right-0 bottom-full`, so it opens upward, flush with the
  button's right edge, and never changes the box's size.
- Use padding (`pb-2`) on the absolute wrapper instead of `mb-2` on the list, so the
  hover area is continuous from the avatars up into the list and it does not close
  while the mouse moves up.
- Widen the list to `w-64` so names truncate less.

Component test: the list wrapper carries `absolute`, `right-0` and `bottom-full`
classes, and the button is unchanged. Allowed files: `BoardPresenceStack.tsx` and its
test. No git.
