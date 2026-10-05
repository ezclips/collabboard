# PATCH-283 — Spike: AI-drawn pictures ("Napkin-style"), measured before we build on them

Status: AUTHORIZED (owner, 2026-10-05: "the AI post ... Napkin AI generated diagrams based on user text and buttons
selected ... pie chart would use your prompts and go through it in a shuffle manner"; 280–284 delegated to the CTO).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-277/278 (converter, `PictureScene` v1, `toSkeleton`).

## Why
The owner splits pictures in two: AntV becomes a no-AI library in the drawing post (PATCH-282); the AI post becomes
100% AI-drawn, with the type buttons kept (Flowchart, Mindmap, Pie, Bar, Timeline, Comparison, Show options) and a
"shuffle" so the same request gives different looks. Our earlier native AI designs were judged unreliable, so this is a
**spike with a go/no-go**, like 277: nothing in the product changes yet.

## Research (CTO, 2026-10-05) and what we take from it
- **Napkin** shows several visual options per text and "elastic designs" that grow to fit content
  (napkin.ai/blog/napkin-launches-elastic-designs). → several options per request; text fit is ours, not the model's.
- **coleam00/excalidraw-diagram-skill**: the LLM writes Excalidraw JSON with fixed design rules (size hierarchy, spacing,
  palette as semantics, roughness 0, opacity 100) and a render-and-check loop for overflow/overlap. → design rules in
  the prompt; a check after generation.
- **DiagrammerGPT** (arXiv 2310.12128): plan entities + boxes, then an "auditor" pass feeds the problems back to the
  planner; layout errors drop. → one repair round with a concrete issue list.
- **GeoSVG-RL / SVG benchmarks**: text overflow and overlap remain the typical LLM failure. → we never let the model
  decide what it is bad at: **text wrapping/fitting and data proportions are computed by our code**.

## Design
The AI writes a compact authoring format, **DrawnPicture v1**; our pure code repairs it and compiles it into the
existing `PictureScene` v1. One internal format: the same scene renders as SVG (AI post) and converts with the existing
`toSkeleton` into Excalidraw ("Edit as drawing", lossless).

### A. `lib/ai/drawn/format.ts` — DrawnPicture v1 + tolerant parser
```ts
interface DrawnPicture { version: 1; width: number; height: number; background: string; elements: DrawnElement[] }
// all coordinates in px, origin top-left; colours '#rrggbb' or 'none'
type DrawnElement =
  | { id: string; type: 'rect'; x; y; w; h; fill; stroke; strokeWidth?; radius?; dash?: boolean; item?: number }
  | { id: string; type: 'ellipse'; x; y; w; h; fill; stroke; strokeWidth?; item?: number }
  | { id: string; type: 'polygon'; points: [number, number][]; fill; stroke; item?: number }
  | { id: string; type: 'line'; points: [number, number][]; stroke; strokeWidth?; dash?: boolean;
      arrow?: 'none' | 'end' | 'start' | 'both' }
  | { id: string; type: 'wedge'; item: number; cx; cy; r; inner?: number; fill; stroke? }      // angles are OURS
  | { id: string; type: 'bar'; item: number; x; y; w; h; orient: 'v' | 'h'; fill; radius? }   // length is OURS
  | { id: string; type: 'text'; text: string; x; y; w; size; color; align?: 'left' | 'center' | 'right';
      bold?: boolean; in?: string; item?: number }
  | { id: string; type: 'icon'; name: string; x; y; size; color; item?: number };
```
- `parseDrawnPicture(raw: unknown): { picture: DrawnPicture; dropped: string[] }`. Tolerant: an invalid element is
  dropped with a reason; it throws `DrawnParseError` only when the root is not an object or no valid element remains.
- Limits: ≤ 150 elements; width/height clamped to 240..2400; coordinates finite; text ≤ 300 chars; size 9..72;
  colours normalised to lower-case `#rrggbb` (3-digit expanded) or `'none'`; icon names not in
  `VISUAL_ICON_NAMES` are dropped; duplicate ids get a suffix; `in` must name a rect/ellipse id, else removed.

### B. `lib/ai/drawn/textMetrics.ts` — pure text measuring (server + client)
`measureText(text, size, bold)` from an embedded Helvetica AFM width table (chars 32–126, /1000 em; bold table too;
other chars 0.6 em) and `wrapText(text, size, maxWidth, bold): string[]` (word wrap; a word wider than the line is
broken). Line height = 1.25 × size. No canvas, no DOM.

### C. `lib/ai/drawn/repair.ts` — `repairPicture(picture, outline): { picture, fixes: string[], issues: DrawnIssue[] }`
Pure and deterministic, in this order:
1. **Data is ours.** Wedges: angles recomputed from `outline.items[item].value` in item order (start at 0° = 12 o'clock,
   clockwise; items without a value or ≤ 0 → wedge dropped; all values summed to 360°). Bars: the length along `orient`
   is `value / maxValue × (the bar's own drawn length)` of the longest bar, anchored at its baseline (bottom for `v`,
   left for `h`). Pictures for pie/bar with no values: issue `no-data`.
2. **Text in a container** (`in`): inner width = container w − 2 × pad (pad = max(10, 0.6 × size)); wrap; if the wrapped
   block does not fit, grow the container's height (rect: downward; ellipse: both axes ×1.15 steps until it fits, max 3
   steps) and record a fix; the text box is centred in the container.
