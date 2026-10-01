# PATCH-237 — Customize, Edit text, and an icon per item (Napkin parity, step 2)

Status: AUTHORIZED (owner, 2026-10-01: "ok go" — after the CTO's review of napkin.ai's help collection).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-236 (`9834f40d`, pushed)

## Why (CTO, from help.napkin.ai "Napkin Visuals", 24 articles)
- **Custom Generation**: after the first suggestions, "Customize" lets the user name the visual type they want,
  choose **Summary vs Detailed**, and **Keep my wording** (no paraphrasing). One new generation.
- **Editing is free** in Napkin (text, colours, icons); only regenerating costs credits. We store the outline since
  PATCH-236, so editing the words can redraw locally with no AI call.
- **Icons**: nearly every Napkin visual shows an icon per item. `lucide-react` is already a dependency.
Out of scope (decided): Napkin "Effects" (AI image restyling), Custom Brands (colour themes come in PATCH-238),
the Napkin API, orientation for the SVG designs (only Flow can turn, see §1).

## Design
### 1. Customize (one new AI call only when the user presses Apply)
- `OutlineSuggestionsPanel` gets a collapsed **"Customize"** section under the tiles:
  - **Detail**: `Auto | Summary | Detailed` (segmented control).
  - **Keep my wording** (checkbox).
  - **Make it a…** text field (≤ 60 chars, placeholder "e.g. pyramid, cycle, timeline").
  - **Flow direction**: `Left to right | Top to bottom` — local only (no AI call): it re-derives the Flow option's
    Mermaid with `flowchart LR` or `flowchart TD`.
  - **Apply** button → calls `/api/ai/generate-outline` again with the same prompt plus `options`.
- `app/api/ai/generate-outline/route.ts`: the body accepts an optional
  `options: { detail?: 'auto'|'summary'|'detailed'; keepWording?: boolean; visualHint?: string }`, validated
  (unknown keys ignored; `visualHint` trimmed, control characters removed, ≤ 60 chars, else 400). The route appends
  a short "User preferences" block to the system prompt, built ONLY from fixed sentences:
  - summary → "Keep labels to at most 4 words and omit details unless essential.";
  - detailed → "Give every item a detail sentence (up to 140 characters).";
  - keepWording → "Use the user's own words for labels and details; do not paraphrase.";
  - visualHint → `The user wants this drawn as: "<hint>". Choose the kind and items that suit it.` (the hint
    inside quotes, with any double quotes removed).
  Credits, auth, rate limit and error mapping are unchanged (1 credit per Apply, like a Generate).
- Client: `suggestDesigns(outline, { preferKey? })` — if the hint names a design (`pyramid`, `stack`/`layers`,
  `stairs`/`steps`, `cycle`, `funnel`, `hub`, `mind map`/`mindmap`, `flow`/`flowchart`, `timeline`, `comparison`;
  case-insensitive, whole word), that design is first and gets "Best match", if it fits the item count.

### 2. Edit text (no AI call)
- An **"Edit text"** toggle in the panel shows a small form bound to the CURRENT outline: the title, and per item
  its label, detail, and icon (a select, §3), plus "Add item" / remove (×) within 2..8 items. Inputs enforce the
  `OUTLINE_LIMITS` lengths (`maxLength`).
- Every change re-runs `suggestDesigns` on the edited outline locally; the large preview and tiles update; NO
  fetch. Save persists the edited outline (infographic options carry it; the other options are derived from it).
- Works both for a fresh generation and when reopening a saved infographic (PATCH-236 §6).

### 3. An icon per item
- New `lib/ai/visualIcons.ts`: `VISUAL_ICON_NAMES` — a fixed list of ~60 kebab-case Lucide names covering common
  topics (e.g. `sun`, `moon`, `cloud-rain`, `leaf`, `snowflake`, `flower-2`, `clock`, `calendar`, `alarm-clock`,
  `glass-water`, `dumbbell`, `utensils`, `list-checks`, `target`, `flag`, `rocket`, `lightbulb`, `brain`, `book-open`,
  `graduation-cap`, `users`, `user`, `heart`, `shield`, `lock`, `key`, `dollar-sign`, `chart-line`, `chart-pie`,
  `trending-up`, `trending-down`, `search`, `settings`, `wrench`, `hammer`, `code`, `database`, `server`, `cloud`,
  `globe`, `map`, `map-pin`, `home`, `building-2`, `briefcase`, `shopping-cart`, `truck`, `plane`, `car`, `phone`,
  `mail`, `message-circle`, `camera`, `music`, `star`, `award`, `check-circle`, `alert-triangle`, `x-circle`,
  `help-circle`, `layers`, `puzzle`, `zap`, `recycle`, `sprout`) — DeepSeek confirms each exists in the installed
  lucide-react 0.525 and drops any that do not (say which).
- `VisualOutlineItem` gains optional `icon?: string`. `OUTLINE_SYSTEM_PROMPT` lists the allowed names and asks for
  one per item when a fitting one exists. `parseOutline` drops an icon not in the list (never throws).
- New `components/ai/renderers/visualIconMap.tsx`: name → the Lucide component (explicit imports, no dynamic
  `import()` by string, no `icons` barrel).
- Layouts emit `icons: Array<{ name, x, y, size, color, insideShapeId? }>` and reserve room for them:
  stack band (left of the label), stairs box (left of the label, after the number badge), cycle circle (above the
  label; the circle grows), hub card (left of the label), pyramid/funnel (left of the detail line), so nothing
  overlaps. No icon → no reserved space (layouts identical to today).
