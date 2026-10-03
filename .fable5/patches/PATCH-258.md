# PATCH-258 — Editing text on an AntV picture keeps the zoom and position

Status: AUTHORIZED (owner, 2026-10-03, screenshot of the AntV text toolbar on "40% of the total budget allocation":
"Zoom is all over the place! You click on the text and the zoom jumps back!").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-257 (`906e163e`).

## Why (CTO reproduction, 2026-10-03)
AntV `list-grid-badge-card`, teal-night theme, zoom + ×3 → 86 %, viewBox `60.8 -140.7 526.4 488.0`. Click a label →
toolbar; double-click → inline editor; type; click outside → the edit is kept, but the viewBox snaps back to the fit
view `-50.1 -11.4 748.3 261.7` while the zoom display still says 86 %. Same on `chart-pie-compact-card` (63 % → fit).
Cause: an edit changes the outline → `AntvInfographicRenderer` calls `instance.update(...)` → AntV rewrites the SVG's
`viewBox` to its own fit. `PictureStage` (`components/ai/renderers/PictureStage.tsx` ~250-280) observes the mutation
but, once `naturalRef` is set, only re-fills width/height (`fillSvg`) — it never re-applies the user's current view.
The same happens for any redraw while zoomed (colour change, Colours & Fonts, value edits).

## Design (PictureStage AntV mode only)
- Keep the user's current view in a ref (the viewBox the stage last wrote). In the MutationObserver: when the SVG's
  `viewBox` attribute differs from that ref (AntV wrote its own after an update), take AntV's new viewBox as the new
  `natural` (the content may have changed size) and **write the user's current view back** — unless the stage is at
  Fit (then fit to the new natural, so a fitted picture stays fitted when content grows/shrinks).
- Never loop: ignore mutations caused by the stage's own `setAttribute` (compare against the string just written).
- `resetKey` changes (another design / theme) still reset to Fit as today.
- The zoom display always matches the viewBox actually shown.

## Tests
- `components/ai/renderers/PictureStage.test.tsx` (jsdom; a child that rewrites its svg `viewBox` on demand):
  - zoom in, then the child rewrites the viewBox → the stage writes the zoomed view back, the display is unchanged;
  - at Fit, the child rewrites the viewBox with a bigger natural box → the stage stays at Fit of the NEW box;
  - a `resetKey` change → Fit;
  - no infinite mutation loop (the observer callback count stays bounded).
- **Mutation** (revert with Edit): drop the write-back → the first test fails.

## Allowed files
```
components/ai/renderers/PictureStage.tsx (+ PictureStage.test.tsx)
```
Forbidden: everything else. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution, no test
files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the dev
server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-258.json
```
The CTO compares the gate. Compact report. Do not commit.

**Live (CTO):** zoom in on an AntV design, edit a label and a description, change a colour → the view stays where it
was; Fit still fits; switching design resets to Fit.

## Commit message (verbatim)
```
fix(ai): editing a picture no longer resets the zoom

After changing a text or colour on a picture, the preview jumped back
to the whole picture while still showing the old zoom number. It now
keeps the zoom and position you chose.
```

## Addendum 1 (CTO, 2026-10-03): one live regression fixed, live result
Live #1: the write-back worked, but after a theme change (resetKey) the zoom DISPLAY said 16 % for a fitted picture
(it measured AntV's transient thin SVG) → the display now uses the measured stage viewport; the stage ignores its own
last write so the natural box is AntV's final one; test added (red 16 → green 60).
Final live (own tab, nothing saved): list-grid-badge-card + teal-night → Fit shows 76 %; zoom to 101 %, click a label
(toolbar), double-click, type, click away → the edit is kept AND the view stays at 101 % (before: snapped to Fit while
showing 86 %). Gate `.opencode-vitest-258.json`: extra [] missing []; tsc clean.
Seen, not in scope: the dark AntV theme paints a near-black box inside our teal-night ground.