3. **Free text**: wrapped to its `w`; a word wider than `w` widens `w`.
4. **Canvas**: if content leaves the canvas, translate (negative origin) and/or enlarge it with a 24 px margin.
5. **Issues** (reported, not fixed): `overlap` (two filled rect/ellipse/polygon/bar, not one inside the other, not
   wedges, intersection > 15 % of the smaller), `text-overlap` (two text boxes intersect), `text-crosses-shape` (a free
   text box crosses a filled shape's border), `tiny-text` (< 10 px), `missing-label` (an outline item label appears in no
   text, case-insensitive substring).

### D. `lib/ai/drawn/compile.ts` — `drawnToScene(picture): PictureScene`
rect/ellipse/polygon/line → the existing scene kinds (dash → `dashed`; arrow → `arrowStart/End`); wedge → closed filled
polyline sampled every 3° (donut: outer arc + inner arc reversed); bar → rect; icon → `SceneImageElement` from
`iconSymbolSvg(name)` coloured `color` as an SVG data URL (`fromIcon: true`); text → `SceneTextElement` (box from
repair, `lineCount` = wrapped lines, `svgText: true`). `groupIds`: `item:<n>` when `item` is set, plus `PICTURE_GROUP_ID`.

### E. `lib/ai/drawn/toSvg.ts` — `sceneToSvg(scene): string`
Pure string SVG (viewBox = scene size, background rect, every element, text as `<text>` + `<tspan>` lines, font
`Helvetica, Arial, sans-serif`, all text XML-escaped, image hrefs only `data:image/svg+xml`). No `foreignObject`, no
scripts, no external URLs.

### F. `lib/ai/drawn/prompt.ts` — the prompt, the kinds and the shuffle
- `DrawnKind = 'flowchart' | 'mindmap' | 'pie' | 'bar' | 'timeline' | 'comparison'`; `kindForOutline(outline)` for
  "Show options" (steps/cycle/cause_effect → flowchart, levels/parts-without-values → mindmap, parts/list with ≥ 2
  values → pie, timeline → timeline, comparison → comparison, else flowchart).
- `DRAW_SYSTEM_PROMPT`: the DrawnPicture format (the types above, written plainly), and the design rules: size
  hierarchy (title 26–32, labels 15–18, details 12–14), ≥ 24 px between shapes, 32 px canvas margin, every outline item
  shown with its label, colours only from the given palette + background/text colours, put text inside its card with
  `in` and let the app fit it, use `wedge` / `bar` for data (never draw slices or bars as polygons/rects), arrows as
  `line` with `arrow`, no overlapping cards, canvas between 640×400 and 1200×900.
