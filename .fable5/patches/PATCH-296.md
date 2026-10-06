# PATCH-296 — Templates for Columns, Grid, Wall, Map and Timeline boards

Status: AUTHORIZED (owner, 2026-10-06: "can you give for the column, grid/row, wall, map and timeline also templates
… two or three for each canvas max", reference: the education gallery of another product — themes only, all content
is ours).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-293/294/295 (engine, picker, freeform templates).

This patch generalises the engine to five more layouts and ships ONE finished template per layout. A second
template per layout follows in PATCH-297 as data only.

## Facts (CTO-checked in code; every layout is re-checked live after the patch)
- **Wall** (`CanvasClient.tsx` L3501 `wallOrderedPadlets`): shows ROOT containers only (`type 'container'`), ordered
  by `metadata.wallPosition`; posts live inside them (`childPadletIds` + child `metadata.parentId`).
- **Timeline** (`ChronoTimelineCanvas`, creation at `handleCreateEmptyTimelineContainer` L6743): root containers with
  `metadata.position_in_timeline` (0-based order), `kind: 'container'`, `isContainer: true`, `topStrip: 'transparent'`,
  width 280, height 200; posts inside them.
- **Map** (`onCreatePostAtLocation`, L10440ff): a pin is a root container with columns `location_lat`,
  `location_lng`, `location_label` and `metadata.mapLocation: { lng, lat, label }`, `childPadletIds`, `cardColor`,
  width 320, height 220; posts inside it.
- **Columns** (`columnsLayoutData` L3538): one column per `board_sections` row (sorted by `position`); a ROOT post
  belongs to a column by `metadata.sectionId` (string of the section's numeric id) and is ordered by
  `metadata.sectionPosition`. A new Columns board already has default sections (created by `CanvasSetupPage`).
- **Grid** (`RowCanvasDnD`): rows are `board_sections`; containers sit in a row by `metadata.sectionId` +
  `sectionPosition` (`handleCreateContainerAt` L1003: `kind: 'container'`, `isContainer`, `cardColor '#ffffff'`, width
  280, height 200); posts inside the containers.
- Sections are written through `SectionsRepository` (`lib/domain/canvas/sections.ts`: `insertSections`,
  `renameSection`, `deleteSection`; infra `lib/infra/canvas/sectionsRepository.ts`). `fetchData` reloads sections.
- `CanvasClient` holds `sections` (from `useCanvasData`); the picker mount is at the `BoardTemplatePicker` element
  (net growth 0 there).
- Assets in place (CTO): `public/templates/<layout>/<template-id>/` + `credits.json` (Pexels, Iconify Fluent Emoji
  MIT). Do not add, rename or edit assets.

## Design
### 1. Schema (`lib/domain/canvas/boardTemplates.ts`; split into `lib/domain/canvas/boardTemplates/` files of ≤ 400
lines if needed, keeping `boardTemplates.ts` as the public entry that re-exports)
- `layout`: `'freeform' | 'columns' | 'grid' | 'wall' | 'map' | 'timeline'`.
- New kind `section` `{ kind: 'section', key, title }` — columns and grid only; order = array order.
- The container kind keeps the name `column` (now "a container"); `x`, `y`, `width` become optional; new optional
  `section` (a section key) and `location` (`{ lat, lng, label }`).
- Content posts may carry `section` (columns only, a root post in that column).
- Validation per layout (one issue per violation, with a path):
  - freeform: as today (containers need x, y, width; no `section`/`location`; no `section` kind).
  - columns: no x/y; every ROOT post or container has a `section` naming a section; children (with `parent`) have
    no `section`.
  - grid: no x/y; every container has a `section`; every content post has a `parent`.
  - wall and timeline: no x/y, no `section`, no `section` kind; every content post has a `parent`.
  - map: no x/y; every container has a `location` (lat −90..90, lng −180..180, label non-empty); every content post
    has a `parent`.

### 2. Rows (`buildTemplateRows(boardId, template, newId, sectionIds?)`)
`sectionIds`: map section key → numeric id (columns/grid). Rows keep every PATCH-293 rule for freeform. Other
layouts:
- Every container: `type 'container'`, `position_x 0`, `position_y 0`, metadata `{ isContainer: true, kind:
  'container', orientation: 'vertical', childPadletIds, cardColor: '#ffffff', topStrip? }`; no `manualSize`, no
  `startExpanded` (those are freeform-only). Width/height: wall, grid, timeline 280 × 200; map 320 × 220 — unless
  the template states them.
