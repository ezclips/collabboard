# PATCH-264 — The diagram type label ("MINDMAP", "INFOGRAPHIC", …) can be changed or removed

Status: AUTHORIZED (owner, 2026-10-03, screenshot of the generator preview with "MINDMAP" circled: "Make the
diagramm type title editable so user can remove it or change it").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-263.

## Why
Every diagram renderer prints a fixed small uppercase label above the title: `mindmap` (MindmapTreeRenderer, twice),
`infographic` (InfographicRenderer, AntvInfographicRenderer), `timeline`, `comparison`, and the chart/code renderers'
own labels. It is the renderer's name, not the user's content, and it cannot be changed or removed. The Photo Card
already solved this (`PhotoCardData.kicker`, PATCH-era: "an explicit empty string means the user cleared it").

## Design
### A. Data
- `lib/ai/contracts.ts`: `DiagramDataBase` gains `kicker?: string` with the Photo Card's meaning: `undefined` → the
  renderer's default label (exactly today's text, so every stored post looks the same); `''` → no label at all (no
  empty gap either); any other string → shown (uppercase styling as today).
- `lib/ai/validators.ts`: every diagram schema accepts `kicker: z.string().max(40).optional()`.
- The AI never sets it: the generate routes do not ask for it; if a model output carries `kicker` it is dropped where
  the diagram data is parsed from the model (same pattern as `valuesEstimated` / `elementOverrides`). If that would
  touch a file outside the allowed list, say so in the report instead.
### B. One shared component (new `components/ai/renderers/DiagramKicker.tsx`, < 200 lines)
- `<DiagramKicker value={data.kicker} fallback="mindmap" color={theme.muted} className=… />` renders the label with
  the current styling (`text-[11px] font-semibold uppercase tracking-[0.18em]`). `value === ''` and not editing →
  renders nothing.
- Editing comes from a React context `DiagramKickerEditContext` (`{ onChange(next: string | undefined): void } |
  null`), so no renderer's props change. Without a provider (the board, thumbnails, design tiles) it is plain text.
- With a provider (edit mode):
  - the label shows a dashed outline on hover (`data-ai-kicker`), click → inline edit (contentEditable or a small
    input, `data-ai-kicker-input`), Enter or blur commits the trimmed text (max 40 chars), Escape cancels;
    committing an empty text is the same as removing;
  - a small × on hover (`data-ai-kicker-remove`, hint "Remove label") → `onChange('')`;
  - when removed (`''`), a faint "+ Add label" chip (`data-ai-kicker-add`) shows in its place, in edit mode only;
    clicking it restores the default (`onChange(undefined)`) and opens the inline edit;
  - pointerdown on the label, the × and the chip must not start a PictureStage pan: mark them
    `data-picture-control="true"` and stop pointerdown propagation (lesson from PATCH-261).
- Use it in every renderer that prints such a label: `MindmapTreeRenderer` (both places), `InfographicRenderer`,
  `AntvInfographicRenderer`, `TimelineDiagramRenderer`, `ComparisonDiagramRenderer`, `ChartDiagramRenderer`,
  `CodeDiagramRenderer`. The fallback text of each stays exactly today's text.
### C. Where it is editable
- **Generator preview** (`components/collabboard/editors/AIComponentEditor.tsx`, the main preview only, not the design
  tiles or the hover preview): wrap the preview renderer in the provider. The value lives in the editor's state, is
  applied to the data that is previewed and saved, and SURVIVES switching designs, regenerating, and the other side
  panels (a label the user removed stays removed). Reset when the generator opens fresh.
- **Edit window** (`components/ai/editors/AIContentEditModal.tsx`): same provider around its preview; Save writes it.
- Both files are already over 800 lines: put the state/apply logic in a small new hook
  (`components/ai/renderers/useDiagramKicker.ts` or similar) and add only the wiring lines to the two big files.