- **Variants (the shuffle)**, three per kind, e.g. pie: donut + legend right / full pie + labels around / donut + cards
  below; bar: vertical columns / horizontal bars / columns with value badges; timeline: horizontal axis alternating
  cards / vertical axis cards right / winding road; flowchart: top-down boxes + arrows / left-to-right steps / boxes
  with a decision diamond when the content has a choice; mindmap: centre + branches both sides / tree to the right /
  radial; comparison: two columns with VS / rows like a table / two cards with icons.
- `buildDrawPrompt({ outline, kind, seed, examples })`: `seed` (integer) picks the variant (`seed % 3`), the palette
  (a `VISUAL_THEMES` entry, cycling, light themes for seeds 0–2) and the example. The user part carries the outline as
  JSON, the variant sentence, the palette as hex values, and (when `examples` is true) ONE example: the example's
  outline + its DrawnPicture, introduced as "an example of the STYLE (cards, spacing, typography); its data marks may be
  polygons — you must use wedge/bar".

### G. Examples from AntV (the owner's idea: "convert the AntV into prompt examples")
- `lib/ai/drawn/fromScene.ts` — `sceneToDrawn(scene): DrawnPicture` (pure): rect/ellipse as is; closed filled polyline →
  polygon (RDP tolerance 2, ≤ 24 points, else dropped); open polyline → line; icon image → `icon` (add an optional
  `iconName` to `SceneImageElement`, set by `readIcon.ts` from the `<use href="#rsc-…">`/symbol id — the only change to
  the converter); text → text (`x,y,w` from its box). All numbers rounded to integers; elements < 2 px dropped.
- `lib/ai/drawn/examples.data.ts` — **GENERATED** (header says so), `DRAWN_EXAMPLES: Record<DrawnKind,
  {template: string; outline: VisualOutline; picture: DrawnPicture}[]>`, two per kind. Start it EMPTY (`[]` per kind);
  the CTO fills it from the harness export (H) with a script. The prompt builder must work with zero examples.
- Example templates: pie `chart-pie-donut-pill-badge`, `chart-pie-compact-card`; bar `chart-column-simple`,
  `chart-bar-plain-text`; timeline `sequence-timeline-simple`, `sequence-roadmap-vertical-simple`; flowchart
  `sequence-steps-simple`, `list-row-horizontal-icon-arrow`; mindmap `hierarchy-mindmap-branch-gradient-capsule-item`,
  `hierarchy-structure`; comparison `compare-binary-horizontal-simple-vs`, `compare-swot`.

### H. Route `app/api/ai/draw-picture/route.ts`
Same skeleton as `generate-outline/route.ts` (auth, rate limit 12/min/IP, JSON body checks, telemetry with
`subtype: 'drawn'`, `generateComponentText`, provider/credit error mapping). Body:
`{ outline, kind, seed, boardId?, examples? (default true) , reasoning? }`. `outline` through `parseOutline` (stored
path) and `withoutElementOverrides`; `kind` ∈ DrawnKind or `'auto'` (→ `kindForOutline`); `seed` integer 0..9999;
`reasoning` (`'off'|'auto'`) is honoured ONLY when `NODE_ENV !== 'production'`, else `'off'`.
- Call 1: `maxTokens: 8000`, `temperature: 0.8`, `timeoutMs: 60_000`, `creditCost: 1`. Parse (fences stripped) →
  `parseDrawnPicture` → `repairPicture`.
- **Auditor round** (DiagrammerGPT): when issues contain `overlap`, `text-overlap`, `text-crosses-shape` or
  `missing-label`, ONE more call with the repaired picture + the issue list ("fix exactly these problems, return the
  whole picture"), `creditCost: 0` if `generateComponentText` allows 0 (check `checkAiActionCredits`; if 0 is not
  supported, use 1 and say so in the report). Keep the result with fewer issues.
