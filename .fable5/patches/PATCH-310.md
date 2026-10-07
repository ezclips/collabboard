# PATCH-310 — Gantt on the MIT Community edition (dhtmlx-gantt 10)

Status: AUTHORIZED (owner, 2026-10-07: "Yes to 1 and 2 you are the PM" — 1 = upgrade the Gantt to its MIT version).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode) for the code; CTO for the dependency
Branch: `feature/board-retrieval`

## Facts (CTO)
- Installed `dhtmlx-gantt` 9.1.1 is GPL-2.0 (`node_modules/dhtmlx-gantt/license.txt`); LESSONS_LEARNED standing risk 2.
- From 10.0 the public `dhtmlx-gantt` npm package is the Community edition under MIT (npm: 10.0.3, `license: MIT`;
  `gantt.license === "mit"` live). The migration guide: no public API change; the Community edition does NOT contain
  undo/redo, markers, multiselect, unscheduled tasks, working-time calendars, WBS codes (and PRO auto-scheduling,
  critical path, resources). Date `*_start` helpers no longer mutate.
- Our code (`components/gantt-canvas/*`) uses none of those except `gantt.plugins({ undo: true, … })` in
  `GanttConfig.ts` ~L302; `gantt.undo()` is never called; `auto_scheduling` is set to `false`; no date helpers.
- CTO already ran `npm install dhtmlx-gantt@^10.0.3` (package.json + lock). `tsc` is clean against it.
- Live on v10 (test Gantt board): add task (POST kanban_cards), move bar (PATCH, survives reload), resize, link
  (POST kanban_links), delete (DELETE) all work; no console errors.
- Pre-existing, NOT part of this patch (same on 9.1.1): an inline rename in the grid does not save.

## Design
`components/gantt-canvas/GanttConfig.ts`: remove `undo: true` from the `gantt.plugins({...})` call (keep the other
plugins exactly). Nothing else.

## Tests
A source test `lib/domain/canvas/ganttCommunityEdition.source.test.ts`: `package.json` declares `dhtmlx-gantt` with a
major version ≥ 10; the installed `node_modules/dhtmlx-gantt/package.json` license is `MIT`; `GanttConfig.ts` does not
enable `undo`.

## Allowed files
`components/gantt-canvas/GanttConfig.ts` and the new test. Same rules as before (no installs, no git writes). Run only
the new test, any existing `components/gantt-canvas` tests, and `npx tsc --noEmit`.

## Commit message (verbatim)
```
chore(gantt): move to the MIT-licensed dhtmlx-gantt 10 Community edition

dhtmlx-gantt 9 was GPL-2.0, which a closed-source app cannot ship. From
version 10 the public package is MIT. Our Gantt uses no feature the free
edition drops; the unused undo plugin is no longer requested.
```

## Final result (CTO, 2026-10-07, live on v10)
`gantt.license === "mit"`. Test Gantt board: add task (POST), move bar (PATCH, survives reload), resize, link (POST kanban_links), delete (DELETE); no console errors. Same pre-existing behaviour as 9.1.1 checked side by side: inline grid rename does not save (separate follow-up). Gate `.opencode-vitest-310.json`: 26 baseline + 3 files that pass alone (load timeouts); tsc clean.
