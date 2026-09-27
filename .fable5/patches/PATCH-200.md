# PATCH-200 — A transcript shows its next step: open it from the card, ask AI, save to the wiki

Status: AUTHORIZED (PM decision, 2026-09-27). Owner, looking at an open transcript: "how do I get
it into the wiki or AI? This is what I see as a user, not very user friendly. The next step should
be clearly visible, no guessing." And: "could we also add the link to the green 'Transcript added'".
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-199 (`c889c043`)
Read first:
- `components/collabboard/MediaPostTranscriptAffordance.tsx` (the green status line, and its
  2026-09-22 "information only" note, which the owner now overrides for the `ready` state);
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx` (where the affordance is rendered,
  and `onOpenTranscript` from PATCH-199);
- `components/collabboard/KnowledgeSourceReaderDrawer.tsx`: the routing ~801 (`kind === 'text'` →
  `KnowledgeTextSourceView`), the right panel ~1095-1175 (`sidePanelRightPanel`, "← Back to PDFs",
  the embedded `BoardAiChatDrawer` with `documentScope`), and the workspace presentation's
  equivalent if it has one;
- `components/collabboard/KnowledgeTextSourceView.tsx` (the "Readable" toggle; a transcript has a
  non-null transcript representation);
- `components/collabboard/BoardAiChatDrawer.tsx`: `canSaveAssistantToWiki`,
  `onOpenWikiWithProposal` (~167, ~1649), `draftContext` / `onDraftContextChange`, and how the
  composer's text is set;
- `app/dashboard/canvas/[id]/CanvasClient.tsx`: where the board chat gets
  `canSaveAssistantToWiki={canEditBoardContent}` and
  `onOpenWikiWithProposal={canEditBoardContent ? openBoardWikiWithProposal : undefined}` (~11417),
  and where `KnowledgeSourceReaderDrawer` is mounted.

---

## 1. Why

Today a transcript's text opens (PATCH-199), and then the person is stuck:
- the right panel reads "← Back to PDFs", "No notes for this PDF yet";
- the AI is a small unlabeled sparkle icon;
- the reader's own AI has no "Save to wiki", because PATCH-197 wired that button only into the
  board chat.

What the owner could not know: the transcript is ALREADY available to AI. Board AI search cites it,
and the reader's AI reads it. "Readable" is a reading view only and saves nothing, so there is
nothing to "put in". The missing piece is a visible next step, plus the one missing wire.

## 2. The design

### 2.1 The green status opens the transcript
- In the `ready` state, when the host supplies an open callback (the same `onOpenTranscript` as
  PATCH-199), "✓ Transcript added" becomes a BUTTON: "✓ Transcript added · Open". It is styled as
  a link (same green, underline on hover), and clicking it opens the transcript. Stop propagation
  so the click does not select or drag the card.
- Without the callback, and in every other state, it stays exactly as today.
- Update the component's header note: the owner decided on 2026-09-27 that `ready` may open,
  because the status is where people look.

### 2.2 A "next step" bar at the top of an open transcript
Only for a transcript (a text document with a transcript representation). A PDF is untouched.
One row above the text, next to or above "Readable":
- **"Ask AI about this video"** (primary button): opens the reader's right panel on AI (the
  existing `sidePanelRightPanel = 'ai'` path, i.e. what the sparkle does).
- **"Summarise for the wiki"** (secondary button): opens the same AI panel with the composer
  PREFILLED with `Summarise the key points of this video.`. It is NOT sent: the person presses
  Send, so no credits are spent without a click.
- One line of helper text under the buttons: `Every answer has "Save to wiki", which adds it to a
  wiki page for you to review.` Show it only when saving to the wiki is possible (the capability
  below). Otherwise show only the Ask button.

If prefilling the composer needs a new optional prop on `BoardAiChatDrawer` (e.g.
`initialDraftText` with a request id, applied once), that is allowed. Say which you used.

### 2.3 The reader's AI gets "Save to wiki"
- Thread `canSaveAssistantToWiki` and `onOpenWikiWithProposal` from `CanvasClient` into
  `KnowledgeSourceReaderDrawer`, and from there into its embedded `BoardAiChatDrawer`. Use exactly
  the board chat's gating: `canEditBoardContent`, and `openBoardWikiWithProposal` only for an
  editor. No new server path: PATCH-197's route already verifies the signed answer.
- Opening the wiki claims the dock, so the reader yields. That is the existing rule; do not fight
  it.

### 2.4 Wording for a transcript
In the right panel, for a transcript only: "← Back to PDFs" becomes "← Close". Leave the Library
panel's empty-state texts alone in this patch (they are shared with PDFs).

### What does not change
The server, the database, "Readable", the PDF reader path, the board chat.

## 3. Tests
- Affordance: `ready` plus a callback renders a button "Transcript added · Open" that calls it;
  without a callback it renders the plain status; `processing` and `failed` are unchanged.
- FreeformPadletCards: the status button receives `onOpenTranscript` with the entry's documentId.
- Reader drawer (existing reader tests show how to mount it): for a transcript document, the bar
  shows "Ask AI about this video"; clicking it opens the AI panel. "Summarise for the wiki"
  opens the AI panel with the composer prefilled and sends NOTHING (no fetch to the chat route).
  A PDF document shows no bar. The helper line is absent when `canSaveAssistantToWiki` is false.
- The embedded chat receives `canSaveAssistantToWiki` and `onOpenWikiWithProposal` (a
  source/wiring test in the `boardAiChatWiring.test.tsx` style).
- **Mutations** (report each):
  1. Render the status as plain text even with a callback → the affordance test fails.
  2. Auto-send the summarise prompt → the "sends nothing" test fails.
  3. Drop `onOpenWikiWithProposal` from the embedded chat → the wiring test fails.

## 4. Allowed files
```
components/collabboard/MediaPostTranscriptAffordance.tsx (+ its test, or a new one)
components/collabboard/canvas/ui/FreeformPadletCards.tsx
components/collabboard/KnowledgeSourceReaderDrawer.tsx (+ reader tests)
components/collabboard/KnowledgeTextSourceView.tsx          (only if the bar must live there; say why)
components/collabboard/BoardAiChatDrawer.tsx                (only the optional prefill prop)
app/dashboard/canvas/[id]/CanvasClient.tsx                  (threading the two props)
components/collabboard/boardAiChatWiring.test.tsx
components/collabboard/freeformTranscriptDialogBlocking.test.tsx
```
Forbidden: the database, migrations, the server and API routes, `package.json`, credits.

**Do not touch the comments inside `isBlockingEditorModalOpen`**: `freeformImageEditorStacking.test.tsx`
reads a fixed 1600 characters of it. Before editing, quote the ROUTING that brings a transcript to
the component where you put the bar (a transcript never reaches `KnowledgeDocumentDetails`; see the
routing at ~801). If a census or source test elsewhere pins something this changes (e.g. the "Back
to PDFs" string), STOP and ask, with the conflict written out (spec line, code at file:line,
proposed resolution).

Every test command is `timeout 600 npx vitest run …`. Delete any temporary diagnostic file before
reporting. Never use git stash, reset, restore, checkout, clean, commit or push. Never run a
production build. Make every edit and command with a REAL tool call: never write a tool call out as
text or markup.

## 5. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/MediaPostTranscriptAffordance components/collabboard/freeformTranscriptDialogBlocking components/collabboard/boardAiChatWiring components/collabboard/freeformImageEditorStacking components/collabboard/KnowledgeSourceReader components/collabboard/knowledgeReader
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-200.json
```
The failing FILE set must equal the 26-file baseline. Compact report: files changed, tests added,
the output, the three mutations. Do not commit.

