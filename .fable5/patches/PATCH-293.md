# PATCH-293 — Finished board templates: engine, "Choose a template" picker, Project Plan

Status: AUTHORIZED (owner, 2026-10-06: "I need some templates from you finished for the freeform canvas, including
images text and clipart … Unlike milanote I don't want a version without the images/finished look" → CTO proposed
eight finished templates, a picker on new boards, and retiring "Template 1" → "Yes list them under FreeForm Canvas
since I might get some made for the other … canvases as well").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

This patch builds the engine, the picker and the FIRST finished template (Project Plan). The other seven
(Moodboard, Creative Brief, Character Profile, Weekly Plan, Trip Planner, Event Plan, Product Launch) follow as data
only in PATCH-294.

## Facts (CTO-checked)
- Today's only template is `lib/collabboard/templates/template1.ts` ("Template 1" button on `app/dashboard/page.tsx`,
  `handleCreateTemplate1`). Its example copy mirrors Milanote's own demo board (Papa Pizza), it writes straight to
  Supabase from a browser module (CLAUDE.md rule 1), and it creates the board itself. Its images
  `public/templates/{mascot,mockup,moodboard,packaging}.png` and the three `media__*.png` files are referenced by
  nothing else (CTO grep; re-check). `app/api/billing/usage/route.ts` L47 mentions `template1.ts` in a comment only.
- Board creation lives in `CanvasSetupPage.tsx` (1,537 lines, direct inserts). The picker therefore does NOT create
  boards: it fills an EMPTY freeform board the user just created, the way Milanote's "Choose a template" panel does.
- New posts appear without a refresh: `useCanvasData.ts` ~L296 subscribes to `postgres_changes` on `padlets` for the
  board.
- Post writes go through `PostsRepository` (`lib/infra/canvas/postsRepository.ts`: `insert`, `insertReturning`,
  geometry rounded) and domain commands built with `defineCommand` (`lib/domain/canvas/posts.ts`,
  `lib/domain/CONVENTIONS.md`: zod input, `Result`, error codes, branded ids).
- Row shapes as the app writes them (CTO capture of a live board + `CanvasClient.tsx` ~L3740–3900 and ~L7581):
  - note: `type 'text'`, `content` is HTML (`<p>…</p>`), metadata may hold `cardColor`, `parentId`.
  - to-do: `type 'todo'`, `title`, `content` = JSON array of tasks `{ id, text, completed, dueDate? }`
    (`TodoEditor.tsx` `Task`).
  - table: `type 'table'`, `title`, `content` = the JSON `TableEditor.tsx` reads (`{ rows: string[][], … }` — read
    the editor for the exact keys it saves, including column widths/header handling).
  - image: `type 'image'`, `file_url` and `metadata.imageUrl` = the image URL (`resolveImagePostDisplaySrc` shows
    `metadata.imageUrl`); `title`/`metadata.caption` for the caption.
  - clipart: `type 'card'`, `title`, `content ''`, `width 180`, `height 220`, metadata
    `{ svgUrl, iconColor, iconBgColor, counterType: 'words' }` (`handleFreeformCardDrop`).
  - column: `type 'container'`, metadata `{ isContainer: true, orientation: 'vertical', childPadletIds: [...ordered],
    cardColor?, topStrip? }`; each child carries `metadata.parentId` (read `lib/domain/canvas/containerModel.ts` and
    `containers.ts`).
- Edit authority on the board: `canEditBoardContent` in `CanvasClient.tsx` (~L547). Freeform detection:
  `isFreeformLayout` (~L1527). CanvasClient is 12,207 lines: net growth 0.
- Template assets are already in place (CTO): `public/templates/freeform/project-plan/` — `cafe-plants.jpg`,
  `latte-art.jpg`, `terrace.jpg`, `website-laptop.jpg`, `barista.jpg` (Pexels, resized), `bullseye.svg`,
  `hot-beverage.svg`, `artist-palette.svg`, `rocket.svg` (Iconify Fluent Emoji, MIT), `credits.json` (source,
  author, page and licence of every file). Same-origin static files: no outside host at runtime.

