# PATCH-294 — Seven more finished freeform templates

Status: AUTHORIZED (owner, 2026-10-06, same request as PATCH-293: eight finished templates "under FreeForm Canvas").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-293 (engine, picker, Project Plan, Addenda 1–3).

## Facts
- Templates are data (`BoardTemplate`, `lib/domain/canvas/boardTemplates.ts`), one file per template under
  `lib/collabboard/templates/freeform/`, registered in `lib/collabboard/templates/registry.ts`. `projectPlan.ts` is
  the model to copy.
- Layout rules learned live in PATCH-293: columns are at least 360 wide (use 360 at x 60 / 460 / 860) and start
  expanded (the builder sets `startExpanded`); a free post is shown at its stored size only when it has BOTH width
  and height (the builder then sets `manualSize`); free posts go at x 1260.
- Assets are in place (CTO): `public/templates/freeform/<template-id>/` with `credits.json` (Pexels photos, Iconify
  Fluent Emoji MIT). Do not add, rename or edit assets.

## Design
Add seven files, each exporting one `BoardTemplate`, and register them in this order after Project Plan: Moodboard,
Creative Brief, Character Profile, Weekly Plan, Trip Planner, Event Plan, Product Launch. Content exactly as below.
Notation: `col(key, title, x, strip)` = column `{ width: 360, y: 60 }`; children listed under it in order;
`img(title, file)`, `note(title, html)`, `todo(title, [tasks; ✓ = done])`, `clip(title, file, bg)`;
free posts give x, y, width, height. All file paths are relative to `/templates/freeform/<id>/`.

### 1. `moodboard` — "Moodboard"
- col(mood, "Mood", 60, `#d97706`): img("Evening light", living-room.jpg); note("Feeling", `<p>Calm, warm and
  lived-in. Soft light in the evening, nothing shiny.</p>`); clip("Candlelight", candle.svg, `#fde68a`);
  img("Soft layers", sofa-sheepskin.jpg)
- col(textures, "Textures", 460, `#a16207`): img("Washed linen", linen.jpg); img("Jute rug", jute.jpg);
  note("Materials", `<ul><li>Linen curtains, unlined</li><li>Jute or wool rug</li><li>Oak, oiled — not
  lacquered</li></ul>`); clip("Little details", sparkles.svg, `#fef3c7`)
- col(objects, "Objects & plants", 860, `#be185d`): img("Blush vase", pink-vase.jpg); img("Clay collection",
  terracotta-vases.jpg); clip("More green", potted-plant.svg, `#bbf7d0`); img("Pampas by the window", pampas.jpg)
- free: table("Palette", 1260, 60, 440, 220) rows `Colour | Hex | Where`; `Sand | #D8C3A5 | Walls`;
  `Terracotta | #C46A4A | Vases, cushions`; `Olive | #7A7F4F | Plants, throws`; `Cream | #F4EDE1 | Linen`
- free: todo("Shopping list", 1260, 320, 300, 260) [Two terracotta vases ✓; Jute rug 200 × 300 cm; Linen curtains
  (two panels); Floor lamp with a fabric shade; Pampas grass ✓]
- free: clip("Art wall", framed-picture.svg, `#e7e5e4`, 1600, 320, 180, 220)

### 2. `creative-brief` — "Creative Brief"
- col(brief, "The brief", 60, `#2563eb`): note("Lumen Bikes · Spring campaign", `<p><strong>Product:</strong> Lumen
  City, an e-bike for daily commuting.</p><p><strong>Goal:</strong> 2,000 test rides booked in April and May.</p>
  <p><strong>Audience:</strong> city commuters aged 25–45 who drive or take the bus today.</p>`);
  note("Key message", `<p><em>“Your commute, in a better light.”</em></p>`); clip("Message", megaphone.svg,
  `#bfdbfe`); todo("Deliverables", [Three key visuals ✓; 15-second video; Twelve social posts; Shop window poster;
  Test-ride landing page])
- col(visual, "Visual direction", 460, `#0891b2`): img("Real commuters, real streets", ebike-commuter.jpg);
  img("Motion, not studio", city-ride.jpg); note("Tone", `<ul><li>Bright, optimistic, everyday</li><li>Morning and
  evening light</li><li>No lycra, no racing</li></ul>`); clip("Idea", light-bulb.svg, `#fef08a`)
