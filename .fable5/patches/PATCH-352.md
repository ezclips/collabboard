# PATCH-352 — The Kanban Gantt draws cards one day short

## Why
Found by the PM in the PATCH-351 live check (2026-10-13); owner approved the
fix ("yes please"). A card due Wed 14 → Fri 16 shows in the Gantt as Wed–Thu,
and a one-day card (start = end, e.g. "Launch homepage" Wed 21 → Wed 21) gets
**no bar at all**. It affects every Kanban board with dates, not only AI plans.

## Facts (PM, verified in code)
- Everywhere outside the Gantt a card's `end_date` is the **last day of the
  work, included**: the card face shows "start - end"
  (`components/kanban-canvas/Card.tsx`), the editor calls it the end date
  (`Editor.tsx`), Board AI plans and checks dates that way (PATCH-351), and the
  Gantt's own "New task" modal saves the chosen end day as `end_date`.
- DHTMLX Gantt's `end_date` is **exclusive** (the moment the task ends = the
  start of the next day). `components/gantt-canvas/mappers.ts` passes the card
  date through unchanged in both directions:
  - `mapCardToGanttTask`: `end_date = card.end_date` → one day short; start =
    end → duration 0 → no bar.
  - `mapGanttTaskToCardPatch`: writes the Gantt's exclusive end back as the
    card's end → after a drag in the Gantt the card face shows one day MORE.
    (It only looked right because both directions are wrong by the same day.)

## Design — convert at the boundary, in `mappers.ts` only
The card keeps inclusive dates (nothing else in the app changes). The Gantt
keeps its exclusive dates (no DHTMLX config change). The two mappers convert.

### Card → Gantt (`mapCardToGanttTask`)
- Card with start and end: Gantt `end_date = card end + 1 day`.
- Card with only a start: one day (`start + 1`) — as today.
- Card with only an end: start = that day, Gantt end = that day + 1.
- End before start (bad data): treat as a one-day task at the start.
- `duration` = days between Gantt start and Gantt end, at least 1.
- Unchanged: undated cards (`unscheduled`, PATCH-320), milestones
  (`duration 0`, `end_date = start_date`), parent, colour, progress.
- An end that is a **timestamp at exactly 00:00 local time** and later than the
  start (a Scheduler event ending at midnight) counts as the PREVIOUS day, so
  it does not gain a day. Date-only strings (`YYYY-MM-DD`) are never shifted
  by this rule.

### Gantt → card (`mapGanttTaskToCardPatch`)
- Card `end_date` = Gantt `end_date − 1 day`, never before the start date.
- No Gantt end: `start + duration − 1` days (duration at least 1), so a
  one-day task saves start = end.
- Unchanged: milestones (end = start), unscheduled tasks write no dates.

### Round trip
`mapGanttTaskToCardPatch(mapCardToGanttTask(card))` returns the card's own
dates for any dated card (one-day, multi-day, across month and year ends).

### "New task" modal day count (`NewTaskModal.tsx`)
`calculateDaysDisplay` shows `Days 0` for a task due today. With inclusive
dates it is `days between + 1` (today → today = "Days 1"): add a small exported
helper `countInclusiveDays(start, end)` to `dateUtils.ts` and use it. Display only; what
the modal saves is already inclusive and stays as is.

## Tests
- `mappers` (new `lib/infra/gantt/ganttEndDates.test.ts` — vitest does NOT run
  `components/gantt-canvas/*.test.*`, a test there would silently not run):
  - 14 → 16 Oct card → Gantt end 17 Oct, duration 3.
  - 21 → 21 Oct card → Gantt end 22 Oct, duration 1 (it gets a bar).
  - only start; only end; end before start; month end (31 Jan → 1 Feb) and
    year end (31 Dec → 1 Jan).
  - Timestamp end at local midnight → previous day; date-only end never
    shifted; timestamp end at 10:00 → that day.
  - Gantt → card: end 17 Oct → card end 16 Oct; end = start + 1 → one-day card;
    no end with duration 3 → start + 2; end not after start → card end = start.
  - Round trip returns the same dates (several cases).
  - Milestones and unscheduled tasks unchanged.