## Design
### 1. Template data and the command — `lib/domain/canvas/boardTemplates.ts` (new, ≤ 300 lines)
- Zod schema `boardTemplateSchema`: `{ id: kebab string, name, layout: 'freeform', previewUrl?: string,
  posts: TemplatePost[] }`. `TemplatePost` is a discriminated union on `kind`:
  `column` (`key`, `title`, `x`, `y`, `width`, `height?`, `topStrip?`), and the content kinds `note` (`html`),
  `todo` (`tasks: { text, done }[]`), `table` (`rows: string[][]`, first row = header), `image` (`src`,
  `caption?`), `clipart` (`svg`, `iconBgColor`, `iconColor?`) — each with `title`, and EITHER `parent` (the key of a
  column, then no position) OR `x`, `y`, `width?`, `height?` (a free post). Keys unique; a `parent` must name a
  column; `src`/`svg` must start with `/templates/` (no outside URLs).
- `buildTemplateRows(boardId, template, newId)`: pure. Returns the rows to insert, columns first, each child with
  `metadata.parentId`, each column with its ordered `childPadletIds` already filled (ids generated up front with
  `newId`), shapes exactly as in Facts. Generated task ids are stable within one build.
- `createApplyBoardTemplateCommand(repository)` (`board.applyTemplate`): input `{ boardId, template }` (schema
  validated). Inserts the rows in order through the repository. If any insert fails, deletes the rows it already
  inserted (repository delete, the same path as the existing delete-posts command) and returns an error with code
  `template_apply_failed`; never a throw, never a half-filled board left silently.
- The command does not check emptiness or authority itself; the caller only offers it on an empty board to an
  editor, and RLS still decides every insert.

### 2. The registry — `lib/collabboard/templates/registry.ts` + `lib/collabboard/templates/freeform/projectPlan.ts`
- `BOARD_TEMPLATE_GROUPS: { layout: LayoutType; label: string; templates: BoardTemplate[] }[]` with ONE group now:
  `{ layout: 'freeform', label: 'Freeform canvas', templates: [PROJECT_PLAN] }`. `templatesForLayout(layout)`
  returns the group or `null`. Later layouts add a group; nothing else changes.
- `projectPlan.ts` holds the Project Plan below, as data, validated by the schema in a test.

### 3. The picker — `components/collabboard/templates/BoardTemplatePicker.tsx` (new, ≤ 250 lines)
- Props: `boardId`, `layout`, `postCount`, `canEdit`, `onApplied?`. Renders nothing unless
  `templatesForLayout(layout)` exists, `canEdit`, posts have loaded and `postCount === 0`, and the picker was not
  dismissed for this board (localStorage `fable.templatePicker.dismissed.<boardId>`, every access in try/catch;
  without storage it simply shows again next visit).
- A panel fixed at the right edge, below the board header (does not cover the Board AI button), white, 1 px
  `#e5e7eb` border, radius 12, shadow, width 280: title "Choose a template", close ×; group label (the group's
  `label`, "Freeform canvas"); rows "Empty board" and one per template (keyboard focusable, `aria-pressed` on the
  selected one); when a template has a `previewUrl`, a large preview image shows to the LEFT of the panel while that
  row is selected/hovered. Footer button "Use this template" (disabled for "Empty board" → the button reads
  "Start empty" and dismisses).
- Use: runs the command with the selected template; button shows "Adding…" and is disabled; on success the panel
  closes (the posts arrive through realtime) and dismissal is stored; on error an inline message "The template could
  not be added. Nothing was changed — try again." and the button is enabled again.
- `data-board-template-picker`, rows `data-board-template-row="<id|empty>"`, button `data-board-template-apply`.

### 4. Mount — `CanvasClient.tsx`, net growth 0
Render `<BoardTemplatePicker …/>` once, as a shell-level sibling next to `<BoardWikiDrawer`, with
`layout={canvas?.layout}`, `postCount={padlets.length}`, `canEdit={canEditBoardContent}` and the loaded flag the
file already has for posts. Keep the file's line count unchanged (condense the adjacent wiki-drawer comment without
losing its meaning). Report the net line count.