- col(moments, "Campaign moments", 860, `#7c3aed`): img("The ride home", evening-ride.jpg); img("Built-in lights",
  light-trails.jpg); note("Mandatories", `<ul><li>Logo bottom right</li><li>“Book a free test ride” on every
  asset</li><li>From €2,490</li></ul>`); clip("Timeline", spiral-calendar.svg, `#e9d5ff`)
- free: table("Timeline", 1260, 60, 440, 260) rows `Phase | Date | Owner`; `Kick-off | 3 March | Agency`;
  `First concepts | 17 March | Agency`; `Photo and video shoot | 31 March – 2 April | Production`;
  `Launch | 14 April | Lumen`; `Results report | 30 May | Agency`
- free: clip("Lumen City", bicycle.svg, `#bae6fd`, 1260, 360, 180, 220)

### 3. `character-profile` — "Character Profile"
- col(who, "Who she is", 60, `#0f766e`): img("Mara Quill, 34", portrait.jpg); note("At a glance",
  `<p><strong>Role:</strong> navigator on the airship <em>Kestrel</em></p><p><strong>From:</strong> the harbour town
  of Low Wick</p><p><strong>Wants:</strong> to chart the storm belt no one has crossed</p><p><strong>Fears:</strong>
  being grounded for good</p>`); clip("Navigator", compass.svg, `#99f6e4`)
- col(personality, "Personality", 460, `#b45309`): img("Quick to laugh", portrait-pose.jpg); note("Traits",
  `<ul><li>Curious, stubborn, generous</li><li>Talks to her instruments</li><li>Never lies to her crew</li></ul>`);
  note("Voice", `<p><em>“Maps are just promises someone kept.”</em></p>`); clip("Backstory", scroll.svg, `#fde68a`)
- col(world, "Her world", 860, `#6d28d9`): img("Her charts", map-compass.jpg); img("The storm belt at dusk",
  balloon-sunset.jpg); img("Festival day in Low Wick", balloon-peach.jpg); clip("Places", world-map.svg, `#ddd6fe`)
- free: todo("Story beats", 1260, 60, 320, 260) [Mara loses the Kestrel's charts ✓; A stranger offers a shortcut;
  Into the storm belt; She chooses the crew over the record; Home to Low Wick]
- free: table("Relationships", 1260, 360, 440, 200) rows `Name | Who | Feeling`; `Otto Fenn | Pilot, old friend |
  Trust`; `Ines Varga | Rival navigator | Respect`; `The harbourmaster | Her father | Unfinished`
- free: clip("Rivalries", crossed-swords.svg, `#fecaca`, 1620, 60, 180, 220)

### 4. `weekly-plan` — "Weekly Plan"
- col(week, "This week", 60, `#4f46e5`): img("Plan on Sunday evening", planner.jpg); note("Focus",
  `<p><strong>Three things that matter:</strong></p><ol><li>Finish the quarterly report</li><li>Run three
  times</li><li>Call Grandma</li></ol>`); clip("Week 12", spiral-calendar.svg, `#c7d2fe`)
- col(work, "Work", 460, `#0284c7`): todo("Work", [Quarterly report draft ✓; Team one-to-ones (Mon, Wed); Review
  the new website copy; Book flights for the offsite; Clear the inbox on Friday]); note("Notes", `<p>Deep work in
  the mornings — meetings after 2 pm.</p>`); clip("Reading", books.svg, `#bae6fd`)
- col(health, "Health & home", 860, `#16a34a`): img("Breakfast prep", breakfast.jpg); img("Runs: Mon · Wed · Sat",
  morning-run.jpg); clip("5 km", running-shoe.svg, `#bbf7d0`); clip("Meal plan", green-salad.svg, `#d9f99d`)
- free: table("Meal plan", 1260, 60, 440, 260) rows `Day | Lunch | Dinner`; `Mon | Lentil salad | Vegetable
  curry`; `Tue | Leftover curry | Pasta with greens`; `Wed | Wraps | Salmon and rice`; `Thu | Soup | Tacos`;
  `Fri | Out with the team | Pizza night`
