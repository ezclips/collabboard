# PATCH-305 — "Use this template" gets a box

Status: AUTHORIZED (owner, 2026-10-07, screenshot of the template detail in the gallery: "Use this template" has no
box; "just put a black box around 'use this template' same as 'Back to the templates'"). What the button does stays
as it is (owner).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO)
`components/collabboard/create/TemplateGalleryModal.tsx` ~L115 renders `<Button data-use-template=…>` with the default
variant (`bg-primary text-primary-foreground`). This app has no `primary` colour, so it shows as bare text. "Back to
templates" right below is `variant="outline"` and has the border the owner wants.

## Design
Give the "Use this template" `<Button>` `variant="outline"`, exactly like "Back to templates". Nothing else changes
(same `data-use-template`, same onClick, same order).

## Tests
In the gallery's existing test file (`TemplateGalleryModal.test.tsx`; create it next to the component if there is
none): the "Use this template" button and the "Back to templates" button have the same className.

## Allowed files
`components/collabboard/create/TemplateGalleryModal.tsx` and its test. Same rules as PATCH-304: real tool calls only,
no git writes, no build, no browser, no curl, no `.env`, never `cd`, no deletions. Run only that test file and
`npx tsc --noEmit`.

## Commit message (verbatim)
```
fix(board): "Use this template" has a visible button box

It used a colour this app does not define and showed as bare text; it now
has the same outlined box as "Back to templates".
```

## Final result (CTO, 2026-10-07, live)
"Use this template" and "Back to templates" render identically (1px border, white, same text colour). Test 8/8, tsc clean.
