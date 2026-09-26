# PATCH-193 — the container window: PDF cards load, source links open

Status: AUTHORIZED (owner report, 2026-09-27: "the note post page link is broken and PDF content
won't load in it")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-192 (`d80d65ea`)
Read first:
- `components/collabboard/canvas/ui/CanvasModals.tsx` lines ~300–400 (the `<ContainerEditor>`
  mount, `childPadlets`, `onOpenChildPadlet`);
- `components/collabboard/editors/ContainerEditor.tsx` (`ChildPadlet`, `SortableChildItem`, where
  `PostCardContent` renders a child, `onClose`);
- `components/collabboard/PostCardContent.tsx` line ~308 (`boardId={padlet.board_id}`) and ~1208
  (the "Source · p. N" marker: `useKnowledgeSourceOpen`);
- `components/collabboard/KnowledgeSourceReferenceContext.tsx` (`KnowledgeSourceOpenContext`,
  `useKnowledgeSourceOpen`);
- `components/collabboard/KnowledgePdfCanvasSurface.tsx` lines 115–190
  (`KnowledgePdfOpenContext`, `KnowledgePdfOpenProvider`, `useKnowledgePdfOpen`);
- `components/collabboard/RowColumnContainerCard.tsx` — the IN-CANVAS container, used by the
  freeform canvas AND the other layouts. It works and is NOT changed.
- `components/collabboard/editors/ContainerEditor.childCommentPermission.test.tsx` (the test
  harness to copy).

---

## 1. Why

A container shows its cards in two places: inside the canvas (`RowColumnContainerCard`, every
layout) and in the container window that its Edit button opens (`ContainerEditor`, ONE component
shared by every layout). Inside the canvas everything works. In the window, reproduced live on the
owner's board ("Conatiner PDF & Note Post"):

1. **A PDF card shows "Page preview unavailable".** The window requests
   `/api/boards/undefined/knowledge/<doc>/pages/1/image` and `/render-pages` → 503.
   Cause: `CanvasModals.tsx` ~351 maps each child to `{ id, title, content, type, metadata }`,
   dropping `board_id`, and `PostCardContent` passes `padlet.board_id` to the PDF surface.
2. **"Source · p. 2" on a Note does nothing visible.** It DOES open the reader — behind the
   window, which stays open on top. Neither `requestKnowledgeSourceOpen` nor
   `openSourceReferenceFromEditor` closes the container window. The PDF card's own open actions
   (`useKnowledgePdfOpen`) have the same shape.

## 2. The design

### 2.1 Pass the board id — `CanvasModals.tsx`

Add `board_id: p.board_id` to the child mapping, and `board_id?: string` to `ChildPadlet` in
`ContainerEditor.tsx`. Nothing else in the mapping changes.

### 2.2 Close the window before opening the reader — `ContainerEditor.tsx`

Wrap the rendered child list (only the list, not the whole window) in two context overrides that
call the window's own close first, then the opener from the enclosing provider:

- source marker: a new exported `KnowledgeSourceOpenOverride` in
  `KnowledgeSourceReferenceContext.tsx`:
  ```tsx
  export function KnowledgeSourceOpenOverride({ before, children }) {
    const parent = useContext(KnowledgeSourceOpenContext);
    const value = useMemo(() => parent === null ? null : (reference) => { before(); parent(reference); }, [parent, before]);
    return <KnowledgeSourceOpenContext.Provider value={value}>{children}</KnowledgeSourceOpenContext.Provider>;
  }
  ```
  `parent === null` stays null, so a host with no opener still renders the inert label (the
  existing contract in that file's comment).
- PDF card: the same shape for `KnowledgePdfOpenContext` — reuse `KnowledgePdfOpenProvider` with
  a wrapped `onOpenDocument` if it fits; otherwise add `KnowledgePdfOpenOverride` next to it the
  same way.

`before` is the window's existing close path (whatever `ContainerEditor` calls for its Close
button / ESC — use that exact function, so unsaved title/colour edits behave as on any other
close). Do not add a new close behaviour.

## 3. Tests

Extend `ContainerEditor.childCommentPermission.test.tsx`'s harness into a new
`ContainerEditor.childSources.test.tsx`:
- a PDF child renders the PDF surface with the child's `board_id` (assert the prop, or the request
  URL containing the board id — NOT the string `undefined`);
- clicking a Note child's "Source · p. N" inside the window calls the window's close THEN the
  parent opener with that reference (order asserted);
- with no parent opener, the marker is the inert label (no button), as today;
- the same for the PDF card's open action.

`KnowledgeSourceReferenceContext`: one unit test for `KnowledgeSourceOpenOverride` (before → parent,
null passthrough).

Mutation: remove `board_id` from the mapping in CanvasModals → which test fails? If none can
(CanvasModals is not rendered in tests), say so plainly in the report; the CTO verifies live.

## 4. Allowed files

```
components/collabboard/canvas/ui/CanvasModals.tsx            (§2.1: one field)
components/collabboard/editors/ContainerEditor.tsx           (§2.1 type, §2.2 wrapping)
components/collabboard/KnowledgeSourceReferenceContext.tsx   (§2.2 override)
components/collabboard/KnowledgePdfCanvasSurface.tsx         (§2.2 override, only if needed)
components/collabboard/editors/ContainerEditor.childSources.test.tsx   (new)
components/collabboard/KnowledgeSourceReferenceContext.test.tsx        (new or extend)
```

Everything else is forbidden — in particular `RowColumnContainerCard.tsx`, `CanvasClient.tsx`,
`PostCardContent.tsx`, the database and `package.json`. If anything conflicts with the code or is
unclear, STOP and ask, with the conflict written out: the spec line, the code at file:line, and
your proposed resolution. Never use git stash, reset, restore, checkout, clean, commit or push.
Never run a production build. Make every edit with a real tool call; never write a tool call, a
`<bash>` block or a command out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard/editors components/collabboard/KnowledgeSourceReferenceContext
npx vitest run --reporter=json --outputFile=.opencode-vitest-193.json
```

The failing FILE set must equal the 26-file baseline. Report: files changed, tests added, the
output, the mutation results. Do not commit.

The CTO verifies live on CDP 9333 in a separate tab: open "Conatiner PDF & Note Post" with Edit;
no `/api/boards/undefined/` request; the PDF page renders; "Source · p. 2" closes the window and
shows the reader on page 2. Then the same on a container in a non-freeform board.

## 6. Commit message (verbatim)

```
fix(container): PDF cards load and source links open in the container window

The container window dropped board_id from its cards, so a PDF card asked
for /api/boards/undefined/... and showed "Page preview unavailable". Its
source links and PDF open actions opened the reader behind the window,
which stayed on top. The window now passes board_id and closes itself
before handing the open request to the canvas.
```
