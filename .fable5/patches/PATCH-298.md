# PATCH-298 — A second template for Columns, Grid, Wall, Map and Timeline

Status: AUTHORIZED (owner, 2026-10-06: "two or three for each canvas max"; PM proposal: two per canvas, accepted with
"I leave it up to you as PM").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-296/297 (engine for every layout, `timelineLabel`, `startExpanded`, picker).

Data only: five template files (+ tests) and the registry. The schema, rows, command and picker do not change.

## Facts
- Model files: `lib/collabboard/templates/{wall,columns,grid,map,timeline}/*.ts` from PATCH-296 (Birthday Wall,
  Brainstorming Board, Science Vocabulary, World Volcanoes, History of Flight) and their tests.
- Notes inside containers/columns show only their HTML body, so a note whose title matters carries it in the body
  (PATCH-296 Addendum 1) — the content below already does.
- Assets are in place (CTO): `public/templates/<layout>/<id>/` + `credits.json`. Do not add, rename or edit assets.

## Design
Add each template as the SECOND entry of its layout's group (after the PATCH-296 one). Notation as in PATCH-296:
`group(title)`, `section(title)`, `img(title, file)`, `note(title, html)`, `todo(title, [tasks; ✓ = done])`,
`clip(title, file, bg)`; map groups give `lat, lng, label`; timeline groups give `timelineLabel / title`.

**wall/`art-gallery` — "Student Art Gallery"** (containers in order):
1. group("Our art gallery 🎨"): note("Welcome", `<p>Welcome to our class gallery! Each card shows one piece of art.
   Leave a kind comment and tell the artist what you notice.</p>`); clip("Gallery", framed-picture.svg, `#e7e5e4`)
2. group("Scooter Day — Mia, watercolour"): img("Scooter Day", watercolor.jpg); note("Artist's note", `<p>I painted
   my brother and me racing to the park. The balloons are from his party.</p>`); clip("Love it", red-heart.svg,
   `#fecaca`)
3. group("Mother and Child — Jonas, clay"): img("Mother and Child", clay-figures.jpg); note("Artist's note", `<p>I
   shaped this from one block of clay and let it dry for a week before painting it.</p>`)
4. group("Cut and Paste — Aisha, collage"): img("Cut and Paste", collage.jpg); note("Artist's note", `<p>Every shape
   comes from old magazines. I looked for bright colours and patterns.</p>`); clip("Bravo!", clapping-hands.svg,
   `#fef08a`)
5. group("Sketchbook — Leo, pencil"): img("Sketchbook", bird-sketches.jpg); note("Artist's note", `<p>Quick sketches
   of birds and flowers. I tried to draw each one in under two minutes.</p>`)