- wall: container `metadata.wallPosition` = its index among the template's containers.
- timeline: `metadata.position_in_timeline` = index; `topStrip: 'transparent'` unless stated.
- map: `location_lat`, `location_lng`, `location_label` (= label) and `metadata.mapLocation { lng, lat, label }`.
- columns/grid: a root row with a `section` gets `metadata.sectionId = String(sectionIds[key])` and
  `sectionPosition` = its index among that section's root items.
- Content posts: as today (children get `parentId`; positions 0 for non-freeform).

### 3. The command (`createApplyBoardTemplateCommand(postsRepository, sectionsRepository)`)
Input `{ boardId, template, existingSections: { id: number; title: string; position: number }[] }` (default `[]`).
For columns/grid templates, BEFORE inserting posts:
1. Reuse existing sections in `position` order: rename the first N to the template's section titles (remember old
   titles); create the missing ones with `insertSections` at positions after the last existing one.
2. Insert the rows as today.
3. Only after every insert succeeded: delete existing sections beyond the template's count (they hold no posts — the
   picker only runs on an empty board).
Failure at any step → delete inserted posts, delete created sections, rename reused sections back, return
`template_apply_failed`. Freeform/wall/map/timeline ignore sections entirely (no section calls).

### 4. Picker and mount
- `BoardTemplatePicker` gets `sections` (`{ id, title, position }[]`), passes them as `existingSections`, and builds
  the command with `createSectionsRepository()` too.
- `CanvasClient.tsx`: pass `sections={sections}` on an EXISTING line of the mount (net growth 0).
- The panel must stay usable above every layout: check the z-index against the map (`z-10` layer) and the timeline
  header; raise the panel's z-index only if it is below them.

### 5. Registry
Add groups in this order after Freeform: `columns` "Columns canvas", `grid` "Grid canvas", `wall` "Wall canvas",
`map` "Map canvas", `timeline` "Timeline canvas", each with its template from §6 (files under
`lib/collabboard/templates/<layout>/`).

### 6. The five templates (exact content; asset paths relative to `/templates/<layout>/<id>/`)
Notation: `group(title)` = a container; children listed in order; `img(title, file)`, `note(title, html)`,
`todo(title, [tasks; ✓ = done])`, `clip(title, file, bg)`.

**wall/`birthday-wall` — "Birthday Wall"** (containers in this order):
1. group("Happy birthday, Maya! 🎉"): img("Happy birthday!", birthday-letters.jpg); note("Today", `<p>Maya turns 10
   today! Leave her a message, a drawing or a photo.</p>`); clip("Party time", party-popper.svg, `#fbcfe8`)
2. group("From Leo"): note("Leo", `<p>Happy birthday, Maya! Thanks for always sharing your crayons. Have the best
   day! 🎈</p>`); clip("Balloons", balloon.svg, `#fecaca`)
3. group("From Ms. Ortiz"): note("Ms. Ortiz", `<p>Maya, your curiosity makes our class brighter every day. Have a
   wonderful birthday!</p>`); img("Make a wish", candles.jpg)
4. group("From Sam and Ava"): img("For you!", balloons.jpg); note("Sam and Ava", `<p>We hope your year is full of
   adventures, books and pizza!</p>`); clip("Cake!", birthday-cake.svg, `#fde68a`)
5. group("Class gift"): todo("Gift plan", [A card signed by everyone ✓; A mystery book ✓; Wrap it in her favourite
   colours; Hide it until lunch]); clip("Gift", wrapped-gift.svg, `#e9d5ff`)
6. group("Party photos"): img("Confetti!", confetti.jpg); clip("Best day", star-struck.svg, `#fef08a`)

**columns/`brainstorming` — "Brainstorming Board"** (sections in order; items in order):
- section "The question": note("Our question", `<p><strong>How can we make our school greener this year?</strong>
  </p><p>Add one idea per card and vote with a ❤️.</p>`); img("Brainstorm day", sticky-notes.jpg);
  clip("Ideas welcome", light-bulb.svg, `#fef08a`)
