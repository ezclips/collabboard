# PATCH-301 — The "New board" page: formats, templates in a large gallery, and boards that open filled in

Status: AUTHORIZED (owner, 2026-10-06, on mockup v2/v3 https://claude.ai/artifact/RddA2hGREfmSYvoaFafwnb: "Yes much
better! you can remove the top button"; earlier: icons must fit the app, background needs the full picker behind a +,
Freeform is the research board, a shuffle animation through the formats, templates in a big modal).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Follow-up: PATCH-302 adds the Research template (first Freeform template) — NOT in this patch.

**Design reference:** `.fable5/patches/PATCH-301-mockup.html` (the approved mockup's source; preview images are
stripped, `PREVIEWS` is empty). Copy, layout, spacing, the format illustrations (`MINI`), the animation positions
(`POS`) and the behaviour come from there. Where this spec and the mockup differ, this spec wins.

## Facts (CTO)
1. `/dashboard/create-canvas` renders `components/collabboard/canvas/CanvasSetupPage.tsx` (1537 lines, nothing else
   uses it). Live defects: the two switches are white on white (invisible), "Save Canvas" looks like plain text, the
   format dialog's Preview shows grey skeletons, Map is described as "Mind map layout", Columns as "Kanban-style
   columns", and after saving it goes back to `/dashboard` instead of opening the board.
2. Its create logic (`handleSaveCanvas`, create branch, L1061–1206): auth check → `resolveCurrentWorkspace` →
   `getWorkspaceEntitlements` → active board count → `canCreateBoardForEntitlements` (message "Free plan allows up to 3
   active boards. Upgrade to Pro to create more.") → insert `boards` (title, description, layout, background_type,
   background_value, comments_enabled, new_posts_at_top, reactions_enabled: true, user_id, workspace_id, thumbnail) →
   upsert `kanban_board_members` owner/admin → Gantt: 3 `kanban_columns` (To Do / In Progress / Done) → Columns or
   Table: `board_sections` "Column 1/2/3" (`description: Column n`, `position: n`).
3. Board icon = `boards.thumbnail` string: an emoji, or an image URL (`CanvasTitleHeader.tsx` L33–39 renders `http…`
   as `<img>`, anything else as text). `IconSelector.tsx` (emoji picker + upload / link / Pexels / GIF / Drive /
   OneDrive). `WallpaperSelector.tsx` = colours (18), gradients (9), photos, textures, upload, Drive, OneDrive.
4. Templates: `lib/collabboard/templates/registry.ts` (`BOARD_TEMPLATE_GROUPS`), each with `previewUrl`;
   `boardTemplateSchema` (`lib/domain/canvas/boardTemplates/schema.ts` L308) has no description fields. On a board,
   `components/collabboard/templates/BoardTemplatePicker.tsx` applies a template to an empty board.

## Design

### A. Route
`app/dashboard/create-canvas/page.tsx` renders the new `NewBoardPage`. `CanvasSetupPage.tsx` is left untouched
(removal is a later patch).