### 5. Retire "Template 1"
Remove the dashboard button, `handleCreateTemplate1` and its state/imports from `app/dashboard/page.tsx`, delete
`lib/collabboard/templates/template1.ts`, delete the seven `public/templates/*.png` files after re-checking with `rg`
that nothing references them, and fix the comment in `app/api/billing/usage/route.ts` L47. Do not touch
`public/templates/freeform/**`.

### 6. Project Plan (exact content; all assets under `/templates/freeform/project-plan/`)
Columns (width 340, at y 60): **Brief** x 60 strip `#6366f1`; **Inspiration** x 440 strip `#10b981`; **Design**
x 820 strip `#ec4899`. Children in this order:
- Brief:
  1. note "Fern & Fig Café — new website": `<p><strong>Goal:</strong> a warm, simple website with online
     ordering.</p><ul><li>Show the seasonal menu and the garden terrace</li><li>Order ahead for pick-up</li>
     <li>Launch before the summer season</li></ul><p>⭐ It must feel great on a phone.</p>`
  2. clipart "Goals" — `bullseye.svg`, bg `#fde68a`
  3. to-do "Milestones": Kickoff with the owners ✓; Collect menu texts and photos ✓; Wireframes for five pages;
     Design review with the owners; Build online ordering; Launch and tell the regulars
  4. clipart "Launch" — `rocket.svg`, bg `#bfdbfe`
- Inspiration:
  1. image "Coffee is the star" — `latte-art.jpg`
  2. note "Mood": `<p><em>“Warm, green and unhurried — like a Sunday morning.”</em></p>`
  3. image "The garden terrace" — `terrace.jpg`
  4. clipart "Menu photos" — `hot-beverage.svg`, bg `#fed7aa`
- Design:
  1. image "Order page draft" — `website-laptop.jpg`
  2. note "Colours & type": `<ul><li>Fern green #2F5D3A</li><li>Fig plum #6B3E5E</li><li>Cream #F6F1E7</li></ul>
     <p>A friendly serif for headings, a clean sans for text.</p>`
  3. clipart "Brand kit" — `artist-palette.svg`, bg `#fbcfe8`
  4. image "Team portraits" — `barista.jpg`
Free posts:
- image "Fern & Fig Café" — `cafe-plants.jpg`, x 1200, y 60, width 440, height 294
- table "Budget", x 1200, y 400, width 440: header Phase | Hours | Cost; rows Discovery & content | 10 | $900;
  Design (five pages) | 24 | $2,160; Build & online ordering | 40 | $3,600; Launch & training | 6 | $540;
  Total | 80 | $7,200
Column heights: whatever the container code needs to show its children without clipping (read how freeform
containers size; if height is fixed, size it to fit). No `previewUrl` yet (the CTO adds the screenshot after the
live check).

## Tests
- `boardTemplates.test.ts`: the schema accepts Project Plan; rejects an outside `src` (`https://…`), a `parent`
  naming no column, duplicate keys, a child with both `parent` and `x`. `buildTemplateRows`: columns first; every
  child's `parentId` = its column id; each column's `childPadletIds` = its children in order; each kind's row shape
  as in Facts (note HTML in `content`; todo JSON tasks with `completed`; table JSON readable by the same parser the
  TableEditor uses; image `file_url` + `metadata.imageUrl`; clipart `type 'card'` with `svgUrl`); every row has the
  board id; no row carries an id twice.
- Command: all inserts succeed → ok with the count; the 3rd insert fails → the first two are deleted and the result
  is `template_apply_failed`; invalid input → validation error, no insert.
- Registry: `templatesForLayout('freeform')` has label "Freeform canvas" and Project Plan; `'wall'` → null; every
  `src`/`svg` of every template exists under `public/` (fs check) and has an entry in that folder's `credits.json`.
- Picker (RTL): hidden for viewers, for non-empty boards, before posts load, for non-freeform layouts, after
  dismissal; shows "Freeform canvas", "Empty board" and "Project Plan"; Use → calls the command once, shows
  "Adding…", closes on success and stores dismissal; error → message, button enabled, not dismissed; "Start empty"
  dismisses without a command; localStorage throwing → still works.
- Source tests: `CanvasClient.tsx` mounts `BoardTemplatePicker` once; the dashboard has no "Template 1";
  `template1.ts` is gone.