6. group("Behind the scenes"): img("Painting time", paint-box.jpg); todo("Gallery checklist", [Photograph every
   artwork ✓; Write an artist's note ✓; Leave two kind comments; Choose one piece for the school hall]);
   clip("Colours", artist-palette.svg, `#fbcfe8`)

**columns/`frogs-and-toads` — "Compare and Contrast"** (sections in order):
- section "Frogs": img("Smooth, wet skin", frog.jpg); note("Frogs", `<p><strong>Frogs</strong></p><ul><li>Smooth,
  moist skin</li><li>Long back legs for big jumps</li><li>Live in or close to water</li><li>Lay their eggs in
  clusters</li></ul>`); img("At home on the rocks", frog-pond.jpg)
- section "Both": note("Both", `<p><strong>Both</strong></p><ul><li>Amphibians</li><li>Start life as tadpoles in
  water</li><li>Eat insects</li><li>Breathe through their skin as well as their lungs</li></ul>`); img("The pond where
  it all starts", pond.jpg); clip("Water", droplet.svg, `#bae6fd`); clip("Amphibians", frog.svg, `#bbf7d0`)
- section "Toads": img("Dry, bumpy skin", toad.jpg); note("Toads", `<p><strong>Toads</strong></p><ul><li>Dry, bumpy
  skin</li><li>Short legs: they walk and make small hops</li><li>Can live far from water</li><li>Lay their eggs in
  long strings</li></ul>`); img("A common toad up close", toad-ground.jpg)
- section "Our question": clip("Look closer", magnifying-glass-tilted-left.svg, `#fde68a`); note("Question",
  `<p><strong>Why can toads live far from water, but frogs cannot?</strong></p><p>Write your idea on a card and add
  it here.</p>`); clip("Wonder", red-question-mark.svg, `#fecaca`); clip("Nature", leaf-fluttering-in-wind.svg,
  `#d9f99d`)

**grid/`book-reviews` — "Book Reviews"** (rows = sections; containers = book cards):
- section "Adventure":
  - group("Treasure Island — Robert Louis Stevenson"): img("Adventure on every page", open-book.jpg);
    note("Review", `<p><strong>★★★★★</strong></p><p>Jim Hawkins finds a treasure map and sails off with a crew of
    pirates. Long John Silver is the best villain ever.</p><p><em>— Sam, 11</em></p>`); clip("Pirates!",
    skull-and-crossbones.svg, `#e7e5e4`)
  - group("Alice's Adventures in Wonderland — Lewis Carroll"): clip("Down the rabbit hole", rabbit-face.svg,
    `#fbcfe8`); note("Review", `<p><strong>★★★★☆</strong></p><p>Alice follows a white rabbit into a world where
    nothing makes sense. Funny and very strange!</p><p><em>— Mia, 10</em></p>`)
  - group("The Wind in the Willows — Kenneth Grahame"): img("A cosy reading corner", books-plants.jpg);
    note("Review", `<p><strong>★★★★☆</strong></p><p>Mole, Rat, Badger and the very silly Mr. Toad have adventures on
    the river.</p><p><em>— Leo, 9</em></p>`); clip("River trip", canoe.svg, `#bae6fd`)
- section "Classics we love":
  - group("The Secret Garden — Frances Hodgson Burnett"): img("Reading time", book-heart.jpg); note("Review",
    `<p><strong>★★★★★</strong></p><p>Mary finds a locked garden and brings it back to life — and herself too.</p>
    <p><em>— Aisha, 11</em></p>`); clip("Garden", tulip.svg, `#bbf7d0`)
  - group("Black Beauty — Anna Sewell"): img("From our class library", book-stack.jpg); note("Review",
    `<p><strong>★★★★☆</strong></p><p>A horse tells his own life story. It made me think about how we treat
    animals.</p><p><em>— Jonas, 10</em></p>`); clip("Horses", horse-face.svg, `#fed7aa`)
  - group("How to write a review"): img("Your next book", reading-glasses.jpg); note("Tips", `<ul><li>Say what the
    book is about in two sentences</li><li>Give it 1 to 5 stars</li><li>Say who would enjoy it</li><li>No
    spoilers!</li></ul>`); clip("Stars", star.svg, `#fef08a`)

**map/`traditions-around-the-world` — "Traditions Around the World"** (pins in order):
- group("Diwali — India", 28.6139, 77.2090, "New Delhi, India"): img("Clay lamps called diyas", diwali.jpg);
  note("Diwali", `<p><strong>Diwali</strong>, the festival of lights, is celebrated in autumn. Families light clay
  lamps, share sweets and wear new clothes.</p>`); clip("Diya", diya-lamp.svg, `#fed7aa`)
- group("Día de Muertos — Mexico", 19.4326, -99.1332, "Mexico City, Mexico"): img("A Día de Muertos altar",
  day-of-the-dead.jpg); note("Día de Muertos", `<p>On 1 and 2 November families build altars with marigolds, photos
  and favourite foods to remember loved ones who have died.</p>`)
- group("Hanami — Japan", 35.0116, 135.7681, "Kyoto, Japan"): img("Cherry blossoms by the Kamo River, Kyoto",
  hanami.jpg); note("Hanami", `<p>In spring, people picnic under blooming cherry trees — <em>hanami</em> means
  “flower viewing”.</p>`); clip("Sakura", cherry-blossom.svg, `#fbcfe8`)
- group("Lunar New Year — China", 39.9042, 116.4074, "Beijing, China"): img("Red lanterns for good luck",
  lanterns.jpg); note("Lunar New Year", `<p>Families gather for a big dinner, hang red lanterns and give children red
  envelopes with money.</p>`); clip("Lantern", red-paper-lantern.svg, `#fecaca`)
- group("Midsummer — Sweden", 59.3293, 18.0686, "Stockholm, Sweden"): img("Flower crowns", midsummer.jpg);
  note("Midsummer", `<p>Around the longest day of the year, people dance around a maypole, wear flower crowns and eat
  strawberries.</p>`)
- group("Carnival — Brazil", -22.9068, -43.1729, "Rio de Janeiro, Brazil"): img("Carnival costumes",
  carnival.jpg); note("Carnival", `<p>Before Lent, cities fill with parades, samba music and dazzling costumes for
  several days.</p>`); clip("Party", party-popper.svg, `#fde68a`)

**timeline/`marie-curie` — "Marie Curie: A Life in Science"** (entries in order, `timelineLabel` / title):
1. "1867" / "Born in Warsaw": img("Warsaw's Old Town", warsaw.jpg); note("Childhood", `<p>Maria Skłodowska is born
   in Warsaw, Poland, the youngest of five children of two teachers.</p>`)
2. "1891" / "Off to Paris": img("Paris", paris.jpg); note("Studies", `<p>She moves to Paris to study physics and
   mathematics at the Sorbonne, often studying late into the night.</p>`); clip("Books", books.svg, `#bae6fd`)
3. "1895" / "Marie and Pierre": note("Marriage", `<p>She marries the physicist Pierre Curie. They work side by side
   in their laboratory.</p>`); clip("Lab work", test-tube.svg, `#bbf7d0`)
4. "1898" / "Two new elements": img("Laboratory glassware", glassware.jpg); note("Polonium and radium", `<p>Marie and
   Pierre discover two new elements: polonium, named after Poland, and radium. Marie calls the effect
   “radioactivity”.</p>`); clip("Radioactivity", radioactive.svg, `#fef08a`)
5. "1903" / "The first Nobel Prize": img("A medal for science", medal.jpg); note("Physics", `<p>She shares the Nobel
   Prize in Physics with Pierre Curie and Henri Becquerel — the first woman to win a Nobel Prize.</p>`);
   clip("Prize", 1st-place-medal.svg, `#fde68a`)
6. "1911" / "A second Nobel Prize": img("An antique microscope", microscope.jpg); note("Chemistry", `<p>She wins the
   Nobel Prize in Chemistry and becomes the first person to win Nobel Prizes in two sciences.</p>`);
   clip("Science", microscope.svg, `#e9d5ff`)
7. "1914" / "X-rays at the front": note("World War I", `<p>She sets up mobile X-ray units — nicknamed “little
   Curies” — to help doctors treat wounded soldiers.</p>`); clip("Mobile X-ray", ambulance.svg, `#fecaca`)
8. "1934" / "Her legacy": note("Legacy", `<p>Marie Curie dies in France. Her work opened the way to modern physics
   and to cancer treatment with radiation.</p>`)

## Tests
One test file per template (as for the PATCH-296 ones): the schema accepts it; id, name, layout and the number of
posts per kind match the spec; every asset exists and is credited. Registry: each of the five layouts lists its two
templates in order.

## Allowed files
```
lib/collabboard/templates/wall/artGallery.ts, columns/frogsAndToads.ts, grid/bookReviews.ts,
  map/traditionsAroundTheWorld.ts, timeline/marieCurie.ts (+ tests)                           new
lib/collabboard/templates/registry.ts (+ test)
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
timeout 600 npx vitest run lib/collabboard/templates --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-298.json
```
Do not commit.

**Live (CTO):** each of the five applied to a new board of its layout: all posts, images loaded, nothing cut off,
right order (timeline badges, map pins); previews made for all ten non-freeform templates; boards deleted.

## Commit message (verbatim)
```
feat(board): a second template for every board layout

Columns, Grid, Wall, Map and Timeline boards now offer two finished
templates each: Compare and Contrast, Book Reviews, Student Art Gallery,
Traditions Around the World and a Marie Curie timeline join the first
five.
```

## Addendum 1 (CTO, 2026-10-06, live)
Gate `.opencode-vitest-298.json` 59/59 identical to 296c. Live, one new board per layout (all deleted): Art Gallery
21/21, Compare and Contrast 14/14, Book Reviews 23/23, Traditions 22/22, Marie Curie 27/27 inserts; images load (map
photos sit in the pin popups); nothing cut off. The CTO made previews for all ten non-freeform templates from these
runs: `public/templates/<layout>/<id>/preview.jpg`, listed in each `credits.json`. Set
`previewUrl: '/templates/<layout>/<id>/preview.jpg'` on the five PATCH-296 and the five PATCH-298 templates. Test:
every template in every group has a `previewUrl` whose file exists and is credited (extend the registry test).
Gate `--outputFile=.opencode-vitest-298a.json`.

## Final result (CTO, 2026-10-06, live)
Gate `.opencode-vitest-298a.json`: 59/59 identical to 296c by name. Live (kit, own tab, every board deleted): the five
new templates apply in full (21 / 14 / 23 / 22 / 27 inserts, all 201), images load, nothing cut off, no outside host
from the templates. All ten non-freeform templates have a `previewUrl`; on a new Map board the picker lists "World
Volcanoes" and "Traditions Around the World" and shows each one's loaded preview. Photos whose descriptions did not
match the content were replaced before use (a bullfrog labelled as a toad, a telescope as a microscope, Seoul as
Japan). First coder session stalled twice on a hung shell call; it was aborted and redone in a fresh session.
