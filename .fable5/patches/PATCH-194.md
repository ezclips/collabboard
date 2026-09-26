# PATCH-194 — the "Source · p. N" link on cards inside a container is clickable

Status: AUTHORIZED (owner report, 2026-09-27: "the canvas view of the PDF page number is not
working ... make sure the page link opens up the pdf at its correct spot")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-193 (`efd33fa8`)
Read first:
- `components/collabboard/PostCardContent.tsx` — `KnowledgeSourceMarker` (~1169–1280, including
  its doc comment) and every wrapper it can sit inside: the TEXT/DEFAULT branch (~1136
  `select-none pointer-events-none`), the image branch (~746), and ~961 and ~242;
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx` ~4483 (the freeform mount and its
  comment "Display-only, exactly as on every other layout");
- `components/collabboard/RowColumnContainerCard.tsx` (the in-canvas container, every layout);
- one existing marker test, e.g. `components/collabboard/knowledgePdfCard.test.tsx` or
  `editors/ContainerEditor.childSources.test.tsx`, for the harness.

---

## 1. Why

Reproduced live on the owner's board: a Note inside the container "Conatiner PDF & Note Post"
shows "Source · p. 2", and clicking it does nothing. `document.elementFromPoint` at the link's
centre returns the card's `p-1.5` wrapper — the link is inside PostCardContent's TEXT/DEFAULT
wrapper `select-none pointer-events-none`, so the click never reaches it.

The marker used to be a label; its doc comment still says "Deliberately NON-INTERACTIVE". It has
since become a `<button>` whenever an opener is provided, with its own swallow handlers for
pointerdown / mousedown / dblclick / click so a press on it never starts a card drag. It is live on
standalone freeform Notes (that renderer does not wrap it in `pointer-events-none`), dead
everywhere PostCardContent renders it: containers on every layout, and the other layouts' cards.

The note editor's own Source link was checked live and is correct (opens the reader on the cited
page and outlines the passage, also when the reader was already open on another page). Out of
scope.

## 2. The design

- On the INTERACTIVE marker `<button>` only, add `pointer-events-auto`. A descendant with
  `pointer-events: auto` receives events inside a `pointer-events: none` ancestor, so this one
  class fixes every wrapper at once. The non-interactive `<div>` branch stays untouched (it must
  keep passing presses through to the card for drag).
- Do NOT remove `pointer-events-none` from any wrapper: the rest of the card body must keep
  passing presses through for drag/select, exactly as today.
- Update the two stale comments to say what is true now: the marker is interactive when an opener
  exists; it opts back into pointer events itself; the swallow handlers keep a press on it from
  starting a card drag; the rest of the card stays press-through. (`PostCardContent.tsx` marker
  doc comment; `FreeformPadletCards.tsx` ~4483 "Display-only" comment.)

## 3. Tests

jsdom does not apply CSS hit-testing, so a click test in jsdom would pass with or without the fix
and prove nothing. Therefore:
- one test asserting the interactive marker carries `pointer-events-auto` and the inert marker
  does not — say in the test's comment that this pins the class only, and that hit-testing is
  verified live;
- keep every existing marker test green (swallow handlers, opener called with the first
  reference).

## 4. Allowed files

```
components/collabboard/PostCardContent.tsx                  (the class + the comment)
components/collabboard/canvas/ui/FreeformPadletCards.tsx     (the comment only)
components/collabboard/<an existing marker test file>        (one test)
```

Everything else is forbidden. If anything conflicts with the code or is unclear, STOP and ask,
with the conflict written out: the spec line, the code at file:line, and your proposed
resolution. Never use git stash, reset, restore, checkout, clean, commit or push. Never run a
production build. Make every edit with a real tool call; never write a tool call, a `<bash>`
block or a command out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard
npx vitest run --reporter=json --outputFile=.opencode-vitest-194.json
```

The failing FILE set must equal the 26-file baseline. Report files changed, the test added, the
output. Do not commit.

The CTO verifies live in a separate tab: `elementFromPoint` at the container Note's link returns
the link; a real mouse click opens the reader on page 2 with the passage outlined; dragging the
container Note by its body still drags it.

## 6. Commit message (verbatim)

```
fix(source-link): the page link on cards inside a container opens the PDF

The "Source · p. N" link sat inside the card body's pointer-events-none
wrapper, so on every card PostCardContent renders -- containers on every
layout -- a click never reached it. The interactive link now opts back
into pointer events itself; the rest of the card stays press-through for
drag, and the link's own handlers keep a press on it from dragging.
```