## Tests
- `DiagramKicker.test.tsx`: undefined → fallback; custom → shown; `''` → nothing rendered; with a provider: click →
  edit, Enter commits trimmed text, 41+ chars truncated to 40, Escape cancels, empty commit → `''`, × → `''`, "+ Add
  label" → `undefined` and edit opens; pointerdown on the label does not reach a parent pointerdown listener.
- Renderer tests (one per renderer touched, in its existing test file or a new small one): `kicker: ''` shows no
  label, `kicker: 'Q3 plan'` shows it, absent → today's text.
- `validators` test: `kicker` accepted up to 40 chars, 41 rejected.
- Generator test: remove the label, switch design → still removed; Save → the saved data has `kicker: ''`.
- Edit window test: change the label, Save → `onSave` data has the new kicker.
- Mutation (revert with Edit): treat `''` like `undefined` in DiagramKicker → a test fails.

## Allowed files
```
lib/ai/contracts.ts, lib/ai/validators.ts (+ tests)
components/ai/renderers/DiagramKicker.tsx (+ test)                 new
components/ai/renderers/useDiagramKicker.ts (+ test)               new, if used
components/ai/renderers/{MindmapTree,Infographic,AntvInfographic,TimelineDiagram,ComparisonDiagram,ChartDiagram,CodeDiagram}Renderer.tsx (+ tests)
components/collabboard/editors/AIComponentEditor.tsx (+ tests)     wiring only
components/ai/editors/AIContentEditModal.tsx (+ tests)             wiring only
the route/parser file that parses model diagram data (strip kicker) (+ test) — name it in the report
```
Forbidden: everything else (PictureStage, the database, package.json). Real tool calls only (never write a tool call
as plain text); one test file at a time with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results
with diff/process substitution, no test files outside the repo; revert mutations with your Edit tool; no git writes;
no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-264.json
```
The CTO compares the gate. Short report listing every file changed. Do not commit.

**Owner, 2026-10-03: "make ALL diagram titles editable, not just Mind Maps"** — the label must be renamable and
removable on EVERY diagram type, so the live pass covers each: our mind map, our infographic, an AntV design, timeline,
comparison, pie chart, bar chart, flowchart.

**Live (CTO):** every type above: rename + remove in the generator; then in detail on our mind map: rename "MINDMAP" to "Project files", switch to an AntV design (label stays),
remove it (no gap), switch design (still removed), "+ Add label" restores; save; board shows no label; Edit window:
add "Q3", save; board shows "Q3"; delete my test post.

## Commit message (verbatim)
```
feat(ai): rename or remove the small label above an AI picture

The "MINDMAP" / "INFOGRAPHIC" label above a picture's title can now be
clicked to rename it, or removed with its x, in the generator and the
Edit window. A removed label leaves no gap and can be added back.
```

## Final result (CTO, 2026-10-03, two live rounds)
Round 1 found two defects, both fixed with tests that model the real sequence: "+ Add label" re-committed `''`
(draft seeded from `value ?? fallback` while `value` was still `''`), and a nested `<button>` React error because the
read-only decision for design tiles ran in an effect after the first render (now `DiagramKickerReadOnly` wraps the
tiles and the hover preview).
Round 2, own tab, generator: rename, remove (no gap) and "+ Add label" restore pass on EVERY type — our mind map,
our infographic, comparison, flowchart, an AntV design, pie, bar, timeline; no console errors. A label set on the mind
map carries to an AntV design; removed there it stays removed back on the mind map. Saved with the label removed: no
label on the board. Edit window: "+ Add label" → "Q3", Save: the board shows "Q3", also after reload. Gate
`.opencode-vitest-264.json`: extra [] missing [] (path-format duplicate only; the first run's
`AIComponentEditor.patch257` was a collection flake, 6/6 alone); tsc clean. Test post deleted.
Noted for a follow-up: AntV designs default to "infographic" even when they draw a pie, a bar chart, a timeline or a
mind map (the AntV renderer's fallback is fixed); a per-template-family default would read better.