- free: todo("Home", 1260, 360, 300, 240) [Laundry ✓; Water the plants; Pay the electricity bill; Groceries on
  Saturday morning]

### 5. `trip-planner` — "Trip Planner"
- col(plan, "The trip", 60, `#ea580c`): img("Tram 28", tram.jpg); note("Five days in Lisbon", `<p><strong>When:
  </strong> five days in early May</p><p><strong>Stay:</strong> a guesthouse in Alfama</p><p><strong>Getting around:
  </strong> metro, tram 28 and a lot of walking</p>`); clip("Flights", airplane.svg, `#fed7aa`); todo("Before we
  go", [Book flights ✓; Book the guesthouse ✓; Lisboa Card for three days; Reserve a fado dinner; Comfortable
  shoes!])
- col(see, "See & do", 460, `#0284c7`): img("Sunset at a miradouro", viewpoint.jpg); note("Must-sees",
  `<ul><li>Belém Tower and the monastery</li><li>A day trip to Sintra</li><li>LX Factory on Sunday</li><li>Sunset at
  a miradouro</li></ul>`); clip("Photo spots", camera.svg, `#bae6fd`); clip("Tram routes", tram-car.svg, `#fef08a`)
- col(eat, "Eat & drink", 860, `#ca8a04`): img("Pastéis de nata, still warm", pastel-de-nata.jpg); note("Try",
  `<ul><li>A bifana at the counter</li><li>Grilled sardines</li><li>Ginjinha in a chocolate cup</li></ul>`)
- free: table("Itinerary", 1260, 60, 520, 260) rows `Day | Morning | Afternoon | Evening`; `1 | Arrive, walk Alfama
  | The castle | Fado dinner`; `2 | Belém | LX Factory | Bairro Alto`; `3 | Sintra | Sintra | Early night`;
  `4 | Tram 28 | Chiado | Sunset at a miradouro`; `5 | Time Out Market | Fly home | —`
- free: clip("Packing list", luggage.svg, `#e9d5ff`, 1260, 360, 180, 220)

