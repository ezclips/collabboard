# PATCH-351 — Board AI plans dates on Kanban (level 3), you approve the plan

## Why
Owner approved level 3 of Board AI on Kanban (2026-10-13, "yes"). The level as
offered on 2026-10-08: "the AI proposes a schedule: it spreads cards over days
in the calendar and Gantt, respecting links between cards, and you approve the
plan." Level 2 (PATCH-350) already lets the model propose `update` changes with
`startDate`/`endDate`; what is missing is what a plan needs: today's date, the
dependencies, a check that the plan respects them, and a plan-shaped review.

## Facts the design rests on (PM, verified in code)
- Links: table `kanban_links (from_card_id, to_card_id, relation)`; in the
  client `masterId = from`, `slaveId = to`. The Gantt maps them
  (`components/gantt-canvas/mappers.ts` `RELATION_TO_GANTT`):
  `Depends on`/`blocks` → finish→start, `Starts with` → start→start,
  `Finishes with` → finish→finish, `Start to Finish` → start→finish;
  `Relates to` is only a fallback there. For PLANNING, only the four real
  dependency types count; **`Relates to` is never a constraint.**
- Kanban cards' dates feed the Kanban Gantt and Scheduler views, so applying a
  plan updates them with no extra work.
- The Board AI system prompt has no "today".

## Design

### 1. Overview lines carry dependencies (`lib/server/ai/boardAiKanbanContext.ts`)
Each `kanban-board` overview line gains, when the card is the TARGET of a
dependency link, ` · after S2.3` (finish→start), ` · starts with S2.3`,
` · finishes with S2.3`, ` · start-to-finish S2.3`, using the master card's
sub-token from the SAME overview. Links to cards not in the overview are left
out. `Relates to` adds nothing. Budget rules unchanged. The reader also
returns the dependency list `{ masterCardId, slaveCardId, type }` to the route.

### 2. Today and planning rules in the prompt
- Add `Today is YYYY-MM-DD.` to the Board AI system prompt on Kanban turns
  (server date in UTC; document that).
- Extend `KANBAN_CHANGE_INSTRUCTIONS` (Kanban turns only): when asked to plan
  or schedule, propose `update` changes with `startDate`/`endDate`; respect
  every `after/starts with/finishes with/start-to-finish` constraint; plan on
  working days (Mon–Fri) unless the user says otherwise; never schedule a
  start before today unless the card already has that date; keep existing
  dates unless they must move or the user asks; reasonable durations if none
  given; say briefly in the answer why the order is what it is. Wording stays
  a PROPOSAL (PATCH-350 Addendum 1).

### 3. Plan check (`lib/domain/ai/kanbanChangeProposals.ts`, pure)
`checkKanbanPlan(changes, { cards (id, startDate, endDate), dependencies,
today })` → for each change a list of plain-words warnings, computed on the
board AS IT WOULD BE after applying ALL proposed changes:
- finish→start: slave.start must be after master.end ("starts before
  “Design homepage” ends, which it depends on");
- start→start: slave.start ≥ master.start; finish→finish: slave.end ≥
  master.end; start→finish: slave.end ≥ master.start;
- start before today (and the card did not already start then);
- end before start (already rejected by the parser — keep).
A card with no dates on one side of a link → no check for that link.
The route attaches `warnings: string[]` to each resolved change.

### 4. Review UI (`KanbanProposedChanges.tsx` / `KanbanMessageProposals.tsx`)
- When the proposals contain **2 or more date changes**, the list title is
  "Proposed schedule (N)" and the date changes are sorted by start date, each
  label like "“Design homepage”: Tue 14 Oct → Thu 16 Oct" (the existing label
  helper, extended with weekday). Other changes follow below as today.
- A change with warnings shows them in amber under its label and is
  **unticked by default**; the user may still tick it.
- Apply is unchanged (sequential store updates, per-change results).
- Small button style from PATCH-349 is already used; keep it.

## Tests
- Context: overview lines get `after S2.3` etc. for the four types, nothing for
  `Relates to`, nothing for targets outside the overview; dependency list
  returned.
- Prompt: `Today is` present on Kanban turns only; planning rules present.
- `checkKanbanPlan`: each of the four types violated / satisfied, using
  proposed dates merged over current ones; past-start warning; missing dates
  skip; `Relates to` never warns.
- UI: "Proposed schedule" title at ≥2 date changes; sorted by start;
  warnings shown and unticked by default; plain list otherwise unchanged.
- Route: warnings attached; non-Kanban turns byte-identical.

## Verification
tsc, focused tests, full gate. Live (PM) on a THROWAWAY Kanban board: 4 cards
with links "Design → Build" (Depends on) and "Build → Launch" (Depends on), no
dates; ask "Plan these over the next two weeks" → a "Proposed schedule" whose
order respects the links, working days only, no warnings → Apply → cards carry
the dates (read back from the DB) and the Kanban Gantt shows them in order.
Then a demo for the owner to watch (they asked to see how it is done).

## Allowed files
`lib/server/ai/boardAiKanbanContext.ts` (+ test), the Board AI prompt module
(`lib/server/ai/boardAiChatExecution.ts` + test),
`lib/domain/ai/kanbanChangeProposals.ts` (+ test),
`app/api/boards/[id]/ai/chat/route.ts` (+ `lib/server/ai/boardAiKanbanRoute.test.ts`),
`components/kanban-canvas/KanbanProposedChanges.tsx`,
`components/kanban-canvas/KanbanMessageProposals.tsx` (+ their tests),
`lib/domain/ai/boardAiChatClient.ts` (the `warnings` field). No SQL, no git.