- Mutation: drop the rollback → the failure test fails; revert with the Edit tool.

## Allowed files
```
lib/domain/canvas/boardTemplates.ts (+ test)                         new
lib/collabboard/templates/registry.ts, freeform/projectPlan.ts (+ tests)   new
components/collabboard/templates/BoardTemplatePicker.tsx (+ test)    new
app/dashboard/canvas/[id]/CanvasClient.tsx                           mount only, net 0
app/dashboard/page.tsx                                               remove Template 1
lib/collabboard/templates/template1.ts                               delete
public/templates/*.png (7 files)                                     delete after rg check
app/api/billing/usage/route.ts                                       comment only
the infra wiring needed to give the command a PostsRepository (reuse createPostsRepository)
```
Forbidden: everything else, `public/templates/freeform/**` (CTO assets), the database, migrations.
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
timeout 600 npx vitest run lib/domain/canvas/boardTemplates lib/collabboard/templates components/collabboard/templates --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-293.json
```
Do not commit.

**Live (CTO, `scripts/live/kit.mjs`, own tab):** create a new freeform board through the normal create page; the
picker shows "Freeform canvas" → Project Plan → Use → every post appears (3 columns with their children in order, 5
photos, 4 clipart tiles, 1 to-do with 2 done, the budget table), nothing clipped, no request to an outside host; a
reload keeps it all and shows no picker; a viewer / a non-empty board shows no picker. Screenshot →
`preview.jpg`. Delete the test board afterwards.

## Commit message (verbatim)
```
feat(board): finished templates for the freeform canvas