### 6. `event-plan` — "Event Plan"
- col(party, "The party", 60, `#db2777`): img("Lights on at eight", string-lights.jpg); note("Summer garden party",
  `<p><strong>When:</strong> a Saturday in late June, from 5 pm</p><p><strong>Where:</strong> the back garden</p>
  <p><strong>Guests:</strong> about 30</p><p><strong>Dress code:</strong> summer whites</p>`); clip("Let's
  celebrate", party-popper.svg, `#fbcfe8`)
- col(food, "Food & drinks", 460, `#ea580c`): img("Sharing platters", food-spread.jpg); img("One long table",
  dinner-table.jpg); note("Menu", `<ul><li>Grilled vegetables and halloumi</li><li>Three salads</li><li>Lemonade and
  a spritz bar</li><li>Strawberry cake</li></ul>`); clip("Cake", birthday-cake.svg, `#fde68a`)
- col(todo, "To do", 860, `#16a34a`): todo("Checklist", [Send the invitations ✓; Order the cake ✓; Borrow two long
  tables; Hang the string lights; Make a playlist; Ice — lots of it]); clip("Playlist", musical-notes.svg,
  `#ddd6fe`); clip("Decorations", balloon.svg, `#fecaca`)
- free: table("Budget", 1260, 60, 440, 260) rows `Item | Cost | Paid`; `Food | $320 | ✓`; `Drinks | $180 | ✓`;
  `Cake | $65 | ✓`; `Lights and decorations | $90 | `; `Table hire | $40 | `; `Total | $695 | `

### 7. `product-launch` — "Product Launch"
- col(product, "The product", 60, `#0891b2`): img("Hydra, in four colours", bottles.jpg); note("What it is",
  `<p>An insulated steel bottle that keeps drinks cold for 24 hours and hot for 12.</p><ul><li>500 ml and 750
  ml</li><li>Four colours</li><li>Lifetime warranty</li></ul>`); clip("Hydra", droplet.svg, `#a5f3fc`)
- col(plan, "Launch plan", 460, `#4f46e5`): img("Launch workshop", whiteboard.jpg); todo("Launch checklist", [Final
  samples approved ✓; Product photos ✓; Landing page live; Press kit to 20 editors; Launch email to the waiting
  list; Pop-up stand at the farmers' market]); clip("Press", megaphone.svg, `#c7d2fe`)
- col(goals, "Goals", 860, `#16a34a`): img("Hero shot", steel-bottle.jpg); note("Targets", `<ul><li>1,500 bottles in
  the first month</li><li>5,000 people on the waiting list</li><li>Press in three lifestyle magazines</li></ul>`);
  clip("Sales", chart-increasing.svg, `#bbf7d0`); clip("Launch day", rocket.svg, `#bfdbfe`)
- free: table("Timeline", 1260, 60, 440, 260) rows `Week | What | Owner`; `−6 | Samples and photos | Product`;
  `−4 | Landing page and waiting list | Marketing`; `−2 | Press kit out | PR`; `0 | Launch | Everyone`;
  `+2 | First results | Marketing`

## Tests
- One test per template file: the schema accepts it; its id, name and the number of posts per kind match the spec
  above; every `src`/`svg` exists under `public/` and is listed in that folder's `credits.json` (reuse the registry
  test helper if there is one).
- Registry: the freeform group lists the eight templates in the order above; ids unique; names unique.
- Picker: renders eight template rows under "Freeform canvas".

## Allowed files
```
lib/collabboard/templates/freeform/{moodboard,creativeBrief,characterProfile,weeklyPlan,tripPlanner,eventPlan,productLaunch}.ts (+ tests)   new
lib/collabboard/templates/registry.ts (+ test)
components/collabboard/templates/BoardTemplatePicker.test.tsx          the eight-rows assertion only
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
timeout 600 npx vitest run lib/collabboard/templates components/collabboard/templates --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-294.json
```
Do not commit.

**Live (CTO):** each template applied to its own new freeform board: every post present, all images loaded, columns
expanded without clipping, tables at their size; screenshot → `preview.jpg` per template; test boards deleted.

## Commit message (verbatim)
```
feat(board): seven more finished freeform templates

The template picker now also offers Moodboard, Creative Brief,
Character Profile, Weekly Plan, Trip Planner, Event Plan and Product
Launch, each a finished board with photos, clipart, notes, lists and
tables.
```

## Addendum 1 (CTO, 2026-10-06, live)
Gate `.opencode-vitest-294.json` 59/59 identical to 293d. Live, one new freeform board per template (all deleted,
200): every insert 201 (Moodboard 18, Creative Brief 17, Character Profile 17, Weekly Plan 15, Trip Planner 15,
Event Plan 14, Product Launch 14), every template image loaded, no to-do as JSON, no clipped column, no outside
host. The CTO made a preview per template from these runs: `public/templates/freeform/<id>/preview.jpg` (720 px wide,
listed in each `credits.json`), Project Plan included. Set `previewUrl: '/templates/freeform/<id>/preview.jpg'` on
all eight templates (Project Plan too: `projectPlan.ts` + its test). Test: every template has a `previewUrl` whose
file exists and is listed in its folder's `credits.json`; the picker shows the preview image of the selected
template (`data-board-template-preview`, `src` = its `previewUrl`, `alt` = "<name> preview") and none for "Empty
board". Gate `--outputFile=.opencode-vitest-294a.json`.

## Final result (CTO, 2026-10-06, live)
Gate `.opencode-vitest-294a.json`: 59/59 identical to 293d by name. Live (kit, own tab), one new freeform board per
template, each deleted afterwards (200): inserts all 201 — Moodboard 18, Creative Brief 17, Character Profile 17,
Weekly Plan 15, Trip Planner 15, Event Plan 14, Product Launch 14 (Project Plan 17 in PATCH-293); template images
loaded 11 / 8 / 9 / 7 / 7 / 7 / 7, none broken; no to-do shown as JSON; no clipped column; no outside host; the picker
does not return after a reload. Picker (board deleted afterwards): "Freeform canvas" lists Empty board + the eight
in order; selecting Trip Planner and Moodboard shows their loaded preview to the left; "Empty board" shows none.
Assets: 4.9 MB for the eight folders, every file listed in its folder's `credits.json`.
