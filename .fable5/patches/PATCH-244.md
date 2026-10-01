# PATCH-244 — The AntV text toolbar (colour, font, size, align) actually keeps its changes

Status: AUTHORIZED (owner, 2026-10-01: "On those templates can you check if the colorpicker is working" — the CTO
found it does not; owner delegates the design).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-243 (`26aa0a86`, pushed)

## Why (CTO live check, 2026-10-01, test post `34a9692d`, deleted)
On an AntV design (Show options, `antv:list-grid-*`) clicking "Food" opens AntV's text toolbar (colour, font, size,
align); the colour picker opens and the red swatch is clicked — "Food" stays `rgb(38,38,38)` on the preview, after a
text edit elsewhere, and on the saved board post.
Cause (code read): AntV applies the change and emits `options:change` with
`{ op: 'update', path: 'data.items[i]…attributes.label' | '.desc' | '.icon' | 'data.attributes.title',
value: { attributes: { fill | 'font-size' | 'font-family' | <align> } } }`
(`editor/managers/state.ts` `updateBuiltInElement`). Our `applyAntvChange` (`lib/ai/antv/mapOutline.ts` ~373,
`patchItem` ~315) reads only `label/desc/icon` text, so it returns an unchanged — but NEW — outline object; the
renderer's `[data.outline]` effect then calls `instance.update(toAntvOptions(…))`, which redraws without the
attributes and wipes the user's colour at once. Font size, font family and align are lost the same way.

## Design
### A. Store a small, validated text style (optional; old posts unchanged)
- `VisualOutlineItem` gains optional `textStyle?: { label?: TextStyle; detail?: TextStyle; icon?: { fill?: string } }`;
  `VisualOutline` gains optional `titleStyle?: TextStyle`, where
  `TextStyle = { fill?: string; fontSize?: number; fontFamily?: string; align?: 'left' | 'center' | 'right' }`.
- Validation (validators + `parseOutline` + `applyAntvChange`, one shared pure `sanitizeTextStyle`):
  `fill` only `#rgb`, `#rrggbb`, `#rrggbbaa` or `rgb(a)(n, n, n[, a])` with numbers in range (strict regex, no
  `url(`, no `;`); `fontSize` an integer 8..72; `fontFamily` only one of the font families AntV's toolbar offers
  (read the list from AntV's registered fonts / our setup) or our system / hand-drawn stacks; `align` from the three
  values (map AntV's own align attribute — read `font-align.ts` for its exact key/values). Anything else is dropped;
  an empty style object is removed. Never throws on stored data.
### B. Map both ways (`lib/ai/antv/mapOutline.ts`)
- `applyAntvChange`: an `update` whose path targets an item's `attributes.label|desc|icon` (resolve the item with
  the existing `resolveTarget`, incl. hierarchy templates) or `data.attributes.title` merges the sanitized
  attributes into that item's `textStyle` / `titleStyle`. Unknown roles/keys are ignored.
- `toAntvOptions`: passes the stored styles back as AntV `datum.attributes.{label,desc,icon}` and
  `data.attributes.title` with AntV's attribute names, so a redraw keeps them.
### C. Never redraw for a no-op (`AntvInfographicRenderer.tsx`)
- In the `options:change` handler, when the mapped outline is structurally equal to the current one (a small pure
  `outlinesEqual`), do NOT call `edit.onChange` — a toolbar action we do not store must not cause a wiping redraw.
### D. Our own designs are unaffected
- Only AntV templates read `textStyle`/`titleStyle`; our six layouts and the tree ignore them (test pins it).

## Tests
- `sanitizeTextStyle`: valid hex/rgb(a) kept; `red`, `url(x)`, `#12`, `rgb(300,0,0)`, `#fff;x` dropped; fontSize
  7 / 73 / 12.5 dropped, 14 kept; unknown font family dropped; align values.
- `mapOutline.test.ts`: the exact AntV change payloads (copy their shape from `state.ts`) for label fill, desc
  font-size, icon fill, title font-family, align → the right item's style; `toAntvOptions` round-trips them into
  `datum.attributes`; a list template and a hierarchy (mind map) template.
- Renderer (real engine in jsdom, like the PATCH-243 tests): an `options:change` carrying a label fill calls
  `onChange` with `textStyle.label.fill`; re-rendering with that outline draws the label with that fill; an
  `options:change` that maps to no change does NOT call `onChange`.
- Validators: a stored post with a valid style validates and keeps it; with a hostile `fill` the field is dropped and
  the post validates.
- **Mutations:** `applyAntvChange` ignoring attributes → the label-fill test fails; `toAntvOptions` not passing
  styles back → the redraw test fails; removing the no-op guard → the no-op test fails; `sanitizeTextStyle` accepting
  any string → the hostile-fill test fails.

## Allowed files
```
lib/ai/outline.ts (+ test), lib/ai/validators.ts (+ tests)      (optional textStyle/titleStyle only)
lib/ai/antv/** (+ tests)
components/ai/renderers/AntvInfographicRenderer.tsx (+ tests)
```
Forbidden: the database, `package.json`/lockfile, `node_modules`, every AI route, our six layouts,
`MindmapTreeRenderer.tsx`, `FreeformPadletCards.tsx`, the DOMPurify profile. Every new test path must be collected
by `vitest.config.ts` (check; STOP if not). Real tool calls only (never write a tool call as plain text); one test
file at a time with `--reporter=dot`, never pipe vitest into grep/head; revert mutations with your Edit tool; no git
writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-244.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** test post only. AntV list design: click a word → colour red → it turns red and stays red after
another edit, after Save, on the board and after reopening; font size and align likewise; a mind map template
likewise. No AI request for any of it, no outside request. Delete the test post.

## Commit message (verbatim)
```
fix(ai): keep colour, font and size changes on AntV pictures

Picking a colour, font, size or alignment in the text toolbar of an
AntV picture was undone at once, because the picture was redrawn from
data that did not include it. The text style is now stored with the
picture, checked to be a real colour, size and font, and kept when the
picture is edited, saved and reopened.
```

## Addendum 1 (CTO, 2026-10-01): live result
(DeepSeek's first turn hit a provider 400; a "continue" finished it.) Show options, `antv:list-grid-*`: "Food" →
toolbar colour → red `rgb(245,34,45)`: stays red after a title edit elsewhere, after switching to the
capsule mind map and back, after Save (POST 201), on the board and in the reopened Edit window. Reopened → size XL →
24px, Save (PATCH 204) → board 24px and still red. One `generate-outline`, no AI request for edits. Test posts
`da145c25`, `1fb57643` deleted (DELETE 204). Gate `.opencode-vitest-244.json`: extra [] missing []; tsc clean; no
mutation text.