### B. New files — `components/collabboard/create/` (each ≤ 300 lines, `'use client'` where needed)
- **`formatCatalog.ts`** — the 10 formats, two groups, exact copy:
  - "Collect and arrange": Freeform "Your research board: notes, PDFs and pictures anywhere." (tag "Board AI +
    wiki"), Wall "Cards in a tidy, flowing wall.", Columns "Sort posts into named columns.", Grid "Even rows of equal
    cards.", Timeline "Posts in date order along a line.", Map "Pin posts to places on a world map."
  - "Plan, track and draw": Kanban "Move tasks through stages.", Gantt "Schedule tasks and their dependencies.",
    Scheduler "Events on a calendar.", Drawing "One big whiteboard to draw on."
  Layout ids are the existing `LayoutType` values.
- **`FormatPicker.tsx`** — group labels + tiles (6 per row ≥ 1180 px, 3 below, 2 at ≤ 520 px): the mockup's SVG
  illustration, name, tag, description, template-count badge (from the registry; none when 0), a check on the selected
  tile, `aria-pressed`. Hover reports the hovered format (for the stage).
- **`FormatStage.tsx`** — the shuffle animation (mockup `.stage`, `POS`, decorations, dots): six cards that move
  between format arrangements with a 0.75 s ease. Before the user picks a format it cycles through all ten every
  2.2 s; hovering a tile shows that tile's arrangement; once a format is picked it shows that one and stops cycling.
  `prefers-reduced-motion: reduce` → no cycling, no transition. `aria-hidden`. Below it: format name and "From
  template: <name>" / "Blank board" / while cycling "Same posts, every format".
- **`StartWithChooser.tsx`** — two big cards: "Blank board" (grid art, "+") and "From a template" (a fan of three
  previews of the current format's templates, or of any templates when it has none; text "<n> <Format> templates ·
  <total> in total" or "No <Format> templates yet · <total> for other formats"; button "Browse templates"). With a
  template chosen the second card shows its preview, name, summary and "Change".
- **`TemplateGalleryModal.tsx`** — a large dialog (≈ `min(1240px, 100vw-32px)` × `100vh-32px`): left nav "All
  templates" + one row per format that has templates, with counts; main grid of big cards (min 320 px wide, 16:10
  preview from `previewUrl`, name, summary, format chip). Opens filtered on the current format when it has templates,
  else "All". Clicking a card → detail view in the same dialog: the preview large (scrollable), format tag, name,
  summary, "What's on the board" list (`contents`), "Photos from Pexels, clipart from Iconify. Everything stays
  editable.", buttons "Use this template" and "Back to templates". Using a template from another format switches
  the format. Escape / × closes.
- **`BoardIconField.tsx`** — six quick line icons (`layout, star, lightbulb, book-open, map-pin, globe`) + a dashed
  "+" that opens `IconSelector`. A chosen icon that is not in the quick row shows first, selected.
- **`BoardBackgroundField.tsx`** — five quick swatches (`#ffffff #f3f4f6 #fef3c7 #dcfce7 #dbeafe`, type `color`) +
  a dashed "+" that opens the existing `WallpaperSelector`; a chosen value outside the quick row shows first,
  selected (image → small cover).
- **`NewBoardPage.tsx`** — the page: top bar (`<Link href="/dashboard">` "Dashboard" with a back arrow, divider,
  "New board"; **no button in the bar**), main column ("What kind of board?" + "You can switch format later — your
  posts move with you.", `FormatPicker`, "Start with" + "A blank <Format> board, or one already filled in.",
  `StartWithChooser`), right rail 352 px, sticky (`FormatStage` card, Name, Description (optional, placeholder "What
  is this board for?"), Icon, Background, divider, switches "Comments — People can comment on posts" and "New posts
  first — Newest posts appear at the top" (both on; a real visible switch: blue on, grey off), divider, the ONE
  "Create board" button, full width, then an error line if any). Below 980 px the rail stacks under the main column.
  Defaults: format `freeform`, name "Untitled board", icon `lucide:layout`, background `#ffffff`. Choosing a template
  sets the name to the template name if the name is still the default or the previous template's name; choosing
  Blank or another format reverts it the same way. Button shows "Creating…" and is disabled while saving.
- Style: Tailwind, the app's font (`font-sans`), accent `blue-600`, slate neutrals, white surfaces, `ui/button` and
  `ui/dialog` where they fit. Light theme only (the app is light).

### C. Shared pieces
- **`lib/collabboard/create/createBoard.ts`** — `createBoard(supabase, input) → { ok: true; boardId } | { ok: false;
  message }`, the create branch of `handleSaveCanvas` with identical behaviour and messages (Fact 2), no
  `console.log`. Errors are returned, never thrown.
- **`components/collabboard/boardIcons.ts`** — the line-icon set: `lucide:<name>` → lucide component, for
  `layout, star, heart, lightbulb, book-open, map-pin, calendar, globe, camera, music, flask-conical, graduation-cap,
  rocket, users, target, pen-line, sparkles`.
- **`components/collabboard/BoardIconGlyph.tsx`** — renders a `thumbnail`: `lucide:<name>` → that icon (unknown name →
  `layout`), `http`/`data:` → `<img>`, else text. `CanvasTitleHeader.tsx` uses it instead of its inline branch.
- **`IconSelector.tsx`** — a new first section "Icons" (grid of the 17 line icons, selected outlined); choosing one
  calls `onSelect('lucide:<name>')`. The rest unchanged.

### D. Templates carry their own words
`boardTemplateSchema`: optional `summary: string` and `contents: string[]`. Fill both for all 18 templates (exact):

| id | summary | contents |
|---|---|---|
| project-plan | Goals, milestones and a to-do list. | Goal and scope notes; Milestones with dates; A to-do list; Reference photos |
| moodboard | Photos, colours and notes for a look. | Photo collage; Colour swatches; Style notes |
| creative-brief | Audience, message and references. | Audience and message; Do and don't list; Reference images |
| character-profile | Looks, traits and backstory of a character. | Portrait; Traits and quirks; Backstory notes |
| weekly-plan | Seven days with to-dos and notes. | A card for every day; To-do lists; Weekly goals |
| trip-planner | Places, packing list and itinerary. | Destination photos; Day-by-day plan; Packing list |
| event-plan | Venue, guests, schedule and checklist. | Venue and date; Run of show; Checklist |
| product-launch | Launch timeline, channels and tasks. | Launch timeline; Channels; Owner to-dos |
| birthday-wall | Messages and photos for someone's birthday. | Greeting cards; Photos; Clipart decorations |
| art-gallery | Student artworks with artist notes. | Artwork photos; Artist statements |
| brainstorming | Ideas sorted into columns. | Three idea columns; Starter sticky notes |
| frogs-and-toads | Frogs, toads, and what they share. | Frogs / Both / Toads columns; Photos and facts |
| science-vocabulary | Science words with pictures and meanings. | Word cards with photos; Definitions |
| book-reviews | Book covers with short reviews. | Book cards; Star ratings and reviews |
| world-volcanoes | Famous volcanoes pinned on the map. | Pins with photos; Height and last eruption |
| traditions-around-the-world | Festivals and customs by country. | A pin per country; Photos and short stories |
| history-of-flight | From the Wright brothers to the Moon. | Dated milestones 1903–1969; Photos |
| marie-curie | Key moments of her life and work. | Dated life events; Photos and quotes |

(Use the template ids as they are in the registry; if an id differs from this table, match by template and report it.)

### E. Create → open the board, filled in
After `createBoard` succeeds: `router.push('/dashboard/canvas/<id>' + (templateId ? '?template=<templateId>' : ''))`.
`BoardTemplatePicker.tsx`: on mount, read `template` from `window.location.search` and remove it at once with
`history.replaceState` (other params kept). When posts have loaded, the board counts as empty by the picker's existing
rule (incl. the timeline placeholder), `canEdit` is true and the id belongs to this board's layout → apply it through
the SAME apply path as the Apply button, exactly once, without showing the picker list (a small "Adding <name>…"
pill is fine); success and failure behave as a manual apply. Otherwise ignore the param and behave as today.

### F. Tests (vitest; add `'components/collabboard/create/**/*.test.tsx'` and `'lib/collabboard/create/**/*.test.ts'`
to `vitest.config.ts` if not already covered — check the include list)
- `formatCatalog`: 10 formats, the exact copy; no "Mind map"; Freeform has the tag.
- `createBoard`: board row fields; owner membership upsert; Gantt stages; Columns sections "Column 1/2/3"; the plan-limit
  message; a database error returns `{ ok: false }` with the message; never throws.
- `NewBoardPage`: exactly one "Create board" button; the top bar has no button besides the Dashboard link; switching
  format/template updates the name as specified; a successful create pushes the right URL (with and without template).
- `FormatStage`: with reduced motion no interval is started; cycling stops after a pick.
- `TemplateGalleryModal`: filter counts, detail view, "Use this template" reports the id and its layout.
- `BoardIconGlyph`: lucide / unknown lucide / URL / emoji.
- `BoardTemplatePicker`: `?template=` applies once on an empty editable board and strips the param; ignored for a
  non-empty board, a viewer, an unknown id and an id of another layout.
- Schema: every registered template has a non-empty `summary` and `contents`.
- Mutation: make the picker apply on a non-empty board → a test fails; revert with the Edit tool.

## Allowed files
```
app/dashboard/create-canvas/page.tsx
components/collabboard/create/*                    new (+ tests)
lib/collabboard/create/createBoard.ts              new (+ test)
components/collabboard/boardIcons.ts               new
components/collabboard/BoardIconGlyph.tsx          new (+ test)
components/collabboard/canvas/ui/CanvasTitleHeader.tsx
components/collabboard/canvas/IconSelector.tsx
components/collabboard/templates/BoardTemplatePicker.tsx (+ tests)
lib/domain/canvas/boardTemplates/schema.ts (+ test)
lib/collabboard/templates/**/*.ts                  summary/contents only
vitest.config.ts                                   include lines only
```
Forbidden: everything else (CanvasSetupPage.tsx, WallpaperSelector.tsx, CanvasClient.tsx), the database.
- Make real tool calls only. Do not use shell listing commands (ls/find/dir) — use your read/glob/grep tools.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep, head or tail.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server, no browser. Do not read `.env` files.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-301.json
```
Do not commit.

**Live (CTO):** the page matches the mockup (screenshot); switches visible; the stage cycles and stops on a pick;
the gallery opens big and filters; icon + background pickers open; a blank Wall board is created and opens; a board
created from "Birthday Wall" opens already filled (20 posts) and the URL has no `template` param; Columns gets
"Column 1/2/3"; a Timeline template board fills; the title header shows a line icon; test boards deleted.

## Commit message (verbatim)
```
feat(board): a new "New board" page with templates

Pick a format from illustrated tiles, start blank or from a finished
template in a large gallery, and the new board opens already filled
in. Line icons, the full background picker behind a +, and visible
switches.
```

## Addendum 1 (CTO live, 2026-10-06)
Live (kit, own tab, boards deleted): the page works — one "Create board" button, none in the bar; switches visible
(blue, on); the stage cycles (freeform → wall → columns → grid in 6 s); background and icon dialogs open; the gallery
opens big and filters; "Use this template" selects Wall and names the board "Birthday Wall"; a blank Columns board
opens with "Column 1/2/3". Gate `.opencode-vitest-301.json`: 2 extra failing files are load timeouts (both pass alone).
**Defect: the template is never applied.** A board created from Birthday Wall opens at `?template=birthday-wall`, the
param is stripped, and then the normal picker shows ("Choose a template … Start empty") with 0 posts inserted; the
same for History of Flight. Cause: React Strict Mode (dev) runs the effects twice — run 1: reset effect, read effect
(strips the param, `setAutoTemplate('birthday-wall')`); run 2: the reset effect sets `autoTemplate` back to `null`,
and the read effect finds no param. Any remount loses it the same way.
**Fix:** when the param is read, store it in `sessionStorage` under `board-template-request:<boardId>` (try/catch),
then strip the URL. The apply effect reads the pending id from `sessionStorage` (not from component state), removes the
key when it starts the apply (or when it decides to ignore the request), and applies once. The reset-on-board-change
effect must not drop a pending request. Keep the "Adding <name>…" pill.
Tests: render the picker inside `<React.StrictMode>` with `?template=` → exactly one apply; unmount right after the
param is read and mount again → still exactly one apply; ignored cases still strip the param and remove the key.
Mutation: clear the key in the reset effect → the Strict Mode test fails; revert with the Edit tool.
Allowed: `BoardTemplatePicker.tsx` and its tests. Same rules. Gate `--outputFile=.opencode-vitest-301a.json`.

## Addendum 2 (CTO live screenshot, 2026-10-06)
**The switch knob sticks out of the track.** `NewBoardPage.tsx` L52–56: the knob is `absolute` with no `left`, so it
starts at its static position — the centre of the button, whose content is centred — and `translate-x-4` pushes it past
the right edge (live: the white knob sits outside the blue track). Fix: `left-[3px]` on the knob, `translate-x-4` when
on, `translate-x-0` when off. Test: the knob has `left-[3px]`; on → `translate-x-4`, off → `translate-x-0`.
Allowed: `NewBoardPage.tsx` and its test. Gate: include in the 301a run if not yet run, else `--outputFile=.opencode-vitest-301b.json`.

## Addendum 3 (CTO live, 2026-10-06, after Addendum 1+2)
Live (kit, own tab, boards deleted): Birthday Wall opens filled — 20/20 inserts, param stripped; blank Columns has
"Column 1/2/3"; the switch knob fix is in. **Defect: a Timeline board created from a template keeps a blank first
entry** (dated 6.10.2026, "Drop posts here", above "1783"): 24 inserts = 23 template posts + the auto-created empty
entry. The timeline auto-init (`CanvasClient.tsx` ~L6793 → `attemptTimelineAutoInitOnce`) runs while the template is
being applied (the request key is removed when the apply STARTS, and the posts are not loaded yet).
**Fix:**
1. New `lib/collabboard/templates/templateRequest.ts` (move the sessionStorage helpers here): key
   `board-template-request:<boardId>`, value `{ id, state: 'pending' | 'applying' }` (JSON, try/catch everywhere);
   `hasBoardTemplateRequest(boardId)` = a key exists OR the current URL still has a `template` param.
2. `BoardTemplatePicker`: the auto-apply acts only on `pending`; it writes `applying` before it starts and removes the
   key when the apply has finished (success or failure) or when it ignores the request.
3. `attemptTimelineAutoInitOnce`: new optional input `templateRequestActive?: boolean`; when true → return
   `'skipped'` WITHOUT marking the board as attempted (so the normal rule still applies afterwards).
   `CanvasClient.tsx`: pass `templateRequestActive: hasBoardTemplateRequest(canvasId ?? '')` — one added line + import
   on an existing import line if possible (net ≤ +2).
Tests: `timelineAutoInit` skips without marking while a request is active, and runs normally after; picker state
machine (pending → applying → removed; an `applying` key is never applied again); `hasBoardTemplateRequest` true for
the URL param alone. Mutation: remove the `templateRequestActive` check → a test fails; revert with the Edit tool.
Allowed: `lib/collabboard/templates/templateRequest.ts` (new, + test), `BoardTemplatePicker.tsx` (+ tests),
`lib/domain/canvas/timelineAutoInit.ts` (+ test), `CanvasClient.tsx` (net ≤ +2). Same rules; never pipe vitest.
Run the touched test files and tsc only; the CTO runs the full gate.

## Final result (CTO, 2026-10-06, live after Addenda 1–3)
Gate `.opencode-vitest-301c.json` (run by the CTO): 26 failing files, identical by name to 300; tsc clean. Live (kit,
own tab, every test board deleted, 200): the page has one "Create board" button and none in the bar; switches visible
with the knob inside the track; the stage cycles (freeform → wall → columns → grid in 6 s) and stops on a pick;
background and icon dialogs open (Icons section first); the gallery opens large, filters, shows the detail view;
"Use this template" selects the format and names the board. Birthday Wall → opens filled, 20/20 inserts, `template`
param gone; blank Columns → "Column 1/2/3"; History of Flight → 23/23 inserts and NO blank first entry.
`CanvasClient.tsx` +2 (import + `templateRequestActive`). `CanvasSetupPage.tsx` is now unused (removal later).
