# PATCH-197 — "Save to wiki" on a Board AI answer (wiki-query-plan U2)

Status: AUTHORIZED (PM decision, 2026-09-27; owner: "go and push", continuing the wiki plan).
Design: `.agent/wiki-query-plan.md` D5 and D6. Read it first.
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-196 (`5d895960`)
Read first (in this order):
- `.agent/wiki-query-plan.md` (D5: an explicit button that creates a PROPOSAL; D6: no cascade, and
  sources are the passages the answer cited);
- `app/api/boards/[id]/ai/notes/provenance/route.ts` and `lib/server/ai/boardAiNoteProvenance.ts`.
  **This is the pattern to copy:** "Save as Note" never trusts the browser about sources. It names
  the assistant message, the server reads the stored, signed row, `verifyBoardAiProvenanceProof`
  checks it, and only the verified citation envelope is used. A forged or unsigned row is a 403;
  an answer that cited nothing is a success with no sources;
- `lib/server/wiki/boardWikiCompileSession.ts` (`compileBoardWikiProposal`, how a proposal row is
  written with `sources`, compile-time versions and `based_on_content` ~280/310), and
  `lib/server/wiki/boardWikiSourceVersions.ts` (`readCurrentSourceVersions`);
- `lib/server/wiki/boardWikiPageRoute.ts` (create, save, compile handlers: in particular the save
  handler's `appliedProposalId` rule, "versions are read off the server's own proposal row") and
  `lib/server/wiki/boardWikiPageSession.ts`;
- `app/api/boards/[id]/wiki/[pageId]/proposals/route.ts` (today, compile only);
- `components/collabboard/BoardAiChatDrawer.tsx` (the "Save as Note" action ~1671 and its state
  machine), `components/collabboard/BoardWikiDrawer.tsx` (`requestRecompile` ~348,
  `applyProposalToDraft` ~755, `requestedPageId` from PATCH-196), and
  `app/dashboard/canvas/[id]/CanvasClient.tsx` (`openBoardWiki`, how PATCH-196 opens the wiki
  on a page).

---

## 1. Why

PATCH-196 made Board AI read the wiki. The loop that makes a wiki compound, a good answer going
back into it, does not exist yet. Karpathy: "good answers can be filed back into the wiki as new
pages". nashsu/llm_wiki shipped this as an explicit "Save to Wiki" button, after first detecting
save-worthy answers automatically and removing that. Practitioners warn that saving AI output as
if it were a source compounds errors. So the saved answer arrives as a proposal a person accepts,
and its sources are only the original passages the answer verifiably cited.

## 2. The design

### 2.1 The server: a proposal from an answer

- Extend `POST /api/boards/[id]/wiki/[pageId]/proposals` to accept EITHER the existing
  `{ topic }` (compile, unchanged) OR `{ fromMessageId }`. Exactly one of the two, otherwise 400.
  A new handler factory next to the compile one is fine; the route file binds both through one
  POST that dispatches on the body.
- `fromMessageId` path, in a new server module `lib/server/wiki/boardWikiAnswerProposal.ts`:
  1. The same session/authority as the compile path: the page must be on this board and
     writable by the caller, exactly as compile requires.
  2. Read the assistant message through the caller's own client, scoped to this board, exactly
     as the note provenance route does. It must be `role = assistant`, on THIS board, and
     readable by the caller; otherwise 404.
  3. `verifyBoardAiProvenanceProof` on it. A failed proof is a **403**, as in the note route. Never
     fall back to unverified citations.
  4. **Sources = the verified citations minus every `wiki-page` item** (D6: a wiki page is never
     a source of a wiki page), de-duplicated by `boardAiCitationIdentityKey`. Their versions come
     from `readCurrentSourceVersions` at this moment, in the same shape the compile path stores.
  5. **Content:** the page's current content, then a blank line, then a section:
     `## {question}` (the preceding user message's text, first line, at most 120 characters; if
     there is none, "From Board AI"), then the answer's visible text, with the citation footer and
     any machine markers removed. Reuse the chat's own footer parser; do not write a second one.
     `based_on_content` = the page's current content, exactly as compile records it.
  6. Insert the proposal row the same way compile does (same columns, same writer if it can be
     shared). Return `{ proposal }` with status 201, in the same shape as compile.
- No model call and no credit charge: nothing here reaches an LLM.

### 2.2 The chat: the button

- Next to "Save as Note" on an assistant answer: **"Save to wiki"**. Show it only when the answer
  is stored (it has a message id) and the viewer can edit wiki pages. Use the same capability the
  wiki drawer uses for Save; when a viewer cannot, render nothing, not a disabled button.
- Clicking opens a small popover:
  - **New page**: a title input prefilled with the question (first line, at most 80 characters)
    and a "Create" button;
  - **Add to page**: the board's existing pages (`GET /api/boards/[id]/wiki`), one click each.
- New page: `POST /api/boards/[id]/wiki { title }` → then the proposal call on the new page id.
  Add to page: the proposal call on that id.
- On success, open the board wiki ON THAT PAGE with the returned proposal already in the draft
  for review (§2.3). The popover and button show "Saving…" / "Sent to wiki" states like Save as
  Note. On failure: a short message that names the reason:
  - 403: "This answer's sources could not be verified";
  - 404: "That page no longer exists";
  - otherwise: "Could not save to the wiki. Try again."

  Nothing is left half-done: if the page was created but the proposal failed, say so ("Page
  created; the answer was not added"). Do not delete the page silently.

### 2.3 The wiki drawer: review before it lands

- `BoardWikiDrawer` gains an optional `pendingProposal` prop (with its page id). When the drawer
  shows that page, it applies the proposal to the draft through the SAME
  `applyProposalToDraft` path Recompile uses, so the user sees the change and saves it (the save
  carries `appliedProposalId`, and versions are read off the proposal row, unchanged).
- The proposal is applied once. Closing the drawer without saving discards the draft, exactly as
  it does for a Recompile proposal today. Nothing is saved automatically.

### 2.4 What does not change

- Board AI reading the wiki (PATCH-196), the compile path and its `includeWiki: false` guard.
- The save handler and its version rule.
- No migration: the proposal table already has every column needed.
- No auto-ingest or cascade into other pages (D6).

## 3. Tests

- **Server module** (`boardWikiAnswerProposal.test.ts`, stubbed clients):
  - a verified answer gives a proposal whose sources are exactly its raw citations, with the
    `wiki-page` citations removed and duplicates collapsed;
  - an answer citing only wiki pages gives a proposal with no sources;
  - an answer that cited nothing gives a proposal with no sources, not an error;
  - a failed proof gives 403 and no row written;
  - a message on another board, a user message, or an unknown id gives 404 and no row;
  - the content is the current content, then `## {question}`, then the answer without its footer;
  - `based_on_content` equals the current content.
- **Route:**
  - `{ topic }` still compiles (existing tests stay green);
  - `{ fromMessageId }` takes the new path;
  - both, or neither, gives 400;
  - an unauthenticated caller gives 401.
- **Chat drawer:**
  - the button is absent for a viewer and for an unsaved answer;
  - New page calls create, then the proposal, then opens the wiki with the page id and proposal;
  - Add to page skips create;
  - the 403 and 404 messages;
  - "Page created; the answer was not added" on a proposal failure after a create.
- **Wiki drawer:** `pendingProposal` is applied to the draft once, through
  `applyProposalToDraft`, and not saved until Save is clicked.
- **Mutations** (report each):
  1. Keep `wiki-page` citations as sources → the D6 test must fail.
  2. Skip the proof check → the 403 test must fail.
  3. Auto-save the pending proposal → the "not saved until Save" test must fail.

## 4. Allowed files

```
lib/server/wiki/boardWikiAnswerProposal.ts (+ test)          (new)
lib/server/wiki/boardWikiPageRoute.ts (+ test)
lib/server/wiki/boardWikiPageSession.ts                       (only to expose the new operation)
lib/server/wiki/boardWikiCompileSession.ts                    (only to share the proposal writer)
app/api/boards/[id]/wiki/[pageId]/proposals/route.ts
components/collabboard/BoardAiChatDrawer.tsx (+ its tests)
components/collabboard/BoardWikiDrawer.tsx (+ test)
app/dashboard/canvas/[id]/CanvasClient.tsx                    (wiring the open-with-proposal only)
```

Forbidden:
- migrations and the database;
- the chat route;
- credits;
- `boardAiProvenanceProof.ts` (use it, do not change it);
- `package.json`.

If a census or source test elsewhere pins something this changes, or the code disagrees with the
spec, STOP and ask, with the conflict written out: the spec line, the code at file:line, and your
proposed resolution.

**Test commands:** every one is `timeout 600 npx vitest run …`, never bare `npx vitest`. Any
temporary diagnostic test file is deleted before you report.

Never use git stash, reset, restore, checkout, clean, commit or push. Never run a production
build. Make every edit with a real tool call; never write a tool call, a `<bash>` block or a
command out as text.

## 5. Verification

```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/server/wiki lib/domain/wiki components/collabboard/BoardAiChatDrawer components/collabboard/BoardWikiDrawer components/collabboard/boardAiChat
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-197.json
```

The failing FILE set must equal the 26-file baseline. Keep the report compact:
- files changed and tests added;
- the output;
- the three mutation results.

Do not commit.

**Live (CTO, CDP 9333, own tab):**
- Save a chess answer to a new page. The wiki opens on it with the proposal in the draft, and its
  sources are the video and PDF passages. Save it.
- Then ask Board AI a question it answers from that page.
- Delete the test page afterwards.

## 6. Commit message (verbatim)

```
feat(wiki): save a Board AI answer to the wiki, as a proposal

A "Save to wiki" button on each stored answer adds it to a new or existing
wiki page. The server reads the signed answer itself and verifies its
provenance, as Save as Note does; the proposal's sources are only the
answer's verified original passages -- never a wiki page, so errors cannot
compound through the wiki -- and the wiki opens with the proposal in the
draft for a person to review and save. No model call, no credits, no
automatic cascade into other pages.
```
