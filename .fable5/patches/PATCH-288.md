# PATCH-288 — Resize drawing posts on the board; a real Apply button

Status: AUTHORIZED (owner, 2026-10-05: "I know you asked me about the size of the drawing post on the canvas to be one
you can't change but I simply can't read it unless I go up to 300% so we need to be able to increase the size" and
"add box around apply button").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Why
A drawing post on the Freeform board is a fixed 180 px card whose preview is capped at 300 px high, so a chart drawn
in it is unreadable at 100 % zoom. The resize policy deliberately excluded drawings (POST-RESIZE-B2: "container /
comment / drawing → none"); the owner now reverses that. AI posts already resize by width with the picture scaling
along — drawings get the same. The drawing preview is an SVG (`exportToSvg`), so it stays sharp at any width.
Separately, the PATCH-287 panel's Apply is unstyled text and does not read as a button.

## Facts (CTO-verified)
- `lib/domain/canvas/postResizePolicy.ts` `getPostResizeCapability`: `drawing` falls to `default → 'none'`; pinned by
  `postResizePolicy.test.ts` "B2 exposes nothing else: container/comment/drawing -> none".
- `FreeformPadletCards.tsx` generic card (~L3585–3780): `resizeMode` + `manualGeometry =
  getManualResizeDimensions(padlet)` (marker-gated: `metadata.manualSize === true` + valid geometry); width
  `manualGeometry ? manualGeometry.width : '180px'`; the generic `PostResizeHandle` branch already serves
  `'horizontal-only'` types (link, table) when selected, committing through `commitPostResize` (sets the marker).
- `PostCardContent.tsx` drawing branch (~L904–945): `<img … className="w-full h-auto object-contain max-h-[300px]">`.
- `AntvChartValuesControl.tsx` L209 (Cancel) and L273 (Apply) are bare `<button style={{cursor:'pointer'}}>`; styles
  live in `AntvChartValuesControl.styles.ts`.

## Design
1. **Policy.** `drawing → 'horizontal-only'`; `POST_RESIZE_CONSTRAINTS.drawing = { minWidth: 180, minHeight: 0 }`
   (180 = today's card width, so a first resize never jumps; height follows the picture). Update the doc comment.
   No other type changes.
2. **Board card.** Nothing new in `FreeformPadletCards.tsx` beyond what the policy change brings, unless a drawing
   needs a line to reach the existing generic horizontal-only handle path — then wiring only, net ≤ +6 (the file is
   far over the ceiling; the logic stays in the policy). A drawing that was never resized keeps exactly today's look
   (180 px, preview capped at 300 px).
3. **Preview.** `PostCardContent.tsx` drawing branch: when the post is manually sized
   (`isManuallySizedPost(padlet)` from the policy module), drop the `max-h-[300px]` cap so the preview scales with
   the card's width (`w-full h-auto object-contain`); otherwise unchanged. Hidden-frame (`fullView`) drawings behave
   the same.
4. **Apply / Cancel.** In `AntvChartValuesControl.styles.ts` add `primaryButtonStyle` (filled `#2563eb`, white text,
   `border: 1px solid #2563eb`, radius 6, padding `6px 14px`, font-weight 600; disabled → opacity .6, cursor
   default) and `secondaryButtonStyle` (white, `1px solid #d1d5db`, radius 6, same padding, text `#374151`). Apply
   uses primary, Cancel uses secondary; they sit right-aligned with an 8 px gap. Keep the data attributes.

## Tests
- policy: `drawing → 'horizontal-only'`, constraints `{180, 0}`; update the B2 test to `container/comment → none`
  (state in the test name that drawing moved in PATCH-288).
- PostCardContent: a drawing with `manualSize` + geometry renders the preview without `max-h-[300px]`; a legacy
  drawing keeps it.
- Freeform: a selected, editable, unlocked drawing post renders the resize handle (`horizontal-only`); a locked one
  does not; a drawing with manual geometry renders at its stored width. Use the existing resize test files' harness
  (find the B2/table resize tests and extend them) — no new harness.
- Panel: Apply has the primary style (background `#2563eb`), Cancel the secondary; disabled Apply while busy.
- Mutation: revert the policy line → the policy and Freeform tests fail.

## Allowed files
```
lib/domain/canvas/postResizePolicy.ts (+ test)
components/collabboard/PostCardContent.tsx (+ test)                drawing branch only
components/collabboard/canvas/ui/FreeformPadletCards.tsx           wiring only, net <= +6 (only if needed)
existing Freeform resize test files (extend)
components/collabboard/editors/AntvChartValuesControl.tsx, .styles.ts (+ test)
```
Forbidden: everything else, the database, the Drawing canvas layout.
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
timeout 600 npx vitest run lib/domain/canvas components/collabboard/PostCardContent components/collabboard/editors/AntvChartValuesControl --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-288.json
```
Do not commit.

**Live (CTO):** select a drawing post → a width handle appears; drag it wider → the card and its preview grow, the
chart text becomes readable at 100 %; reload → the width is kept; an untouched drawing looks exactly as before;
Edit values panel shows a filled blue Apply and an outlined Cancel.

## Commit message (verbatim)
```
feat(board): resize drawing posts

Drawing posts on the board can now be made wider with the resize handle,
and their picture grows with them, so a chart is readable without zooming
in. The chart values panel's Apply and Cancel now look like buttons.
```

## Final result (CTO, 2026-10-05, live)
Own tab, board af02972f: new drawing with the library donut → Edit values panel shows a filled blue Apply
(`rgb(37,99,235)`, white, radius 6) and an outlined Cancel (`1px #d1d5db`) side by side. Saved (201); on the board the
post was 144 px wide with a 125×54 preview (capped). Selected → one resize handle; dragged right → PATCH 204 with
`width: 742`; card 594 px, preview 574×248, cap removed, chart text readable at 100 %; after reload the same 594 px.
Untouched drawings unchanged (122 px, still capped). Test post deleted (a1480132). Gate `.opencode-vitest-288.json`:
59/59 identical to 287b by name; tsc clean. `FreeformPadletCards.tsx` unchanged (the policy line routes drawings
through the existing horizontal-only handle); `PostCardContent.tsx` net +1.
