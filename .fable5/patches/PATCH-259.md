# PATCH-259 — Dark themes no longer show a black box inside the picture

Status: AUTHORIZED (owner, 2026-10-03: "You are the PM implement Patch 259 - 262").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-258 (`ff1e4659`).

## Why (CTO live, 2026-10-03)
AntV `list-grid-badge-card` with our "teal-night" theme: our container is teal (`theme.background`), but AntV's own
`rect[data-element-type="background"]` is painted by AntV's built-in `dark` theme in its near-black default, so a
black box sits inside the teal frame. `toAntvOptions` (`lib/ai/antv/mapOutline.ts` ~228) only sets
`themeConfig.colorBg` when the user chose a custom background (PATCH-253).

## Design
- `toAntvOptions`: when the resolved theme is DARK (`themeById(themeId).dark`, i.e. teal-night and midnight) and no
  custom style background is set, set `themeConfig.colorBg = themeById(themeId).background`. A custom
  `style.background` still wins (PATCH-253). Light themes stay byte-identical to today (the PATCH-253 "without a style"
  deep-equal test must still pass for light themes; update it only for dark themes, and say so).

## Tests
- `lib/ai/antv/mapOutline.visualStyle.test.ts` (or a new mapOutline test): teal-night → `themeConfig.colorBg ===
  VISUAL_THEMES['teal-night'].background`; midnight likewise; classic → no `colorBg` key; teal-night + style
  background → the style's colour.
- **Mutation** (revert with Edit): drop the dark-theme `colorBg` → the test fails.

## Allowed files
```
lib/ai/antv/mapOutline.ts (+ its tests)
```
Forbidden: everything else. Real tool calls only; one test file at a time with `--reporter=dot`; never pipe vitest;
NEVER compare results with diff/process substitution; revert mutations with Edit; no git writes; no production build;
no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-259.json
```
The CTO compares the gate. Compact report. Do not commit.

**Live (CTO):** teal-night and midnight on an AntV list, pie and mind map: no dark box, one even ground.

## Commit message (verbatim)
```
fix(ai): dark colour themes no longer show a black box in the picture

With the dark colour themes the AntV designs drew their own near-black
background inside our coloured frame. They now use the theme's own
background colour.
```

## Addendum 1 (CTO, 2026-10-03): live result
Own tab, nothing saved: teal-night and midnight × AntV list-grid-badge-card, chart-pie-compact-card,
hierarchy-mindmap-branch-gradient-capsule-item → AntV's background rect `#1E4D46` / `#0F1E3D` equals the frame
`rgb(30,77,70)` / `rgb(15,30,61)` in all six (before: near-black box). Gate `.opencode-vitest-259.json`: extra []
missing []; tsc clean; the mutation failed 2 tests and was reverted.