A new, empty freeform board now offers "Choose a template". The first
finished template, Project Plan, fills the board with columns, notes, a
to-do list, a budget table, photos and clipart. The old Template 1
button, which copied another product's demo board, is gone.
```

## Addendum 1 (CTO, 2026-10-06, live)
Gate `.opencode-vitest-293.json` 59/59 identical to 292b; review OK (error-code maps in four routes are the
exhaustive `Record` the new code requires; `moodboard.png` correctly kept — e2e fixtures use it).
**Defect (live):** the picker hides itself as soon as the FIRST template post arrives through realtime
(`postCount > 0`), i.e. while the command is still inserting. The apply promise continues, but the "Adding…" state
and, worse, the failure message ("Nothing was changed — try again") can never be shown, and a user sees the panel
vanish after one post. Fix in `BoardTemplatePicker.tsx`: while an apply is in flight the panel stays mounted and
visible regardless of `postCount`; it closes only when the command resolves ok, and on error it stays with the
message even though `postCount` is now > 0 (the rows were rolled back; realtime deletes bring the count back to 0).
Test: start an apply, rerender with `postCount 3` before the command resolves → panel still shown with "Adding…";
resolve ok → closed; same with an error → message shown. Gate `--outputFile=.opencode-vitest-293a.json`.

## Addendum 2 (CTO, 2026-10-06, live after Addendum 1)
Gate `.opencode-vitest-293a.json` 59/59. Live, own tab, new freeform board (`a38f4adc`, deleted afterwards): the
picker shows "Freeform canvas" / "Empty board" / "Project Plan"; Use → "Adding…" → all **17 inserts 201** in ~1 s →
panel closes. Two defects:
1. **Nothing appears until a reload.** 4 s after success the board still rendered 0 posts; after a reload all 17 are
   there. The realtime echo cannot be relied on for this (not investigated further here). Fix: on success the picker
   calls `onApplied()`; `CanvasClient` passes `onApplied={() => { void fetchData(); }}` on the EXISTING mount
   (`fetchData` already comes from `useCanvasData`; keep net growth 0 — e.g. put two short props on one line).
   Test: success → `onApplied` called once, after the command resolved; error → not called.
2. **Sizes are ignored.** Stored: columns 340×800, table 440 wide, hero image 440×294; rendered: columns 360×400
   (children scroll inside), table 180×140, i.e. the defaults. The board honours a stored size only with
   `metadata.manualSize === true` (`postResizePolicy.ts` ~L130 `isManuallySizedPost`). Fix in `buildTemplateRows`:
   every row whose template post states `width` or `height` (columns and free posts) gets `manualSize: true` in its
   metadata; children inside a column do not. Test: column, free image and table rows carry `manualSize: true`; a
   column child does not.
Column heights stay as they are; the CTO measures the content live and tunes the data afterwards.
Gate `--outputFile=.opencode-vitest-293b.json`.

## Addendum 3 (CTO, 2026-10-06, live after Addendum 2)
Gate `.opencode-vitest-293b.json` 59/59. Live (board `bf456410`): posts now appear right after Use (no reload), all 9
template images load from our origin, no outside host; the board's own follow-up writes (17 × PATCH 204) only assign
`zIndex` — fine. Still wrong:
1. **Columns show a 300 px scroll window.** `RowColumnContainerCard` caps the child list at `max-h-[300px]` unless
   the container is expanded, and expansion is local state only (`expandedContainers`, `FreeformPadletCards.tsx`
   L1163, never persisted by design). Stored height is irrelevant for a container. CTO decision: a container whose
   `metadata.startExpanded === true` STARTS expanded; the user can still collapse it (session state as today);
   nothing else changes for existing boards. In `FreeformPadletCards.tsx` (over the ceiling: net growth 0) make the
   default of `expandedContainers[padlet.id]` read `padlet.metadata?.startExpanded === true` instead of `false` at
   L3813 and L4463, and make the toggle at ~L3934 flip from that same default (not from `undefined`). In
   `buildTemplateRows` every column gets `startExpanded: true`. Tests: a container with `startExpanded` renders its
   whole child list without the 300 px cap (or: the `isExpanded` prop passed to `RowColumnContainerCard` is true);
   toggling it once collapses it; a container without the flag is unchanged; the builder test asserts the flag.
2. **Container width** is at least 360 (`Math.max(width, 360)`, L3766): Project Plan columns become width 360 at
   x 60 / 460 / 860; the free posts move to x 1260.
3. **The table renders at the 180 px default.** `isManuallySizedPost` needs BOTH width and height; the table has no
   height. Project Plan's table gets `height: 240`.
Gate `--outputFile=.opencode-vitest-293c.json`.

## Addendum 4 (CTO, 2026-10-06, live after Addendum 3)
Gate `.opencode-vitest-293c.json` 59/59; `FreeformPadletCards.tsx` 3 lines changed, net 0. Live (board `d23f86a1`):
columns now open expanded with no inner scroll (708 / 942 / 950 px tall at 80 % zoom), the table is 440 wide, all 9
images load. **Defect:** the to-do card inside the Brief column shows its raw JSON. Every to-do renderer reads
`metadata.tasks` (`PostCardContent.tsx` L454, `FreeformPadletCards.tsx` L4221) and the title from
`metadata.todoTitle`; the app's own create path writes both (`CanvasClient.tsx` ~L3791 builds the content from
`draft.metadata.tasks` and keeps the metadata). Fix in `buildTemplateRows`: a todo row also carries
`metadata.tasks` (the same task objects as `content`) and `metadata.todoTitle` (= its title). Test: both present
and equal to the content JSON. Gate `--outputFile=.opencode-vitest-293d.json`.

## Final result (CTO, 2026-10-06, live)
Gate `.opencode-vitest-293d.json`: 59/59 identical to 292b by name; tsc clean (coder). Kit run, own tab, a new
freeform board created through the normal create page (`492d3368`, deleted afterwards, 200): the picker lists
"Freeform canvas" → Empty board / Project Plan; Use → 17 inserts, all 201; the posts show without a reload; after a
reload: 9/9 template images loaded, no to-do shown as JSON (checklist with 2 of 6 done), no clipped scroll area, the
picker does not come back; requests only to our origin and Supabase. The picker does not show on a non-empty board
(af02972f). Not verified live: a viewer (no second account in the shared browser) — covered by the picker test.
Net growth: `CanvasClient.tsx` 0, `FreeformPadletCards.tsx` 0. Test boards from the defect runs (33eed4c8, b0ae401d,
9abf3592, a38f4adc, bf456410, d23f86a1) were all deleted (200). Seven more templates follow in PATCH-294; previews
are added there.