- Existing tests that encoded the old rule are updated, each with a one-line
  comment naming PATCH-352 (this is a rule change, not a weakened test):
  - `lib/infra/gantt/dateDefaults.test.ts` "initializes an existing gantt item
    from persisted dates exactly" → Gantt end `2026-12-02` (card end 1 Dec is
    included).
  - `components/collabboard/ganttLightboxUnscheduled.test.tsx`: lightbox end
    3 Feb (exclusive) → card end `2026-02-02`.
  - Any other test that breaks: report it before changing it.
- `countInclusiveDays`: same day = 1, Wed → Fri = 3 (in `ganttEndDates.test.ts`).

## Verification
tsc, focused tests, full gate. Live (PM) on a THROWAWAY Kanban board: a
3-day card (Wed → Fri) and a one-day card; open the Gantt; the 3-day bar
covers three day cells and the one-day card has a one-cell bar (measured from
the DOM bar width vs one day-cell width). Drag the 3-day bar one day right in
the Gantt (Wed → Fri becomes Thu → Sat); read back from the DB:
`date_started`/`date_due` move by exactly one day and the card still spans
3 days.

## Allowed files
`components/gantt-canvas/mappers.ts`, `components/gantt-canvas/NewTaskModal.tsx`,
`components/gantt-canvas/dateUtils.ts`,
new `lib/infra/gantt/ganttEndDates.test.ts`,
`lib/infra/gantt/dateDefaults.test.ts`,
`components/collabboard/ganttLightboxUnscheduled.test.tsx`,
`components/collabboard/ganttUndated.test.tsx` (only if it breaks — report).
No `vitest.config.ts` change.
No SQL, no git.

## Addendum 1 — the midnight rule must not touch stored date-only values (PM review)
The database stores `date_due` as `timestamptz`, so a date-only due date comes
back to the client (via `normalizeDateInput` in `kanban-canvas/store.tsx`) as
`2026-10-23T00:00:00.000Z`. For a viewer whose clock is on UTC (UK, Portugal,
Iceland in winter, many servers/VMs) that IS local midnight, so
`inclusiveEndDay` moves it back a day → a Wed–Fri card draws Wed–Thu again
(the very bug this patch fixes). The live check passed only because the PM's
browser is not on UTC.

Fix in `inclusiveEndDay`: a timestamp at exactly **UTC midnight**
(`getUTCHours/Minutes/Seconds/Milliseconds` all 0) is a stored date-only value
and is never shifted by the midnight rule. The "local midnight = previous day"
rule applies only to timestamps that are local midnight but NOT UTC midnight
(a Scheduler event ending at midnight for a viewer off UTC). Trade-off, write
it in the comment: for a UTC viewer a Scheduler event ending exactly at
midnight is one day longer in the Gantt — rare, and far better than every
date-only card being one day short.

Tests (`lib/infra/gantt/ganttEndDates.test.ts`): run the end-day cases under
both `process.env.TZ = 'UTC'` and `process.env.TZ = 'Europe/Berlin'` (set in
the test, restore afterwards; if Node ignores a runtime TZ change on this
platform, say so and add the cases as explicit-offset strings instead):
- `2026-10-21T00:00:00.000Z` → `2026-10-23T00:00:00.000Z` card (the stored
  form) → Gantt start 21 Oct, end 24 Oct (3 days) in BOTH zones.
- Berlin: `2026-10-14T22:00:00.000Z` (local midnight, not UTC midnight) as an
  end after a start on 14 Oct → inclusive end 14 Oct.
- Round trip of the stored form returns the same calendar days.
Allowed files: `components/gantt-canvas/mappers.ts`,
`lib/infra/gantt/ganttEndDates.test.ts`. No git.
