# PATCH-201 — A transcript's AI takes half the reader; "Summarise this video" sends

Status: AUTHORIZED (PM decision, 2026-09-27). Owner, on the open London System transcript with the
AI panel open: "split the transcript screen in half, AI is too small. What does this button do?"
(pointing at "Summarise for the wiki").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-200 (`6ff3b238`)
Read first:
- `components/collabboard/KnowledgeSourceReaderDrawer.tsx`: the side-panel host's right panel
  (~1186: `lg:w-[300px] lg:flex-none`), `sidePanelRightPanel`, the PATCH-200 handlers
  (`openReaderAiPanel` / `summariseTranscriptForWiki`) and how the prefill reaches the embedded
  chat; the workspace host's equivalent;
- `components/collabboard/KnowledgeTextSourceView.tsx` (the PATCH-200 bar);
- `components/collabboard/BoardAiChatDrawer.tsx`: the PATCH-200 `initialDraftText` /
  `initialDraftTextRequestId` effect, and how a starter-question chip SENDS on click (find the
  send path the chips use — reuse it, do not write a second send);
- the PATCH-200 tests in `KnowledgeSourceReaderDrawer.test.tsx` and `boardAiChatWiring.test.tsx`.

---

## 1. Why

- The AI panel is a fixed 300px column beside a wide transcript: answers wrap to a few words per
  line and the composer is out of sight.
- "Summarise for the wiki" only PREFILLS the composer, in that small, far corner. The owner
  pressed it and could not tell that anything happened. A button that appears to do nothing is
  worse than one that spends one question the person asked for by clicking it. The suggested-
  question chips already send on click, so sending matches the rest of the panel.

## 2. The design

### 2.1 Half and half, for a transcript
- In the side-panel host, when the document is a text document (`reader.kind ===
  KNOWLEDGE_TEXT_KIND`) and the right panel is open, the panel is HALF the drawer from `lg` up
  (e.g. `lg:w-1/2 lg:flex-none`) instead of `lg:w-[300px]`. Below `lg` nothing changes (it
  already covers the reading pane).
- A PDF keeps 300px. The workspace host: apply the same rule only if it uses the same fixed
  column; say what you found.

### 2.2 "Summarise this video" sends
- Rename the button to **"Summarise this video"**.
- Clicking it opens the AI panel and SENDS `Summarise the key points of this video.` through the
  same path a starter-question chip uses (one send, once per click). If the chat is busy with a
  reply, do not queue a second send: ignore the click, or disable the button while busy.
- The helper line becomes: `Then use "Save to wiki" under the answer to keep it.` It is still
  shown only when saving to the wiki is possible. The button itself is shown whenever "Ask AI"
  is; summarising is useful without the wiki too.
- If PATCH-200's `initialDraftText` prefill is no longer used anywhere, remove it (props, effect,
  tests). If something else still uses it, keep it and say what.

## 3. Tests
- Reader drawer:
  - for a text document with the AI panel open, the right panel has the half-width class, and a
    PDF keeps `lg:w-[300px]`;
  - "Summarise this video" opens the AI panel and POSTs exactly ONE chat request whose message is
    `Summarise the key points of this video.`;
  - a second click while the reply is pending sends nothing more.
- Update PATCH-200's "sends NOTHING" test: its premise is reversed by owner feedback (authorized).
- **Mutations** (report each):
  1. Keep 300px for text → the half-width test fails.
  2. Prefill without sending → the "one POST" test fails.
  3. Allow a second send while pending → the "sends nothing more" test fails.

## 4. Allowed files
```
components/collabboard/KnowledgeSourceReaderDrawer.tsx (+ KnowledgeSourceReaderDrawer.test.tsx)
components/collabboard/KnowledgeTextSourceView.tsx
components/collabboard/BoardAiChatDrawer.tsx     (only: a way to send a given text once, reusing the chip path; removing the unused prefill)
components/collabboard/boardAiChatWiring.test.tsx
```
Forbidden: the database, migrations, the server and API routes, `package.json`, credits, the chat
route. If a census or source test elsewhere pins something this changes (e.g. `lg:w-[300px]`),
STOP and ask, with the conflict written out (spec line, code at file:line, proposed resolution).

Use `rg` or prefix `timeout 30` on every search (plain recursive grep hangs in this repo). Every
test command is `timeout 600 npx vitest run …`. Delete any temporary diagnostic file before
reporting. Never use git stash, reset, restore, checkout, clean, commit or push. Never run a
production build. Real tool calls only.

## 5. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/KnowledgeSourceReaderDrawer components/collabboard/boardAiChatWiring components/collabboard/boardAiChatDrawer components/collabboard/knowledgeReaderWorkspace
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-201.json
```
The failing FILE set must equal the 26-file baseline. Compact report: files changed, tests, output,
the three mutations. Do not commit.

**Live (CTO, CDP 9333, own tab):** open the London transcript, open the AI: half and half. Click
"Summarise this video" once: one answer arrives, with "Save to wiki". PDF reader still 300px.

## 6. Commit message (verbatim)
```
feat(transcript): the AI takes half the reader; "Summarise this video" sends

Beside a transcript the AI was a 300px column, and "Summarise for the
wiki" only filled in the composer in its far corner, so pressing it
looked like nothing happened. For a transcript the AI now takes half
the reader, and the button, renamed "Summarise this video", sends the
question on click, as the suggested questions already do.
```
