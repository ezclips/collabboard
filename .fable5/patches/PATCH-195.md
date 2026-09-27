# PATCH-195 — reader: the selection toolbar follows its selection; "Note Post" becomes "Edit as Note"

Status: AUTHORIZED (owner, 2026-09-27: "I agree" to "start with the toolbar fix and the rename")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-194 (`15b579d3`)
Read first:
- `components/collabboard/KnowledgeDocumentDetails.tsx`:
  - `capturedSelection` / `selectionRect` state (~637–641) and `activeSelection` (~799);
  - the mouseup capture handler (~1100–1180), both paths (text view and the page-image text
    layer), and every `setSelectionRect` call (~908, ~1162, ~1175, ~1591);
  - `useKnowledgeReaderActivePage` (~951) and `pagesContainerRef`;
  - the page buttons hidden while a selection exists: `!activeSelection` at ~1534 and ~1554;
  - the floating toolbar (~1712–1860), positioned `position: fixed` from `selectionRect`;
- `components/collabboard/KnowledgeDocumentDetails.test.tsx` (its harness, the toolbar tests
  around ~1571–1760, and the 8 `toBe('Note Post')` assertions).

---

## 1. Why

Reproduced live on the owner's board, in the full PDF reader of "Audi A2 Stoßstange demontieren
neu.pdf":

1. Select text on page 1, then scroll to page 2. The Note Post / Save as Note / Copy / Use in
   Board AI toolbar stays at the same place on the screen, floating over a photo on page 2 with
   nothing highlighted. Pressing Note Post there creates a Note from the page-1 text the user can
   no longer see. Cause: the toolbar is `position: fixed` at the rect captured on mouseup, and
   nothing updates it when the pages scroll.
2. While that stale selection exists, the page-level buttons ("Create Note from page N", "Add
   page N to Board AI") stay hidden (`!activeSelection`), even on a page with no selection.
3. The owner could not tell "Note Post" from "Save as Note". Note Post opens the Note editor
   pre-filled with the selection, while Save as Note saves at once with no editor. The label will
   say that.

## 2. The design

### 2.1 The toolbar follows its selection

- Listen to `scroll` on the pages container (`pagesContainerRef`, passive) and to window `resize`,
  only while `capturedSelection !== null`, and remove both listeners when it clears or on
  unmount. On each event (rAF-throttled, one measurement per frame):
  - if the live `window.getSelection()` still has a range inside the pages container, set
    `selectionRect` from that range's `getBoundingClientRect()`;
  - otherwise leave `selectionRect` as it is. Do NOT clear `capturedSelection`: the user's
    selection is still valid and the toolbar comes back when they scroll back to it.
- Add a derived `selectionInView`: true when `selectionRect` overlaps the pages container's
  visible bounding rect vertically. Render the toolbar only when it is true, so no toolbar floats
  over another page.
- Page buttons: replace `!activeSelection` at ~1534 and ~1554 with "no selection toolbar showing"
  (`!activeSelection || !selectionInView`), so page 2's own buttons come back while the page-1
  selection is out of view.
- Nothing else changes: capture rules, what each action sends, colours, drag-to-canvas, and the
  save-state machine stay exactly as they are.

### 2.2 The label

In the reader toolbar only (`KnowledgeDocumentDetails.tsx` ~1760): visible text `Edit as Note`,
and `title="Open the Note editor with the selected text"`. Leave its `aria-label` ("Create Note
from selection on page N") unchanged; tests and callers key on it. Do not touch
`KnowledgeSourceAIPanel.tsx` (it has no production mount) or the comments that mention "Note
Post" in other files.

## 3. Tests (in `KnowledgeDocumentDetails.test.tsx`)

- Update the 8 `toBe('Note Post')` assertions to `'Edit as Note'`, and nothing else in them.
- New, with the harness's existing selection helpers and a stubbed `getBoundingClientRect` on
  the pages container and the range:
  - a scroll event with the range moved re-positions the toolbar (its `top`/`left` follow the new
    rect);
  - a range scrolled out of the container's visible rect hides the toolbar, and the page buttons
    ("Create Note from page N") are shown again;
  - scrolling back brings the toolbar back, still acting on the same selection (Edit as Note sends
    the original `selectedText`);
  - after the selection clears, no scroll listener is left (e.g. spy on
    `addEventListener`/`removeEventListener` for the container).
- Mutation: disable the scroll listener → the re-position test must fail; always return
  `selectionInView = true` → the hide test must fail. Report both.

jsdom does not lay out anything, so these tests pin the logic with stubbed rects. The CTO checks
real scrolling live.

## 4. Allowed files

```
components/collabboard/KnowledgeDocumentDetails.tsx
components/collabboard/KnowledgeDocumentDetails.test.tsx
```

Everything else is forbidden. If a source/census test elsewhere pins the text "Note Post" of THIS
button and fails, STOP and ask. If anything conflicts with the code or is unclear, STOP and ask,
with the conflict written out: the spec line, the code at file:line, and your proposed
resolution. Never use git stash, reset, restore, checkout, clean, commit or push. Never run a
production build. Make every edit with a real tool call; never write a tool call, a `<bash>`
block or a command out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard/KnowledgeDocumentDetails lib/infra/knowledge
npx vitest run --reporter=json --outputFile=.opencode-vitest-195.json
```

The failing FILE set must equal the 26-file baseline. Report files changed, tests added, the
output and the mutation results. Do not commit.

The CTO verifies live in a separate tab: select on page 1, scroll to page 2 → no toolbar, the
page buttons are back; scroll back → the toolbar sits beside the selection; Edit as Note opens the
editor with that text (cancelled, nothing saved).

## 6. Commit message (verbatim)

```
fix(reader): the selection toolbar follows its selection; Note Post is Edit as Note

The toolbar was fixed at the screen position of the mouseup, so after a
scroll it floated over another page and acted on a selection the user
could no longer see, while that page's own buttons stayed hidden. It now
re-measures on scroll and hides while its selection is out of view, and
the page buttons return meanwhile. "Note Post" is renamed "Edit as Note",
which says what it does next to "Save as Note".
```
