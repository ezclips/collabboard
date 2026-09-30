# PATCH-232 — AI mind maps and flowcharts get stuck on "Rendering diagram…"

Status: AUTHORIZED (owner, 2026-09-30: text-to-visual work; this is the prerequisite fix the CTO found).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-231 (`74c78bf6`)

## Why (CTO, reproduced live)
AI Component → Diagram → Mindmap: the preview says "Rendering diagram…" forever (waited 20s+, three runs, no
console error). The Mermaid chunks load (200). The same mind map renders in 30-83ms with plain Mermaid 11.13.0
and our exact `initialize` config on a blank page, so Mermaid is fine.

Cause: `components/ai/renderers/CodeDiagramRenderer.tsx` ~45-70. The effect records `lastCodeRef.current =
data.code` BEFORE the async render, and returns early when the code equals it. React StrictMode (dev) runs the
effect, runs its cleanup (`cancelled = true`, so the first result is thrown away), then runs it again — and the
second run returns early because `lastCodeRef` already holds the code. Nothing ever sets the phase. The same
happens in production whenever the effect re-runs with the same code (e.g. a `data.subtype` change, or a
remount of the same element tree).

## Design
- Remove the `lastCodeRef` early return. The effect's dependency array (`[data.code, data.subtype]`) already
  prevents re-rendering on unrelated parent re-renders; `cancelled` already discards stale results.
- When the code changes, set the phase back to `{ phase: 'loading' }` before starting the new render (so an old
  diagram is not shown under a new title).
- Add a safety timeout: if the render has not resolved in 15s, set the `failed` phase and track the fallback
  with reason `'timeout'` (existing `trackAIRenderFallback`). The existing failed UI is what the user sees.
- Nothing else changes (sanitising, styling, the diagram engine).

## Tests
- `components/ai/renderers/CodeDiagramRenderer.test.tsx` (new or extend; mock `renderDiagramCode`):
  - rendered inside `<React.StrictMode>` → reaches `data-ai-render-state="done"` with the svg;
  - re-rendered with the same code but a different subtype → still ends `done` (not stuck on loading);
  - a new code → shows loading, then the new svg; a stale first result arriving after the second is ignored;
  - a render that never resolves → `failed` after 15s (fake timers) and the fallback is tracked with `timeout`.
- **Mutation:** put back the `lastCodeRef` early return → the StrictMode test fails.

## Allowed files
```
components/ai/renderers/CodeDiagramRenderer.tsx
components/ai/renderers/CodeDiagramRenderer.test.tsx   (new or extend)
```
Forbidden: everything else. If another test pins `lastCodeRef`, STOP and ask.
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/ai
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-232.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** AI Component → Diagram → Mindmap and Flowchart previews render (nothing saved to the board).

## Commit message (verbatim)
```
fix(ai): diagrams no longer stick on "Rendering diagram…"

The diagram renderer remembered the code before drawing it and skipped
any second attempt with the same code. React runs effects twice in
development and throws the first result away, so the second attempt was
skipped and mind maps and flowcharts never appeared. It now draws on
every attempt, keeps only the latest result, and gives up with the
normal error view after 15 seconds instead of spinning forever.
```

Addendum 1 (CTO): authorized - add ONLY `components/ai/renderers/*.test.tsx` to the vitest.config.ts include list (next to components/ai/*.test.tsx). If other existing files in that folder start running and fail, STOP and list them.

## Addendum 2 (CTO, live): the diagrams render, but every label is empty
After the fix, the mind map and flowchart draw, but all boxes are blank. Proven on a blank page with the same
Mermaid 11.13.0 + DOMPurify: with Mermaid's default HTML labels, the svg carries its text inside
`<foreignObject>` HTML, and `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })` strips it
(0 text left). With `htmlLabels: false` (global) and `flowchart: { htmlLabels: false }`, Mermaid emits SVG
`<text>/<tspan>` (26 text elements in the mind map, 13 in the flowchart) and every label survives the same
sanitiser. Fix in `lib/ai/diagram-engine.ts` ONLY: add `htmlLabels: false` and `flowchart: { htmlLabels: false }`
to `mermaid.initialize`. Keep `securityLevel: 'strict'` and the DOMPurify profile unchanged (do NOT allow
foreignObject/HTML). Test: a source test in `components/ai/renderers/` (or `lib/ai` if included) pinning both
settings and `securityLevel: 'strict'`.

## Addendum 3 (CTO, 2026-09-30): live result
AI Component → Diagram → Mindmap and Flowchart (the Napkin example text), preview only, nothing saved: both render
within the wait with every label visible (mind map: root + 3 branches + 6 leaves; flowchart: 10 nodes). Before:
stuck on "Rendering diagram…", then (after the effect fix) drawn with blank labels.
Full gate `.opencode-vitest-232b.json`: extra [] missing []; tsc clean.