- section "Ideas": note("Plant a school garden", `<p>Vegetables and flowers in the courtyard; each class looks after
  one bed.</p>`); note("Bike to school week", `<p>One week where everyone walks, rolls or bikes. A prize for the class
  with the most.</p>`); note("Swap shop", `<p>Bring books and toys you no longer use and swap them.</p>`);
  img("More ideas on the wall", idea-wall.jpg)
- section "Questions": clip("Big questions", red-question-mark.svg, `#fecaca`); note("Who waters the garden in
  summer?", `<p>Could families take turns during the holidays?</p>`); note("Where do we start?", `<p>Which idea is
  the cheapest to try first?</p>`); clip("Think about it", thinking-face.svg, `#fde68a`)
- section "Resources": img("Books about gardening", library.jpg); note("Useful contacts", `<ul><li>Ask the city
  about free tree seedlings</li><li>Talk to the parents' association</li><li>Find a local gardening club</li></ul>`);
  clip("Reading", books.svg, `#bae6fd`)
- section "Next steps": todo("Plan", [Vote on the top three ideas ✓; Ask the principal; Make a poster; Start with the
  swap shop]); clip("Done!", check-mark-button.svg, `#bbf7d0`)

**grid/`science-vocabulary` — "Science Vocabulary"** (rows = sections; containers = word cards):
- section "Living things":
  - group("Habitat"): img("Habitat", habitat.jpg); note("Habitat", `<p><strong>Habitat:</strong> the natural home
    of a plant or animal, where it finds food, water and shelter.</p><p><em>A forest is a habitat for owls and
    deer.</em></p>`); clip("Plants", herb.svg, `#bbf7d0`)
  - group("Photosynthesis"): img("Photosynthesis", photosynthesis.jpg); note("Photosynthesis",
    `<p><strong>Photosynthesis:</strong> how plants use sunlight, water and air to make their own food.</p>
    <p><em>Leaves turn light into energy.</em></p>`); clip("Sunlight", sun.svg, `#fef08a`)
  - group("Pollination"): img("Pollination", pollination.jpg); note("Pollination", `<p><strong>Pollination:</strong>
    moving pollen from flower to flower so plants can make seeds.</p><p><em>Bees carry pollen on their
    legs.</em></p>`)
  - group("Migration"): img("Migration", migration.jpg); note("Migration", `<p><strong>Migration:</strong> when
    animals travel a long way at the same time each year.</p><p><em>Geese fly south for the winter.</em></p>`)
- section "Earth and water":
  - group("Erosion"): img("Erosion", erosion.jpg); note("Erosion", `<p><strong>Erosion:</strong> when wind, water
    or ice slowly wear away rock and soil.</p><p><em>A river carved this canyon.</em></p>`)
  - group("Evaporation"): img("Evaporation", evaporation.jpg); note("Evaporation", `<p><strong>Evaporation:</strong>
    when liquid water turns into a gas called water vapour.</p><p><em>Morning mist rises from the lake.</em></p>`)
  - group("Water cycle"): clip("Water", droplet.svg, `#bae6fd`); note("Water cycle", `<p><strong>Water cycle:
    </strong> water evaporates, forms clouds, falls as rain and flows back to the sea — again and again.</p>`)
  - group("Ecosystem"): clip("Our planet", globe-showing-europe-africa.svg, `#bbf7d0`); note("Ecosystem",
    `<p><strong>Ecosystem:</strong> all the living things in a place, and how they depend on each other and on the
    land, water and air.</p>`)

**map/`world-volcanoes` — "World Volcanoes"** (pins in order):
- group("Mount Fuji, Japan", location 35.3606, 138.7274, label "Mount Fuji, Japan"): img("Mount Fuji", fuji.jpg);
  note("Facts", `<p><strong>Height:</strong> 3,776 m</p><p><strong>Type:</strong> stratovolcano</p><p><strong>Last
  eruption:</strong> 1707</p><p>Japan's highest mountain.</p>`); clip("Stratovolcano", volcano.svg, `#fed7aa`)
- group("Mount Vesuvius, Italy", 40.8214, 14.4260, "Mount Vesuvius, Italy"): img("Vesuvius above the Bay of Naples",
  vesuvius.jpg); note("Facts", `<p><strong>Height:</strong> 1,281 m</p><p><strong>Type:</strong> stratovolcano</p>
  <p><strong>Famous eruption:</strong> AD 79, which buried Pompeii and Herculaneum</p><p><strong>Last
  eruption:</strong> 1944</p>`)
- group("Kīlauea, Hawaii, USA", 19.4069, -155.2834, "Kīlauea, Hawaii, USA"): img("A lava fountain at Kīlauea",
  kilauea.jpg); note("Facts", `<p><strong>Height:</strong> 1,247 m</p><p><strong>Type:</strong> shield volcano</p>
  <p>One of the most active volcanoes on Earth; its lava keeps adding new land to the island.</p>`); clip("Hot
  lava", fire.svg, `#fecaca`)
- group("Mount Etna, Italy", 37.7510, 14.9934, "Mount Etna, Italy"): img("Etna above a Sicilian town", etna.jpg);
  note("Facts", `<p><strong>Height:</strong> over 3,300 m — it changes with every eruption</p><p><strong>Type:
  </strong> stratovolcano</p><p>Europe's most active volcano.</p>`)
- group("Reykjanes Peninsula, Iceland", 63.8800, -22.4000, "Reykjanes Peninsula, Iceland"): img("Lava near
  Grindavík", reykjanes.jpg); note("Facts", `<p><strong>Type:</strong> fissure eruptions — lava pours out of long
  cracks in the ground</p><p>Since 2021 the peninsula has erupted again and again, after about 800 quiet
  years.</p>`)

**timeline/`history-of-flight` — "History of Flight"** (entries in order):
1. group("1783 · The first hot-air balloon flight"): img("Hot air rises", balloon.jpg); note("Paris", `<p>The
   Montgolfier brothers' balloon carries two passengers over Paris — the first people to fly.</p>`)
2. group("1891 · Gliding like a bird"): img("A modern glider", glider.jpg); note("Otto Lilienthal", `<p>Otto
   Lilienthal begins about 2,000 glider flights in Germany and studies how wings lift.</p>`)
3. group("1903 · The first powered flight"): img("Early planes had two wings", biplane.jpg); note("Kitty Hawk",
   `<p>Orville and Wilbur Wright fly the Wright Flyer for 12 seconds and 37 metres at Kitty Hawk, North
   Carolina.</p>`); clip("Flight!", airplane.svg, `#bae6fd`)
4. group("1927 · Across the Atlantic alone"): note("Charles Lindbergh", `<p>Charles Lindbergh flies non-stop from
   New York to Paris in 33½ hours.</p>`); clip("33½ hours", hourglass-done.svg, `#fde68a`)
5. group("1958 · The jet age"): img("Jets made travel faster", airliner.jpg); note("Jets", `<p>Jet airliners start
   regular flights across the Atlantic, and flying becomes part of everyday life.</p>`)
6. group("1969 · People on the Moon"): img("Rockets carry people into space", rocket.jpg); note("Apollo 11",
   `<p>Apollo 11 lands on the Moon. Neil Armstrong and Buzz Aldrin walk on its surface.</p>`); clip("One giant
   leap", rocket.svg, `#c7d2fe`)
7. group("1998 · A home in orbit"): clip("Space station", satellite.svg, `#e9d5ff`); note("The ISS", `<p>The first
   part of the International Space Station is launched. People have lived on board without a break since
   2000.</p>`)

## Tests
- Schema per layout: each rule in §1 accepted/rejected with a path (one test per rule); the five templates and the
  eight freeform templates still parse.
- Rows: wall `wallPosition` 0..n−1; timeline `position_in_timeline` 0..n−1 and `topStrip 'transparent'`; map
  `location_*` columns and `mapLocation`; columns/grid `sectionId` = the given id as a string and `sectionPosition`
  per section; no `manualSize`/`startExpanded` outside freeform; children keep `parentId`; freeform rows unchanged
  (existing tests stay green).
- Command (fake repositories): columns template on a board with 3 existing sections and 5 template sections → 3
  renames, 2 inserts, no deletes; with 7 existing → 5 renames, 2 deletes AFTER all post inserts; a post insert
  failure → posts deleted, created sections deleted, renamed sections renamed back, `template_apply_failed`;
  wall/map/timeline/freeform → no section calls.
- Registry: groups in order with their labels; every asset exists and is credited (existing helper).
- Picker: passes `sections` through as `existingSections`.
- Source test: the mount passes `sections`; `CanvasClient.tsx` net growth 0.
- Mutation: delete the "after all inserts" ordering (delete surplus sections first) → the command test fails;
  revert with the Edit tool.

## Allowed files
```
lib/domain/canvas/boardTemplates.ts (+ test) and new files under lib/domain/canvas/boardTemplates/ (+ tests)
lib/collabboard/templates/registry.ts (+ test)
lib/collabboard/templates/{columns,grid,wall,map,timeline}/*.ts (+ tests)          new
components/collabboard/templates/BoardTemplatePicker.tsx (+ test)
app/dashboard/canvas/[id]/CanvasClient.tsx                                         the picker mount only, net 0
```
Forbidden: everything else, `public/templates/**`, the database.
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
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-296.json
```
Do not commit.

**Live (CTO, kit, own tab):** per layout, a new board through the create page → the picker offers its group →
apply → every post present and rendered the way that layout shows its own posts (wall cards, timeline entries in
order, map pins at the right places, columns/rows with the template's titles and no leftover default sections),
images loaded, no outside host, reload keeps it; previews made from these runs; every test board deleted.

## Commit message (verbatim)
```
feat(board): templates for columns, grid, wall, map and timeline boards

New Columns, Grid, Wall, Map and Timeline boards now offer a finished
template too: a brainstorming board, a science vocabulary grid, a
birthday wall, a world volcanoes map and a history of flight timeline.
```

## Addendum 1 (CTO, 2026-10-06, live)
Gate `.opencode-vitest-296.json` 59/59 identical to 295; `CanvasClient.tsx` net 0. Live, one new board per layout
(all deleted): Wall 20/20 inserts, Columns 16/16 (sections renamed, no leftover defaults), Grid 26/26, Map 17/17 (five
pins listed, the Vesuvius/Etna cluster shows) all render their posts. Note: the Wall places cards centre-out
(`calculateWallOrder`: 1st centre, 2nd right, 3rd left …) — by design, not a defect. Four defects:

1. **Containers start collapsed outside freeform**, so word cards, wall cards etc. cut their content (5 inner scroll
   areas on the Wall, 6 on the Grid). Every layout keeps its own expanded state, default `false`:
   `WallCanvas.tsx` L148 (`useState(false)` per item), `ChronoTimelineCanvas.tsx` L97/L529/L541,
   `components/canvas/layouts/ColumnsCanvasRow.tsx` L189/L391/L404, `components/collabboard/row/RowLane.tsx`
   L186/L460/L472, `components/map/PostPopup.tsx` L61. Apply the PATCH-293 rule in each: the default is
   `metadata.startExpanded === true` (state seeded from it; a toggle flips from that same default). Net growth 0 in
   any of these files that is over its ceiling. `buildTemplateRows` sets `startExpanded: true` on EVERY template
   container, in every layout. Tests per file: a container with the flag renders expanded; one toggle collapses it;
   without the flag unchanged.
2. **Note titles are never shown inside containers or columns** (only the HTML body is), so idea names vanish
   (Brainstorming "Plant a school garden", Project Plan "Fern & Fig Café — new website"). Data fix: prepend
   `<p><strong>{title}</strong></p>` to the `html` of exactly these notes: Project Plan "Fern & Fig Café — new
   website"; Creative Brief "Lumen Bikes · Spring campaign", "Tone", "Mandatories"; Trip Planner "Five days in
   Lisbon", "Must-sees", "Try"; Event Plan "Summer garden party", "Menu"; Product Launch "Targets"; Brainstorming
   "Plant a school garden", "Bike to school week", "Swap shop", "Who waters the garden in summer?", "Where do we
   start?", "Useful contacts". Test: those notes' html starts with their bold title.
3. **Timeline boards never show the picker.** On first open an empty Timeline board auto-creates one blank root
   container (`CanvasClient.tsx` ~L6782 effect → `handleCreateEmptyTimelineContainer`), so `postCount` is 1. Fix:
   the picker receives the posts (`posts={padlets}` replacing `postCount=…` on the same line, net 0) and treats as
   placeholders the root containers with an empty title, no children and empty content; "empty board" = no posts
   other than placeholders. On Use, the command gets `replacePostIds` (the placeholders) and deletes them only after
   every insert succeeded (rollback unchanged otherwise). Tests: a board with one placeholder shows the picker; a
   titled container or one with a child does not; the placeholder is deleted after success, kept on failure.
4. **The picker covers other panels** (on the Map it hides the "What are you pinning?" box that opens after Drop
   Pin). Fix: a pointer press anywhere outside the panel collapses it to a small pill button "Templates"
   (`data-board-template-pill`, bottom-right, `bottom: 120px; right: 16px`) — not a dismissal; clicking the pill
   reopens the panel; Escape collapses too. Tests: outside press → pill, panel gone, not dismissed (storage
   untouched); pill click → panel; inside press → stays open.
Gate `--outputFile=.opencode-vitest-296a.json`.

## Addendum 2 (CTO, 2026-10-06, live after Addendum 1)
Gate `.opencode-vitest-296a.json` 59/59 (the five new `*.expandedDefault.test.tsx` ran and passed). Live, one new
board per layout, all deleted: Wall 20/20, Columns 16/16, Grid 26/26, Map 17/17, Timeline 23/23 inserts; all images
load; no inner scroll areas any more; no outside host from the templates. Timeline with saving allowed from the
first open (real use): the board auto-creates its blank entry, the picker still shows, Use → 23 inserts + 1 DELETE
(the placeholder), no blank entry after a reload. Outside presses collapse the panel to the pill and the pill
reopens it. Two remaining defects:
1. **Every timeline entry shows today's date** ("6.10.2026") as its badge: `ChronoTimelineCanvas.tsx` L417 reads
   `metadata.timelineLabel` and falls back to `created_at`. Schema: containers may carry `timelineLabel?` (timeline
   only; validation error elsewhere) → row `metadata.timelineLabel`. History of Flight: each entry's badge is its
   year and its title the event only: "1783" / "The first hot-air balloon flight", "1891" / "Gliding like a bird",
   "1903" / "The first powered flight", "1927" / "Across the Atlantic alone", "1958" / "The jet age", "1969" /
   "People on the Moon", "1998" / "A home in orbit". Tests: schema, row, data.
2. **A Map board opens on the viewer's own country, not on its pins** (`components/map/MapCanvas.tsx` L315–384: on
   load it asks the browser for the position or calls ipapi.co with the viewer's IP, then fits that country — for
   every map board, pins or not). Fix: when the board has posts with valid `location_lat`/`location_lng`, fit the map
   to their bounds (padding 64, maxZoom 6; a single pin → centre on it at zoom 5) and do NOT ask for the position or
   call ipapi.co; only a board with no pins keeps today's behaviour. Put the bounds computation in a pure helper
   `lib/domain/canvas/mapPinBounds.ts` (+ test). `MapCanvas.tsx` is over the ceiling: net growth ≤ 0 (move the two
   location helpers out to the new module or a sibling to make room). Tests: helper (none / one / many pins, invalid
   coordinates ignored); MapCanvas with pins calls `fitBounds` and never `fetch('https://ipapi.co/…')` nor
   `geolocation`; without pins behaviour unchanged.
Gate `--outputFile=.opencode-vitest-296b.json`.

## Addendum 3 (CTO, 2026-10-06, review)
Gate `.opencode-vitest-296b.json` 59/59; `MapCanvas.tsx` −14 net. One review defect: the moved viewer-location
helpers (`navigator.geolocation`, `fetch('https://ipapi.co/json/')`) landed in `lib/domain/canvas/mapViewerLocation.ts`
— `lib/domain` must stay pure (CONVENTIONS rule 1: no browser or network). Move the file unchanged to
`components/map/mapViewerLocation.ts` and update the import. No behaviour change. Run the MapCanvas tests and the gate
with `--outputFile=.opencode-vitest-296c.json`.

## Final result (CTO, 2026-10-06, live)
Gate `.opencode-vitest-296c.json`: 59/59 identical to 295 by name. Live (kit, own tab), one new board per layout,
each deleted afterwards (200): Wall 20/20, Columns 16/16 (sections renamed, surplus none), Grid 26/26, Map 17/17,
Timeline 23/23 inserts; images loaded (9 / 8 / 10 / in pin popups / 9); no inner scroll areas; no outside host from
the templates (the map itself talks to Mapbox, and an EMPTY map board still looks up the viewer's country — by
design). Timeline in real use: the auto-created blank entry is replaced (23 POST + 1 DELETE), badges read 1783,
1891 …; the Map opens fitted to its pins (Iceland, Italy, Japan in view; Hawaii at the left edge behind the pin
list). The picker collapses to its "Templates" pill on an outside press and reopens from it. Committed together with
PATCH-297 (both touch the same `CanvasClient.tsx` region; separately one commit would not build).