- Response: `{ picture, kind, variant, seed, issues, fixes, dropped, attempts, ms, generatedBy }`. Nothing is stored.

### I. Dev harness `/e2e-fixtures/ai-drawn` (dev only, `notFound()` in production; client wrapper like 277)
- Fixed outlines (no outline AI call), one per kind, in `lib/ai/drawn/harnessOutlines.ts`: pie/bar = a 5-item outline
  with values (24/40/26/10/12 style), timeline with dates, flowchart = 5 steps, mindmap = 4 items with 2 children each,
  comparison = 2 items with details.
- `?kind=<k>&seed=<n>&examples=0|1&reasoning=off|auto` runs one; no `kind` runs the battery (6 kinds × seeds 0,1,2)
  sequentially, at most 3 requests in flight.
- Each row: the SVG (`sceneToSvg(drawnToScene(picture))`), an editable `<Excalidraw>` of `toSkeleton(scene)`, and a
  table: attempts, ms, issues by type, fixes, dropped, element count. All rows on `window.__aiDrawn[key]`
  (`key = kind:seed:examples`).
- `?export=examples`: renders each example template (HARNESS_OUTLINE, classic theme) with AntV, `readSvgScene` →
  `sceneToDrawn`, and prints `<pre data-drawn-example="<kind>:<template>">JSON</pre>`. No AI call.

## Tests (TDD; all pure modules ≥ 90 % lines)
- format: valid picture round-trips; bad colour/huge size/unknown icon/unknown `in`/non-finite numbers are dropped with
  reasons; 151 elements → 150; root not an object → `DrawnParseError`.
- textMetrics: "iii" narrower than "WWW"; bold wider; wrap never returns a line wider than max (except one unbreakable
  char); empty text → `['']`.
- repair: wedge angles 24/40/26/10 → 86.4°/144°/93.6°/36° in order; a bar chart's bars proportional within 0.5 px;
  container grows to fit a long label (fix recorded) and the text box is inside it; overlapping cards → `overlap`; a
  missing label → `missing-label`; content off-canvas → translated/enlarged; idempotent (repair twice = once).
- compile: donut wedge is a closed polyline with inner arc; icon → data URL image containing the symbol; groupIds.
- toSvg: escapes `<script>`/`&`/quotes in text; no `foreignObject`; no `http` URL in output.
- fromScene: polygon > 24 points after RDP dropped; numbers are integers; an icon image with `iconName` → `icon`.
- prompt: seed 0/1/2 give three different variant sentences and palettes; zero examples works; with examples exactly one
  is included; `kindForOutline` table.
- route (mock `generateComponentText`, like `generate-outline/route.test.ts`): 401 unauthenticated; 400 bad kind/seed;
  a valid model answer → 200 with repaired picture; invalid JSON → 502; issues → second call made once with the issue
  list; `reasoning` ignored in production; credit refusal mapped.
- Mutations (revert with Edit): drop the wedge-angle recompute → the angle test fails; drop XML escaping → the toSvg
  test fails.

## Allowed files
```
lib/ai/drawn/**                               (new; each file ≤ 400 lines)
app/api/ai/draw-picture/route.ts (+ test)     (new)
app/e2e-fixtures/ai-drawn/page.tsx            (new, dev only)
components/ai/dev/AiDrawnHarness.tsx, AiDrawnHarnessClient.tsx (new)
lib/ai/antv/toExcalidraw/scene.ts             (optional iconName only)
lib/ai/antv/toExcalidraw/readIcon.ts (+ test) (set iconName only)
```
Forbidden: everything else (no product UI change, no AIComponentEditor change), the database.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai/drawn app/api/ai/draw-picture lib/ai/antv/toExcalidraw --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-283.json
```
Do not commit.

**Live (CTO), the go/no-go:** fill `examples.data.ts` from `?export=examples`; run the battery with examples=1 and
examples=0 (36 live calls). GO when, with examples: ≥ 17/18 parse; after the auditor round ≥ 15/18 have no `overlap` /
`text-overlap` / `missing-label`; median time ≤ 25 s; and the CTO's side-by-side screenshots look like designed
pictures, not like our old native designs. Otherwise NO-GO with the reasons, and the AI post keeps AntV for now.

## Commit message (verbatim)
```
feat(ai): spike for AI-drawn pictures

