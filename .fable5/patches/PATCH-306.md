# PATCH-306 — A sharp template thumbnail on the New board page

Status: AUTHORIZED (owner, 2026-10-07, screenshot of the "Start with" card after picking History of Flight: "the
thumbnail … has a bad resolution, maybe don't blow up the post that much so it won't lose its sharpness").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO)
`components/collabboard/create/StartWithChooser.tsx` ~L79 shows the chosen template as a CSS background,
`h-[170px] bg-cover bg-top`. `bg-cover` scales the picture until it fills the card, whatever its size. Previews are
720 px wide, the two timeline ones 416 × 721 (portrait), so a timeline preview is zoomed onto its first post, and on a
2× screen every preview is shown above its own resolution — soft.

## Design (`StartWithChooser.tsx` only)
Replace that background `<div>` with:
```tsx
<div data-template-thumb className="flex h-[170px] justify-center overflow-hidden bg-slate-100">
  {template.previewUrl ? (
    <img src={template.previewUrl} alt="" onLoad={…} className="block h-auto self-start" style={{ width: thumbWidth }} />
  ) : null}
</div>
```
- `thumbWidth` = `min(100%, <naturalWidth / 2>px)` once the image has loaded (read `naturalWidth` in `onLoad`, keep it
  in state keyed by the url so a new template resets it); before load, `100%`. Half the natural width keeps it sharp on
  2× screens and shows more of the board.
- The picture keeps its own shape (height auto), is centred horizontally, top-aligned, and cut off at 170 px by the
  box. The grey `bg-slate-100` shows at the sides when the picture is narrower than the card.
- Nothing else in the card changes (title, summary, Change button, classes, data attributes).

## Tests (`components/collabboard/create/StartWithChooser.test.tsx`, create it if missing)
- With a template, the card renders an `<img>` with the template's `previewUrl` inside `[data-template-thumb]`, and no
  element carries a `background-image` style.
- After a `load` event with `naturalWidth` 416 (define it on the element), the img's style width is `min(100%, 208px)`;
  with 720 → `min(100%, 360px)`.
- Without a template, the blank-fan view is unchanged (existing behaviour, if a test already covers it keep it green).

## Allowed files
`components/collabboard/create/StartWithChooser.tsx` and `StartWithChooser.test.tsx`. Same rules as PATCH-305. Run only
that test, `NewBoardPage.test.tsx`, and `npx tsc --noEmit`.

## Commit message (verbatim)
```
fix(board): the chosen template's thumbnail stays sharp

The New board page stretched the template picture to fill its card, which
zoomed a timeline onto its first post and blurred every picture on sharp
screens. It is now shown at no more than half its own width.
```

## Final result (CTO, 2026-10-07, live)
History of Flight: preview 416 px shown at 208 px, centred, sharp, whole first post visible. Research: 720 px shown at 360 px, sharp. The test asserts `data-thumb-max-width` because jsdom drops CSS `min()` (CTO hint). Tests 15/15, tsc clean.
