# PATCH-199 — A video's transcript can be opened: "Open transcript", and it opens after import

Status: AUTHORIZED (PM decision, 2026-09-27). Owner report: "I added a new YouTube video, pasted
the transcript, pressed the blue button and then nothing happened. The video with the transcript
is greyed out; where can I find the text?"
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-198 (`3926314e`)
Read first:
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`: the link post's `LinkPostContextMenu`
  props (~4620-4660: `onAddTranscript`, `transcriptActionDisabled`, `transcriptActionLabel`),
  `startTranscriptForPost` (~602), and the `<MediaPostTranscriptDialog onImported=...>` mount;
- `components/collabboard/menus/LinkPostContextMenu.tsx` (the transcript item ~155 and its prop
  docs, including the OWNER DECISION of 2026-09-22: the item never vanishes);
- `lib/domain/knowledge/boardTranscriptIndex.ts` (`mediaPostTranscriptState`: `ready` carries
  `entry.documentId`);
- `components/collabboard/KnowledgeTranscriptImportPanel.tsx` (`onImported(handle)`,
  `handle.documentId`);
- `app/dashboard/canvas/[id]/CanvasClient.tsx`: `requestKnowledgeDocumentOpen` (~2630), and the
  `<FreeformPadletCards` mount;
- `components/collabboard/KnowledgeSourceReaderDrawer.tsx` (~801: `kind === 'text'` routes to
  `KnowledgeTextSourceView`, which is where a transcript's text is shown).

---

## 1. Why

A pasted transcript is stored as a text knowledge document, and the reader can show it
(`KnowledgeTextSourceView`). But nothing on the board opens it:
- the card shows "✓ Transcript added" (status only, by owner decision);
- the right-click item turns into a greyed "Transcript added";
- the old Knowledge library launcher was removed (PDF-C1).

The only way in is a Board AI citation. And the import itself closes the dialog with no visible
result, which the owner read as "nothing happened".

## 2. The design

### 2.1 The menu item opens the transcript once it is ready
- When the card's transcript state is `ready`, the item is ENABLED, labelled **"Open transcript"**,
  and calls a new optional prop on `FreeformPadletCards`:
  `onOpenTranscript?: (documentId: string) => void` with `state.entry.documentId`.
- Other states are unchanged: `none` → "Add transcript" (opens the dialog); `failed` → "Retry
  transcript"; `processing` → greyed "Transcript processing…".
- If `onOpenTranscript` is not supplied, `ready` keeps today's greyed "Transcript added" (a host
  with no reader keeps working).
- `LinkPostContextMenu` should need no new prop: `onAddTranscript` / label / disabled already
  carry it. If it truly needs a change, it is allowed, but say why.

### 2.2 After a successful import, the transcript opens
- `onImported(handle)`: as today, refresh the index and close the dialog; THEN call
  `onOpenTranscript(handle.documentId)` when supplied. The person sees their text in the reader, so
  "nothing happened" becomes "here it is".
- VERIFY FIRST (by reading code) that `KnowledgeTextSourceView` shows a just-imported transcript
  while it is still processing (chunking/indexing). If it shows an error or an empty state for a
  processing document, STOP and report what it shows, with file:line; do not change the reader in
  this patch.

### 2.3 CanvasClient
- Pass
  `onOpenTranscript={(documentId) => requestKnowledgeDocumentOpen({ documentId, presentation: 'side-panel' })}`
  to `FreeformPadletCards`. Use the existing authority; no new open path. (It already claims the
  dock, so the wiki and chat yield as they do for any reader open.)

### What does not change
The card's status line, the dialog, the import route, the reader, the index.

## 3. Tests
- FreeformPadletCards (extend `freeformTranscriptDialogBlocking.test.tsx` or a sibling, with the
  same stubbed `LinkPostContextMenu`; make the stub also render the label and the disabled state):
  - `ready` → label "Open transcript", enabled, and clicking calls `onOpenTranscript` with the
    entry's documentId, and does NOT open the dialog;
  - `ready` without `onOpenTranscript` → greyed "Transcript added";
  - `none` → "Add transcript" still opens the dialog;
  - a successful import calls `onOpenTranscript` with `handle.documentId` after closing the dialog.
    Drive `onImported` the simplest honest way (e.g. mock `KnowledgeTranscriptImportPanel` with a
    button that calls `onImported({ documentId: 'doc-new', contentSha256: 'x', mutationRevision: '1' })`).
- CanvasClient wiring (a source test in the `boardAiChatWiring.test.tsx` style): `onOpenTranscript`
  is passed and goes through `requestKnowledgeDocumentOpen`.
- **Mutations** (report each):
  1. Keep `ready` disabled → the "Open transcript" test fails.
  2. Drop the post-import open → the import test fails.

## 4. Allowed files
```
components/collabboard/canvas/ui/FreeformPadletCards.tsx
components/collabboard/menus/LinkPostContextMenu.tsx          (only if needed; say why)
app/dashboard/canvas/[id]/CanvasClient.tsx                    (the one prop)
components/collabboard/freeformTranscriptDialogBlocking.test.tsx or a new sibling test
components/collabboard/boardAiChatWiring.test.tsx
```
Forbidden: the database, migrations, `package.json`, the reader components, the import route.

**Do not touch the comments inside `isBlockingEditorModalOpen`**: `freeformImageEditorStacking.test.tsx`
reads a fixed 1600 characters of it. If a census or source test elsewhere pins something this
changes, STOP and ask, with the conflict written out (spec line, code at file:line, proposed
resolution).

Every test command is `timeout 600 npx vitest run …`. Delete any temporary diagnostic file before
reporting. Never use git stash, reset, restore, checkout, clean, commit or push. Never run a
production build. Make every edit and command with a REAL tool call: never write a tool call out as
text or markup.

## 5. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/freeformTranscriptDialogBlocking components/collabboard/boardAiChatWiring components/collabboard/freeformImageEditorStacking
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-199.json
```
The failing FILE set must equal the 26-file baseline. Compact report: files changed, tests added,
the output, both mutations. Do not commit.

**Live (CTO, CDP 9333, own tab):** right-click the London System card → "Open transcript" → the
reader shows its text. (The import path is covered by the test; the owner's next import checks it
live.)

## 6. Commit message (verbatim)
```
feat(transcript): open a video's transcript from its card, and after import

A pasted transcript was stored but nothing on the board opened it: the
card's menu turned into a greyed "Transcript added" and the import
closed its dialog with no visible result. A ready transcript's menu
item now reads "Open transcript" and opens it in the reader, and a
successful import opens it there too.
```