The AI writes a small picture format; our code fits the text, computes
pie and bar sizes from the numbers and checks for overlaps before one
repair round. A developer page measures how reliable it is. Nothing in
the product uses it yet.
```

## Addendum 1 (CTO, 2026-10-05, live)
1. **Board for credits.** The first live call returned `402 plan_limit_no_board` ("This AI action isn't linked to a
   board, so it has no AI credits") — correct route behaviour; the harness sends no `boardId`. The harness takes
   `?board=<uuid>` and passes it as `boardId` on every `/api/ai/draw-picture` request (both the single run and the
   battery). Validate the UUID shape in the page; without it the harness shows a clear message instead of calling.
2. **`xmlns` back.** `sceneToSvg` left out `xmlns="http://www.w3.org/2000/svg"` only to satisfy my test bullet "no
   `http` URL in output" — that was a spec error (an SVG without the namespace breaks as an `<img>`/data URL/file).
   Put the namespace back; change the test to: the ONLY `http` occurrence is that exact namespace; no `href` other than
   `data:image/svg+xml`.
3. `examples.data.ts` was filled by the CTO (11 examples; `compare-binary-horizontal-simple-vs` left out). Keep it; if
   a prompt test assumed empty examples, adapt the test, not the data.
Gate `--outputFile=.opencode-vitest-283a.json`.

## Addendum 2 (CTO, 2026-10-05, after the first live battery)
**Battery 1** (board af02972f, app default model "collabboard-default" → deepseek-flash, 36 live calls; 18 hit the
route's 12/min limit at first and were re-run one by one):

| | parsed | clean after repair | median | auditor used |
|---|---|---|---|---|
| with AntV examples | 18/18 | **13/18** | 5.4 s | 6 |
| without examples | 18/18 | 7/18 | 8.9 s | 11 |

The owner's idea works: the AntV examples nearly double the clean rate. Still below GO (15/18). Looking at every
picture, most remaining defects are in OUR code, not the model:
1. **Several texts in one card are drawn on top of each other.** `repairText` centres EVERY `in` text in its
   container, so a label + detail sharing a card overlap (timeline:0 had 12 `text-overlap`, comparison too). Fix: all
   texts with the same `in` are STACKED in their element order (gap 0.35 × the larger size), the whole block centred
   vertically in the container; the container grows to fit the stack (fix recorded).
2. **Labels do not follow the data.** We rescale bars (correct), but the model's value labels stay where it drew them
   for its own bar heights (bar:2 — "24" floats far above its bar). Two-part fix:
   a. Tell the model the real proportions up front, in `buildDrawPrompt`: for pie, each item's exact start/end angle
      (0° = 12 o'clock, clockwise, from the values); for bar, each item's length relative to the longest (e.g.
      0.6, 1, 0.65, 0.25, 0.3). Then its labels line up with what we draw.
   b. Safety net in repair: when a bar is rescaled, every text with the same `item` whose box lies within 48 px beyond
      the bar's ORIGINAL free end (above for `v`, right of it for `h`) moves by the same delta.
3. **The auditor round can delete content.** timeline:2 ended with NO text at all: attempt 1 had 13 issues, the
   auditor's answer had none of the texts (4 `missing-label` + 1 `overlap` = 5 issues) and "keep the one with fewer
   issues" chose it. Fix: rank attempts by (missing-label count, then the count of other issues); never pick an attempt
   whose text-element count is below half of attempt 1's.
4. **A `bar` without a value** (comparison:0/1 used bars as decoration) is kept exactly as drawn; `no-data` only when
   the KIND is bar and no item has a value.
5. **Overlapping cards stay overlapped** after the auditor (mindmap:0 and :2, children on both sides piling up). Add a
   deterministic de-overlap in a new `lib/ai/drawn/layoutFix.ts`, run after text fitting: for every pair of filled
   rect/ellipse boxes that overlap (not containment), move the later one down (or right, when they sit side by side
   and moving right is the smaller move) by the overlap + 16 px, carrying its `in` texts, texts with the same `item`
   inside it, and the endpoints of any `line` that start or end inside it; at most 4 passes; the canvas grows. Record
   each move as a fix. Pure, deterministic, tested.
6. **Legend swatch over its label** (pie:0 first run: "nue 24" — the model put text and swatch at the same x): a free,
   left-aligned text whose box starts inside a small filled shape (≤ 2 × the text size on both sides) is moved to the
   shape's right edge + 8 px.
7. **Prompt**: list the allowed icon names (`VISUAL_ICON_NAMES`) — today it says "a known icon name" without the list,
   so the model's icons are dropped; give the palette's card fills and text colours (`palette[].fill`, `.text`) as
   well as the accents; say that several texts may share one card through `in` and are stacked in order (label first,
   then detail).
Tests for each (real shapes from the battery as fixtures where possible: the two-texts-in-one-card timeline card, the
bar with a floating "24", the auditor answer with zero texts, two overlapping mind-map children with a connector).
Gate `--outputFile=.opencode-vitest-283b.json`. The CTO re-runs the battery afterwards.

## Addendum 3 (CTO, 2026-10-05, gate review)
The 283b gate has ONE new failing test that the report called pre-existing:
`lib/infra/knowledge/knowledgeSourceAiWiring.source.test.ts` — "reuses the existing /api/ai/text-action endpoint; no
new AI endpoint exists" pins every directory under `app/api/ai` by name, and `draw-picture` is new. Follow the file's
own pattern: add `'draw-picture'` to the sorted list with a one-line comment like the others ("draw-picture:
PATCH-283, an AI-drawn picture; likewise unreachable from the PDF Source AI panel."). Nothing else. Run that file
alone, then the gate `--outputFile=.opencode-vitest-283c.json`.

## Final result (CTO, 2026-10-05, live + offline replay) — PROVISIONAL GO
- Live battery 1 (board af02972f, app default model → deepseek-flash; 36 calls): with AntV examples **18/18 parsed,
  13/18 clean**, median 5.4 s; without examples 7/18 clean, median 8.9 s. The owner's idea (AntV designs as prompt
  examples) nearly doubles the clean rate. Seen: flowcharts, right-hand mind maps, donut-with-cards look like designed
  pictures.
- Addendum 2 fixed the defects in OUR code that the screenshots showed (texts in one card drawn on top of each other;
  labels not following rescaled bars; the auditor round deleting all text and winning on issue count; decorative bars
  flagged; overlapping cards; legend swatch over its label) and gave the model the real angles/bar proportions, the
  icon names and the card colours.
- **The live re-run stopped after 2 calls: "The Pro plan's AI credits for this month are used up. They renew on
  25 October."** (route 402 `plan_limit_credits`). Offline replay of battery 1's 18 pictures through the new repair:
  **13 → 15/18 clean** (timeline:0 from 12 overlaps to clean; mindmap:2 clean; timeline:2 — the auditor-deleted text —
  is the case the new ranking prevents). Rendered and checked visually: timeline and mind map clean; mindmap:0 has no
  overlaps any more but two connectors no longer reach their moved child (known weakness of the de-overlap).
- Decision: PROVISIONAL GO for PATCH-284; the live battery is re-run when credits are available (the prompt fixes —
  angles, icons, card fills — are only measurable live).
- Gate `.opencode-vitest-283c.json`: 59/59 identical to the PATCH-279 baseline. tsc clean.
- Note: the `vitest.config.ts` include for `lib/ai/drawn/**` went into the PATCH-282 commit (same file, same session).
