# PATCH-297 — Layout bugs found in the smoke check (Timeline, Columns)

Status: AUTHORIZED (owner, 2026-10-06: "please check, it has been a while since I worked on it … we might need to see
first if there are any bugs").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO, live smoke check: one new board per layout through the create page, kit, own tab, all deleted)
Wall, Grid and Map boards create, open and take their first item without errors. Three defects:
1. **Timeline: endless auto-create retry.** On first open an empty Timeline board auto-creates one blank entry
   (`CanvasClient.tsx` ~L6782 effect). When that create fails, the effect removes its "attempted" marker
   (`timelineAutoInitAttemptedRef.current.delete(canvasId)`, ~L6800) and the effect runs again on the next render —
   live, with writes failing, it fired **1,672 create attempts in two minutes**, each with an error toast. A brief
   network drop does the same for a real user.
2. **Columns: every new Columns board gets the columns "Attachment", "Body", "Testing".** They come from the create
   page's preview sample (`components/collabboard/canvas/CanvasSetupPage.tsx` L949–970, state `columns`; items
   "xcfasdcacasca", "sdsdsdsd"), which `handleSaveCanvas` writes as the real `board_sections`.
3. **Timeline: the "Layout: Vertical" button sits under the Board AI and wiki buttons** top-right
   (`components/canvas/TimelineHeaderBar.tsx` L40 `absolute top-2 right-2 z-30`; Board AI is `fixed right-4 top-4`,
   36 px wide, the wiki button under it).

## Design
1. Timeline auto-create: one attempt per board per page load. On failure keep the marker (no automatic retry) and
   show one toast "Could not create the first timeline entry. Use + to add one." (the `+` controls stay). Net growth
   ≤ 0 in `CanvasClient.tsx` (the `delete` line becomes the toast line or is removed).
2. Columns defaults: the three columns are "Column 1", "Column 2", "Column 3"; the preview sample items get readable
   sample titles ("First idea", "Second idea", "Third idea") and contents ("A note in this column."). String changes
   only (the file is over the ceiling: net 0).
3. Timeline header: `top-2 right-16` (left of the Board AI column). Nothing else moves.

## Tests
- Timeline: the auto-create runs once; a failing create is not retried on re-render (render the effect's host or
  test the extracted decision function — extract a small pure helper if that is the only testable way, in a new file
  under `lib/domain/canvas/`), and exactly one toast is shown.
- Columns: the save payload's sections are "Column 1/2/3" (or: the default `columns` state titles); no
  "Attachment"/"Body"/"Testing" in `CanvasSetupPage.tsx` (source test).
- Header: `TimelineHeaderBar` root has `right-16` and not `right-2`.
- Mutation: restore the `delete` on failure → the retry test fails; revert with the Edit tool.

## Allowed files
```
app/dashboard/canvas/[id]/CanvasClient.tsx                        timeline auto-create failure branch, net <= 0
components/collabboard/canvas/CanvasSetupPage.tsx                 default column and sample strings, net 0
components/canvas/TimelineHeaderBar.tsx (+ test)
new helper + test under lib/domain/canvas/ if needed; new test files next to the components
```
Forbidden: everything else, the database.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server, no browser.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-297.json
```
Do not commit.

**Live (CTO):** new Columns board → columns "Column 1/2/3"; new Timeline board with writes blocked → a handful of
attempts at most, one toast; with writes allowed → one blank entry; the Layout button is fully visible left of the
Board AI button; test boards deleted.

## Commit message (verbatim)
```
fix(board): timeline retry storm, sample column names, header overlap

A Timeline board no longer retries creating its first entry forever when
the save fails. New Columns boards start with Column 1, 2 and 3 instead
of test names. The Timeline layout button no longer hides under the
Board AI button.
```

## Final result (CTO, 2026-10-06, live)
Gate `.opencode-vitest-297.json`: 59/59 identical to 296a by name. Live (kit, own tab, boards deleted): a new Columns
board shows "Column 1", "Column 2", "Column 3"; a new Timeline board with writes blocked made **1** create attempt
in 30 s (was 1,672 in two minutes); its "Layout" button ends at x 1856, the Board AI button starts at 1868 (no
overlap). `CanvasClient.tsx` −4 net (the decision moved to `lib/domain/canvas/timelineAutoInit.ts`),
`CanvasSetupPage.tsx` net 0. Committed together with PATCH-296.