**Live (CTO, CDP 9333, own tab):** click the London card's green "Transcript added · Open" → the
transcript opens, with the bar on top. "Summarise for the wiki" → the AI panel has the prompt, and
nothing is sent. Send it → the answer shows "Save to wiki" → New page → the wiki opens with the
proposal. Delete the test page afterwards.

## 6. Commit message (verbatim)
```
feat(transcript): show the next step -- open, ask AI, save to the wiki

An open transcript gave no hint of what to do with it: the panel spoke
of PDFs, the AI was an unlabeled icon, and the reader's AI could not
save to the wiki. A transcript now carries a bar with "Ask AI about
this video" and "Summarise for the wiki" (prefilled, never sent on its
own), the reader's AI answers have "Save to wiki", and the card's green
"Transcript added" opens the transcript.
```

---

## Addendum (CTO, after the live check): the reader's AI must work on a transcript

**Found live.** In the reader's AI, a transcript question fails with `400 {"error":"Context is not
available."}`, for both the chat POST and `/ai/chat/starter-questions`. The chip shows
"p. 1 · text only". The reader passes `pageNumber: readerActivePageNumber` (which defaults to 1)
into the embedded chat's `documentScope`. So `mandatoryDocumentContext` (`BoardAiChatDrawer.tsx`
~508) builds a `knowledge-page` for page 1. A transcript is `kind === 'text'`, and the server
refuses a page on a pageless source (`lib/server/ai/boardAiChatContext.ts`: "This source has no
pages…"). This predates PATCH-200, but PATCH-200's buttons lead straight into it, so it is fixed
here.

**Fix:** in `KnowledgeSourceReaderDrawer.tsx`, for a text document (`reader.kind ===
KNOWLEDGE_TEXT_KIND`), pass `pageNumber: null` in `documentScope`, in EVERY embedded chat (both
hosts). `mandatoryDocumentContext` then builds `boardAiDraftFromDocument` → `knowledge-document`,
which the server resolves from the text chunks (the pageless branch at ~345). Check that the
starter-questions request is built from the same scope and so is fixed too. If it is not, fix it
the same way inside `BoardAiChatDrawer.tsx` (the client side only).

**Test:** reader drawer: for a text document, the embedded chat's `documentScope.pageNumber` is
null (or the chat's context chip reads "text only" without "p. 1"). For a PDF it is still the
active page.
**Mutation 4:** pass `readerActivePageNumber` for text again → that test fails.
No server change.
