# PATCH-295 — Readable titles on clipart and document cards

Status: AUTHORIZED (owner, 2026-10-06, screenshot of the Event Plan template: "can you make sure the title are
readable as you can see black font in purple is very hard to read").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO-checked)
- Clipart and document cards are drawn by `components/collabboard/CardPreview.tsx` (standalone on the board via
  `FreeformPadletCards.tsx` L2700, inside columns via `RowColumnContainerCard.tsx` L622, in `ContainerEditor.tsx`
  L439 and in the editor `ClipartCardDraftModal.tsx` L344). Its title strip defaults to `#4f46e5` (L59) when
  `metadata.topStripColor` is unset, and the title colour is `resolveCaptionStyle(metadata.titleStyle,
  metadata.textColor)` (L60), whose last fallback is `#1F2937` — dark text on dark indigo. This hits every clipart
  card with the default strip, not only the templates.
- Note posts already solve this: their title's fallback colour is `contrastIconColor(strip)`
  (`FreeformPadletCards.tsx` L2194; helper in `components/collabboard/shells/CardShell.tsx` L8: `#f8fafc` on a dark
  strip, `#1e293b` on a light one).
- The editor's title input uses the same dark fallback (`ClipartCardDraftModal.tsx` L198 `titleInputStyle`).

## Design
1. `CardPreview.tsx`: when the strip is shown, the title's fallback colour is `contrastIconColor(topStripColor)`:
   `resolveCaptionStyle(metadata?.titleStyle, metadata?.textColor || (showTopStrip ? contrastIconColor(topStripColor)
   : undefined))` (compute `showTopStrip` before the style). A colour the user chose (`titleStyle.color` or
   `metadata.textColor`) still wins. With no strip (`transparent`) nothing changes. Applies to the clipart and the
   document branch (they share `titleStyle`). The placeholder "Title" keeps its opacity.
2. `ClipartCardDraftModal.tsx` L198: the title input gets the same fallback from the preview's strip colour (same
   default `#4f46e5` when unset), so typing the title on the strip is readable too. Caption styles do not change
   (captions are not on the strip).
3. If `contrastIconColor` must be imported from a component file, move it to
   `lib/domain/canvas/contrastColor.ts` (pure) and re-export it from `CardShell.tsx` so existing imports keep
   working.

## Tests
- `CardPreview.test.tsx`: clipart card with no strip colour and no text colour → title colour `#f8fafc`; strip
  `#fde68a` (light) → `#1e293b`; `metadata.textColor: '#ff0000'` → `#ff0000`; `titleStyle.color` → that colour;
  strip `transparent` → `#1F2937` as before; a document card with the default strip → `#f8fafc`.
- Editor: the title input on the default strip is `#f8fafc`; with a chosen colour, that colour.
- Mutation: drop the contrast fallback → the first test fails; revert with the Edit tool.

## Allowed files
```
components/collabboard/CardPreview.tsx (+ test)
components/collabboard/editors/ClipartCardDraftModal.tsx (+ test)        title input style only
lib/domain/canvas/contrastColor.ts (+ test), components/collabboard/shells/CardShell.tsx   only if the helper moves
```
Forbidden: everything else, the database.
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
timeout 600 npx vitest run components/collabboard/CardPreview components/collabboard/editors/ClipartCardDraftModal --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-295.json
```
Do not commit.

**Live (CTO):** apply Event Plan to a new board: the clipart titles in the columns ("Let's celebrate", "Playlist",
"Decorations", "Cake") are light on the indigo strip; a free clipart card the same; test board deleted.

## Commit message (verbatim)
```
fix(board): readable titles on clipart cards

A clipart or document card's title on its coloured strip now picks light
or dark text by the strip colour, like notes already do, unless a title
colour was chosen. Black text on the default purple strip was hard to
read.
```

## Final result (CTO, 2026-10-06, live)
Gate `.opencode-vitest-295.json`: 59/59 identical to 294a by name. Kit run, own tab: Event Plan applied to a new
freeform board (`808ef96d`, deleted afterwards, 200), 14/14 inserts, 7 images loaded. The clipart titles in the
columns now render `rgb(248,250,252)` on the default strip `rgb(79,70,229)` ("Let's celebrate", "Playlist",
"Decorations", "Cake"), previously dark `#1F2937`. The helper moved to `lib/domain/canvas/contrastColor.ts` and is
re-exported from `CardShell.tsx`.
