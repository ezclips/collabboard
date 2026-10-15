# PATCH-374 — Facilitator kit 1: shared timer + "Bring everyone here"

**Status:** done

## Goal
A board host (owner or board admin) can run a workshop:
1. **Timer** — start a countdown (1, 3, 5, 10 min or custom), pause, resume, +1 min, stop.
   Everyone on the board, guests included, sees the same countdown live; "Time's up"
   when it ends.
2. **Bring everyone here** — one click moves every other viewer to what the host is
   looking at.

Layouts: Freeform, Wall, Columns, Grid, Timeline, Map (timer on all six; "Bring everyone
here" on all but Map). Not Kanban, Scheduler, Gantt (separate pages; later).

## Reason
Owner's plan after the guest controls (365–368): facilitator kit — timer + bring everyone
to me, then dot-voting with hidden results, then private brainstorm + reveal (Klaxoon /
padlet.com review, memory `ai-on-notes-plan`). These two come first because the next two
build on "a host controls a session state everyone sees".

## Design
### 0. Authority and transport (decided)
- Who is the host: `public.can_review_board_posts(b)` (PATCH-367: board owner or board
  admin). Same rule client-side via the existing reviewer flag used for the Approve UI.
- State lives on the `boards` row, so a late joiner sees a running timer and nothing is
  lost on reconnect. `boards` is already in the realtime publication (PATCH-366).
- Times come from the SERVER clock (`now()` in the RPCs), never the host's clock.
- A summon is a timestamped row change, not a broadcast, so it cannot be spoofed by a
  member (the private `board:` channel lets any member send broadcasts).

### 1. Migration — `supabase/migrations/20261015130000_board_facilitation.sql`
Guarded / re-runnable, self-check at the end, the style of `20261014200000_guest_post_approval.sql`.
- Columns on `public.boards` (all nullable):
  `timer_ends_at timestamptz`, `timer_duration_seconds int`,
  `timer_paused_remaining_seconds int` (non-null = paused),
  `summoned_at timestamptz`, `summoned_by uuid`, `summon_target jsonb`.
- Guard trigger `boards_guard_facilitation` (BEFORE UPDATE): if any of these columns
  changes and `auth.uid()` is not null and `NOT can_review_board_posts(NEW.id)`, force
  them back to OLD (same pattern as `boards_guard_guest_approval`). Service role passes.
- RPCs (SECURITY INVOKER, `authenticated` only, each RAISEs `not allowed` unless
  `can_review_board_posts(b)`, each returns `now()` as `server_now`):
  - `board_timer_start(b uuid, seconds int)` — 10..7200; sets ends_at = now()+seconds,
    duration = seconds, paused = null.
  - `board_timer_pause(b)` — running only: paused = ceil(ends_at - now()), ends_at = null.
  - `board_timer_resume(b)` — paused only: ends_at = now()+paused, paused = null.
  - `board_timer_add(b, seconds int)` — 10..600; adds to ends_at or to paused.
  - `board_timer_stop(b)` — all three timer columns null.
  - `board_summon(b, target jsonb)` — target validated: `{"kind":"freeform","x":num,
    "y":num,"zoom":num 0.1..4}` or `{"kind":"post","postId":uuid}` (the post must be on b);
    sets summoned_at = now(), summoned_by = auth.uid(), summon_target = target.
  - `board_clock()` — returns `now()` (any authenticated user; for clock skew).
- Grants: REVOKE from PUBLIC/anon; GRANT EXECUTE to authenticated.

### 2. Domain — `lib/domain/facilitation/boardTimer.ts` (+ test)
Pure: `timerState(row, serverNowMs)` → `{ phase: 'idle'|'running'|'paused'|'finished',
remainingSeconds, durationSeconds }` ('finished' = ends_at in the past, shown for 10 s
then 'idle' locally — the row is not cleared); `formatTimer(s)` → `m:ss` / `h:mm:ss`;
`clockSkewMs(t0, serverNow, t1)`; `TIMER_PRESETS = [60,180,300,600]`; summon target
validation mirroring the SQL.

### 3. Hook — `components/collabboard/facilitation/useBoardFacilitation.ts` (+ test)
- Reads the six columns on mount; subscribes to `boards` UPDATE for this id on its OWN
  channel with a unique topic (`board-facilitation:${boardId}:${useId()}`) — never share a
  topic, never add to `canvas-<id>` (PATCH-373 lesson: one bad subscription kills the
  channel).
- Calls `board_clock()` once on mount for skew; ticks once per second only while running.
- Summon: fires `onSummon(target)` only when `summoned_at` CHANGES during this session
  AND is within 15 s of server now AND `summoned_by` is not the current user. A late joiner never jumps.
- Actions: start/pause/resume/add/stop/summon → RPC; errors → one toast, no retry loop.

### 4. UI
- `components/collabboard/facilitation/BoardTimerPill.tsx` (+ test): fixed top-centre pill
  for EVERYONE when phase ≠ idle. Running: `m:ss`; last 10 s red + pulse; paused: "Paused
  m:ss"; finished: "Time's up" for 10 s with one short chime (WebAudio beep, no file) unless
  the viewer muted it (bell toggle on the pill, per-viewer in localStorage, try/catch).
  Host sees the controls on the pill (pause/resume, +1 min, stop). `data-board-timer`,
  `data-board-timer-phase`, `data-board-timer-remaining` (seconds), `data-board-timer-action="pause|resume|add|stop"`.
- `components/collabboard/facilitation/FacilitatorMenu.tsx` (+ test): toolbar tool
  `data-toolbar-tool="facilitate"` (registry entry next to Board AI), shown only to hosts,
  on the six layouts, hidden for guests. Popover: presets + custom minutes
  (`data-facilitate-timer-preset="60"`, `data-facilitate-timer-custom`,
  `data-facilitate-timer-start`) and "Bring everyone here" (`data-facilitate-summon`),
  disabled on Map with a tooltip.
- Summon target: Freeform = the world point at the centre of the host's viewport + zoom
  (use the existing viewport/world helpers around CanvasClient 1961–2000 and
  `panByWorldDelta`/zoom setters — report which); other layouts = the first
  `[data-post-card-id]` whose card shell is in the host's view (top-most, then left-most).
  Receiving: Freeform pans/zooms to centre that point; other layouts call the existing
  `scrollToPostCard`. Then a toast "Moved to the host's view". If the post no longer exists:
  no move, no toast.
- CanvasClient: wiring only (hook call, two components, `case 'facilitate'`, the two
  summon helpers if they need CanvasClient state). Keep new logic out of it.

## Files
Create: the migration, `boardTimer.ts` (+test), `useBoardFacilitation.ts` (+test),
`BoardTimerPill.tsx` (+test), `FacilitatorMenu.tsx` (+test). Modify: `CanvasClient.tsx`,
`canvasToolbarRegistry.tsx`. Ask before touching anything else. Write the SQL, do NOT run
it. No git, no production build.

## Commit
  feat(facilitation): shared board timer and "Bring everyone here"

## Acceptance Criteria (PM, live — after the owner applies the SQL)
Owner tab + a guest (anonymous, via guest link) on a throwaway Columns board:
start 3 min → the guest's pill appears within 3 s and its remaining seconds match the
owner's ±1; pause → both show the same paused value; +1 min → both +60; stop → both
hide; the guest has no Facilitate tool and a direct `board_timer_start` RPC from the guest
is refused; the guest scrolled to the far right is brought to the owner's first visible
post on "Bring everyone here"; a guest that joins after the summon does not move.
Freeform: guest panned elsewhere lands centred on the owner's centre (±40 px) at the
owner's zoom. Timer finishing shows "Time's up". tsc clean; per-test gate unchanged.

## Required Tests
Timer math (running/paused/finished/idle, skew, formatting incl. ≥1 h), summon
validation, hook: unique topic, skew from board_clock, summon fires once / not for stale
/ not on mount / not for the host, actions call the right RPC with args; pill phases,
host-only controls, mute toggle survives a throwing localStorage; menu host-only, Map
disables summon.

## Estimated Difficulty
hard
