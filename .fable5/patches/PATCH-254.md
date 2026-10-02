# PATCH-254 — Designs arrive 3–6× faster (no "thinking" for the outline call) and the wait shows progress

Status: AUTHORIZED (owner, 2026-10-02: "When you click on Diagram it takes a long time to load the diagrams" → CTO
proposal "show progress while the AI works; test a faster model" → "OK").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-253.

## Why (CTO measurements, 2026-10-02)
Live, from opening the AI window: Diagram shown 0.6 s, the outline answer took **5.2 s**, designs + preview drawn
0.4 s after it; only 10 of 48 thumbnails were drawn (lazy drawing already works). The wait is the AI.
The managed default `deepseek-flash` THINKS by default (see `lib/server/ai/providers/deepSeek.ts`), and
`generateComponentText` (`lib/server/ai/componentGeneration.ts` ~138) never passes `reasoning`, so every outline call
thinks first. Direct calls with the exact `OUTLINE_SYSTEM_PROMPT`, `deepseek-flash`, temperature 0.4, 2 runs per text:

| text | thinking on | thinking off |
|---|---|---|
| event costs (no numbers) | 8.3 s (1646 reasoning tok) / 3.5 s | 1.2 s / 0.8 s |
| onboarding steps | 4.1 s / 4.1 s | 1.4 s / 1.0 s |
| budget with % | 1.9 s / 2.8 s | 1.0 s / 0.9 s |

The outlines were the same (same kind, items and values). Thinking off is 3–6× faster and uses ~120 instead of
300–1,700 completion tokens.

## Design
### A. The outline call runs without thinking (server)
- `ComponentGenerationInput` gains `readonly reasoning?: 'off'` (doc: "the provider's documented no-thinking switch;
  only adapters that support it read it") and `generateComponentText` forwards it to `adapter.generateText` only when
  set. Every other caller is unchanged (no `reasoning` key sent).
- `app/api/ai/generate-outline/route.ts` passes `reasoning: 'off'`. Nothing else in the route changes (same budget,
  temperature, timeout, credits).
### B. The wait shows progress (client)
- `AIComponentEditor.tsx`: while an OUTLINE request runs (Show options / a family button / Make chart / Customize
  Apply — i.e. the `generate-outline` path; `stage` is `classifying | generating | rendering`):
  - the preview shows, instead of today's full white overlay, a calm placeholder: a grey rounded picture shape with a
    soft pulse and one line of text that follows the real steps: "Reading your text…" while waiting for the answer,
    "Drawing designs…" from the answer until the designs are on screen (`data-ai-outline-progress`, `aria-live="polite"`);
  - the side panel opens on Designs (window widens as in PATCH-252) and shows 8 grey placeholder tiles in the same
    2-column grid (`data-ai-designs-skeleton`, pulse, `aria-hidden`), replaced by the real tiles when they arrive;
  - on a REGENERATE (designs already on screen) the current designs stay visible but dimmed (`opacity-50`,
    `pointer-events: none`) with the same progress line over the preview, instead of disappearing.
  - The other modes (lesson board, photo card, the old single generators) keep today's spinner.
- Respect `prefers-reduced-motion` (no pulse).

## Tests
- `lib/server/ai/componentGeneration` test: `reasoning: 'off'` reaches the adapter; omitted → the adapter input has no
  `reasoning` key.
- Route test: the outline route calls `generateComponentText` with `reasoning: 'off'`.
- Editor test (mocked fetch held open): during an outline request the progress line says "Reading your text…", the
  side panel shows `data-ai-designs-skeleton` with 8 tiles; after the response the skeleton is gone and real tiles
  show; a regenerate keeps the old tiles visible (dimmed) while waiting; the lesson-board mode still shows the old
  spinner.
- `lib/server/ai/tokenBudgets.test.ts` must still pass unchanged.
- **Mutations** (revert with Edit): (1) drop `reasoning: 'off'` from the route → the route test fails; (2) remove the
  skeleton → the editor test fails.

## Allowed files
```
lib/server/ai/componentGeneration.ts (+ its test)
app/api/ai/generate-outline/route.ts (+ route.test.ts)
components/collabboard/editors/AIComponentEditor.tsx (+ new AIComponentEditor.patch254.test.tsx)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ tests) ONLY if the skeleton is best placed there
```
Forbidden: everything else (provider adapters, other AI routes, token budgets, the database, `package.json`).
Real tool calls only (never write a tool call as plain text); one test file at a time with `--reporter=dot`, never
pipe vitest into grep/head, no test files outside the repo; revert mutations with your Edit tool; no git writes; no
production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/server/ai app/api/ai/generate-outline components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-254.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** time Generate → designs on the same texts (expect ~1–2 s instead of ~5 s); check the outlines and the
Make-pie-chart estimates still look right; the placeholder and progress line show while waiting; a Regenerate keeps
the old designs dimmed.

## Commit message (verbatim)
```
perf(ai): diagram designs arrive several times faster

The AI no longer "thinks" before writing the short list of points a
diagram needs; measured 3-6x faster with the same results. While it
works, the window shows what is happening and placeholder designs
instead of a blank screen.
```

## Addendum 1 (CTO, 2026-10-03): one small follow-up from PATCH-253
### C. Title font on AntV hierarchy designs
AntV hierarchy / mind-map templates draw the title as the ROOT item (see `mapOutline.ts`, the root datum gets the
title style as `attributes.label`). With a `style.fonts.title`, `toAntvOptions` must put that fontFamily/fontWeight on
the root datum's `attributes.label` too (a stored PATCH-244 title style still wins). Test in
`lib/ai/antv/mapOutline.visualStyle.test.ts`: a hierarchy template with a title font → the root datum carries it;
a flat template is unchanged. Allowed file added: `lib/ai/antv/mapOutline.ts` (+ that test).

## Addendum 2 (CTO, 2026-10-03): live result
Live (own tab, nothing saved), Generate → designs on screen, end to end in the browser: 7.1 s on the first call (the
dev server recompiled the changed route), then 2.0 s and 2.3 s (before: ~5–6 s). The outlines are the same as with
thinking (event costs: Venue/Food/Miscellaneous; onboarding: 5 steps; budget: 40/30/20/10). Make pie chart estimate
3.5 s, plausible (Venue 50 / Food 35 / Misc 15). While waiting: "Reading your text…", the grey picture shape and 8
placeholder tiles in the docked panel; on Regenerate the old designs stay, dimmed. 5 generate-outline calls, 0 padlet
writes, 0 console errors. Section C (AntV mind-map title font) verified by unit tests only, not live.
Gate `.opencode-vitest-254.json`: extra [] missing [].