- `InfographicRenderer` draws each icon as the Lucide component with `x, y, width, height, color` (a nested svg).
  The mind-map tree renderer is unchanged.

## Tests
- Route: `options` validated (bad `detail` → 400, hint > 60 → 400, unknown keys ignored); each option adds exactly
  its fixed sentence to the system prompt sent to `generateComponentText`; a hint with quotes/newlines arrives
  sanitized inside quotes; no options → the prompt is byte-identical to today.
- `suggest`: `preferKey` from "make it a pyramid" puts pyramid first with Best match; a hint naming nothing changes
  nothing; a preferred design that does not fit the count is not forced.
- Flow direction: LR/TD changes only the Flow option's code, no fetch.
- Edit text (editor/panel test): editing an item label updates the preview text with NO fetch; add/remove respect
  2..8; Save passes the edited outline in the envelope.
- Icons: `parseOutline` keeps a listed icon, drops an unlisted one; every name in `VISUAL_ICON_NAMES` maps to a
  component in `visualIconMap`; per layout with icons: icons inside their shapes and not overlapping any text (extend
  the PATCH-236 helpers); without icons the layout output is unchanged (snapshot of the geometry).
- Renderer: an outline with icons renders one svg icon per item; an unknown icon name renders nothing.
- **Mutations:** the route forwards the raw hint without removing quotes → the sanitize test fails; Edit text calls
  fetch on change → the no-fetch test fails; layouts ignore the icon slot → the icon-overlap test fails.

## Allowed files
```
app/api/ai/generate-outline/route.ts (+ test)
lib/ai/outline.ts (+ test), lib/ai/visualIcons.ts (+ test)                         (new list)
lib/ai/outlineToVisuals.ts (+ test)                                                  (flow direction only)
lib/ai/infographic/** (+ tests)
components/ai/renderers/InfographicRenderer.tsx (+ test), components/ai/renderers/visualIconMap.tsx (new)
components/collabboard/editors/OutlineSuggestionsPanel.tsx
components/collabboard/editors/OutlineTextEditor.tsx (new, the Edit text form)
components/collabboard/editors/AIComponentEditor.tsx (+ its tests)                   (wiring only; keep it small)
```
Forbidden: the database, `package.json`, the other AI routes, `CodeDiagramRenderer.tsx`, the DOMPurify profile,
`MindmapTreeRenderer.tsx`, credit costs. If a census pins the outline route's request shape or the panel's markup,
STOP and ask. Every new test path must be collected by `vitest.config.ts` (check; STOP if not).
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai app/api/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-237.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** the seasons text → icons on the cycle (sun/leaf/snowflake…); Customize → Summary + "make it a
pyramid" → one more AI call, pyramid first with short labels; Keep my wording → labels use the text's words; Edit
text → rename an item, the picture updates with no AI request; Flow → Top to bottom with no AI request; save,
reopen, still editable; delete the test post.

## Commit message (verbatim)
```
feat(ai): customize, edit and add icons to AI pictures

Like napkin.ai: after the first suggestions, Customize asks again with
a chosen detail level, the user's own wording or a named design (one AI
call). Edit text changes the title and items and redraws at once with no
AI call. Each item can carry an icon from a fixed set, drawn inside the
stack, stairs, cycle, hub, pyramid and funnel designs.
```

## Addendum 1 (CTO, live review): two fixes
Live (seasons text): icons drawn in cycle/hub/stairs (flower, sun, leaf, snowflake); Edit text renamed an item and
the preview updated with NO AI request; Flow → Top to bottom with NO AI request; Customize (Summary + "pyramid") made
exactly one `generate-outline` request carrying `options` and the labels came back short with no details; save
POST 201; reopening offered 10 designs and Edit text with NO AI request. Test post `29261626` deleted (DELETE 204).
Defects:
1. **"Make it a… pyramid" is ignored in the ranking.** `AIComponentEditor` calls `suggestDesigns(data.outline)`
   (~681) without `preferKey`, so the hint never reaches `preferKeyFromHint`. Pass the hint used for that Apply
   (`suggestDesigns(data.outline, { preferKey: options.visualHint })`), and keep it for later local re-ranks in
   that session (Edit text's `applyEditedOutline` and the flow-direction re-derive also pass it). Test (editor):
   Apply with hint "pyramid" → the first `data-ai-outline-option` is `infographic:pyramid` with "Best match".
   Mutation: drop the `preferKey` argument → the test fails.
2. **The tiles area is squeezed to a sliver** under the large preview (one row barely visible). In
   `OutlineSuggestionsPanel`, cap the large preview at 55% of the panel's height (it scrolls inside if taller) and
   give the tiles list a minimum height of 220px; the Customize bar stays below the tiles. Test: source/DOM test for
   the preview's max-height style and the tiles' min-height.
Re-run the verification and the full gate (`--outputFile=.opencode-vitest-237b.json`).

## Addendum 2 (CTO, 2026-10-01): live result after Addendum 1
Seasons text → Customize "pyramid" → exactly one more `generate-outline` request; Pyramid is first with "Best
match" (before: Cycle stayed first). The preview is capped (288px) and the tiles area keeps 238px with a full row of
thumbnails visible. Nothing saved in this run. Gate `.opencode-vitest-237b.json`: extra [] missing []; tsc clean;
no mutation text left in the diff. Note: the finishing steps ran in a fresh DeepSeek session
(`ses_f09f723bfffejN4CANRIPBfauO`) after the long one twice emitted tool calls as plain text.
