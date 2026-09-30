# PATCH-233 — "Show options": one AI answer, several pictures to choose from (Napkin-style)

Status: AUTHORIZED (owner, 2026-09-30: text-to-visual like napkin.ai; "yes write the spec").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-232

## Why (CTO)
Napkin (checked live on the owner's page) does not let the AI draw. The AI extracts the STRUCTURE of the text
(title, main points, details, relations), then designed templates draw it, and the user picks among several
pictures of the same content. We already have the templates: AI Component → Diagram has renderers for mind map
and flowchart (Mermaid), comparison, timeline, pie and bar. What we lack is: one structure, several pictures,
pick one. Today each subtype is a separate AI call with its own schema, and the user must guess the type first.

## Design
### 1. The outline (new `lib/ai/outline.ts`)
- Type + zod schema:
  ```ts
  interface VisualOutline {
    title: string;                 // 1..80 chars
    ordered: boolean;              // true when the points are steps / a sequence in time
    items: Array<{                 // 2..8 items
      label: string;               // 1..40 chars
      detail?: string;             // ..140 chars
      date?: string;               // ..24 chars, only when the text gives one
      children?: Array<{ label: string }>;  // 0..6, each 1..40 chars
    }>;
  }
  ```
- `OUTLINE_SYSTEM_PROMPT`: extract the structure of the user's text as JSON only, matching the schema; keep
  labels short; do not invent facts not in the text; `ordered` true only for steps or chronology.
- `parseOutline(raw: unknown): VisualOutline` — validates, trims over-long strings to the limits rather than
  failing, drops empty children; throws a typed error only when fewer than 2 usable items remain.

### 2. Server route (new `app/api/ai/generate-outline/route.ts`)
- Same shape as `app/api/ai/generate-component/route.ts`: auth (401), the same rate limit helper pattern,
  body `{ prompt: string (1..4000), boardId?: uuid }`, `generateComponentText({ … creditFeature: 'component',
  creditCost: 1 … })` with `OUTLINE_SYSTEM_PROMPT`, the same error mapping (credit refusal, BYOK 400, provider
  errors via `aiProviderErrorStatus`), JSON parse like `parseModelJson`, then `parseOutline`.
- Response: `{ outline: VisualOutline, generatedBy: AIGenerationAttribution }`. Nothing is stored.
- If `boardId` is present, apply the same `canReadBoardKnowledge` check the component route applies.

### 3. Outline → pictures, locally (new `lib/ai/outlineToVisuals.ts`, pure)
`outlineToVisuals(outline): Array<{ key, label, envelopeData: DiagramData }>` producing existing data shapes
only, in this order:
- **Mind map** (`MindmapDiagramData`, Mermaid `mindmap`): root = title in `((…))`, each item a branch, children as
  leaves. Always offered.
- **Comparison** (`ComparisonDiagramData`): each item a column (`heading` = label), points = children labels, or
  the detail if no children. Offered when 2..4 items.
- **Flow** (`FlowDiagramData`, Mermaid `flowchart LR`): items chained in order, node text = label. Offered when
  `ordered` is true, or when there are ≤ 6 items.
- **Timeline** (`TimelineDiagramData`): items in order with `dateLabel` = date, description = detail. Offered
  only when `ordered` is true.
- Mermaid text safety: every label goes through one `mermaidLabel(s)` helper that removes characters Mermaid
  treats as syntax in node text (`[]{}()<>"`|#;` and backticks), collapses whitespace, and wraps the result in
  double quotes where the syntax allows (flowchart `A["…"]`). Mind map lines are indented with two spaces per
  level. Never emit user text outside a label.

### 4. The editor (`components/collabboard/editors/AIComponentEditor.tsx`)
- In Diagram mode, a new first subtype chip **"Show options"** (recommended badge, like Auto). With it selected,
  Generate calls `/api/ai/generate-outline` instead of `/api/ai/generate-component`.
- The Preview area shows the options from `outlineToVisuals` as a grid (2 columns, each a scaled-down live
  render through the existing `AIContentRenderer`, with its label under it). Clicking one selects it (indigo
  ring); the first is selected by default.
- "Save to Canvas" saves the selected option exactly as a normal generation of that subtype would be saved:
  the same envelope (`mode: 'diagram'`, `meta.renderer`, `meta.subtype` = the option's subtype, `meta.prompt`,
  `meta.createdAt`, `meta.generatedBy` from the response). So stored data, renderers and the board are unchanged.
- The other subtype chips and modes work exactly as today.

## Tests
- `lib/ai/outline.test.ts`: valid outline passes; long strings trimmed; <2 items → the typed error; extra
  fields dropped.
- `lib/ai/outlineToVisuals.test.ts`: which options appear for ordered/unordered and 2/4/6/8 items; mind map text
  (indentation, root); flowchart text with hostile labels (`a"b]c{d}|e`) contains no unescaped syntax; comparison
  and timeline shapes match the existing types.
- `app/api/ai/generate-outline/route.test.ts` (mock `generateComponentText` like the component route's tests):
  401 without user; 400 bad body; credit refusal mapping; a valid model reply → `{ outline, generatedBy }`;
  invalid JSON → the same error status the component route uses.
- Editor behaviour test: "Show options" → the outline route is called (not the component route); the grid shows
  the options; clicking the second then Save passes that option's envelope to the save callback.
- **Mutations:** skip `mermaidLabel` in the flowchart → the hostile-label test fails; save the first option
  regardless of selection → the editor test fails.

## Allowed files
```
lib/ai/outline.ts, lib/ai/outlineToVisuals.ts (+ tests)                 (new)
app/api/ai/generate-outline/route.ts (+ test)                           (new)
components/collabboard/editors/AIComponentEditor.tsx                    (the chip, the call, the grid, the save)
components/collabboard/editors/*.test.tsx                               (the behaviour test)
vitest.config.* ONLY if the new route test directory is not already included (say so)
```
Forbidden: the database / migrations, `package.json`, `lib/ai/contracts.ts` stored shapes, the existing
renderers, `generate-component/route.ts`, `componentGeneration.ts`. If a census pins the editor's subtype list,
STOP and ask.
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai app/api/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-233.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** AI → Diagram → Show options with the Napkin example text → one AI call, 3-4 picture options,
select one, preview only (the CTO saves one test post, checks it on the board, then deletes it).

## Commit message (verbatim)
```
feat(ai): "Show options" turns one AI answer into several pictures

Like napkin.ai, the AI now extracts the structure of the text once --
title, points, details, order -- and the app draws it several ways
(mind map, comparison, flow, timeline) for the user to pick from. One
AI call, several pictures; the chosen one is saved exactly like a normal
AI diagram.
```

Addendum 1 (CTO): authorized - lib/infra/knowledge/knowledgeSourceAiWiring.source.test.ts: add `generate-outline` to the sorted route list and one comment line in the existing style: "generate-outline: PATCH-233, Show options outline for AI diagrams; likewise unreachable from the PDF Source AI panel." Nothing else in that file.

## Addendum 2 (CTO, 2026-10-01): live result
AI → Diagram → Show options with the Napkin example text: exactly ONE AI request (`POST generate-outline`), then
three options rendered side by side with every label visible: Mind map, Comparison (3 columns), Flow
(Engagement → Credibility → SEO); no Timeline since the text is not ordered. Save to Canvas stored the selected
option as a normal ai-component post; on the board it rendered (`data-ai-render-state="done"`) as a mind map.
The CTO's test post `de62405c` was deleted through its own menu (DELETE 204).
Gate `.opencode-vitest-233.json`: extra [] missing []; tsc clean. `vitest.config.ts` now includes
`app/api/ai/**/*.test.ts` (only the new route test lives there).
Follow-ups noted: the option previews are small; the pictures are plain next to Napkin (design pass next).
