# PATCH-202 — A wiki page's sources look like what they are: links to the original

Status: AUTHORIZED (PM decision, 2026-09-27). Owner: "If you open up the wiki a couple of months
later, you don't know what the source was." CTO live check (Chess Lessons page): the "Compiled
from" chips ARE already buttons, and clicking "Basic Chess Openings Explained" opens the full
transcript in the reader. The defect is that nothing shows this: they look like grey tags, with no
kind (video or PDF) and no hint that they open the original.
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-201 (`91ea4703`)
Read first:
- `components/collabboard/BoardWikiDrawer.tsx` ~685-745: the "Compiled from" section, the
  `openable` rule (a `gone` source is never clickable), `status.isTranscript`, `stateLabel` /
  `stateClass`, `KNOWLEDGE_TRANSCRIPT_DISCLOSURE`;
- its test `components/collabboard/BoardWikiDrawer.test.tsx`;
- how icons are imported elsewhere in `components/collabboard` (`lucide-react` is already a
  dependency).

---

## 1. Why

A wiki page is the "understanding" layer; its sources are the truth. Months later, the way back to
the truth has to be obvious. Today it works but is invisible.

## 2. The design (UI only, `BoardWikiDrawer.tsx`)

- **Heading:** "Compiled from" gets a short sub-line, shown only when at least one chip is
  openable: `Click a source to open the original.`
- **Each OPENABLE chip reads as a link:**
  - a leading icon by kind: a video/play icon for a transcript source (`status.isTranscript`), a
    document icon for a PDF source (`knowledgeDocumentId` with a page number, or not a transcript);
  - a kind word before the label, in lighter text: `Video transcript ·` or `PDF ·` (keep the
    existing label as is, e.g. "chess_opening_theory.pdf — page 1");
  - blue link text with underline on hover, and `title` text: `Open the full transcript` or
    `Open this PDF at page N` (or `Open this PDF` with no page);
  - the existing state label (e.g. changed) stays.
- **Non-openable chips** (a `gone` source, a post, no handler) are unchanged: plain, not blue, no
  link styling. Do not make a gone source look clickable.
- The click behaviour is unchanged (`onOpenCitation`).

### What does not change
The data, the server, the proposal flow, the transcript disclosure line, which chips are openable.

## 3. Tests (`BoardWikiDrawer.test.tsx`)
- A transcript source renders the video icon, "Video transcript ·", title `Open the full
  transcript`, and clicking calls `onOpenCitation` with its documentId (existing behaviour, pinned).
- A PDF page source renders "PDF ·" and title `Open this PDF at page 1`.
- A `gone` source has no link styling and no title, and is not a button.
- The sub-line appears only when at least one chip is openable.
- **Mutations** (report each):
  1. Drop the kind word → the transcript test fails.
  2. Give a gone source the link styling/button → the gone test fails.

## 4. Allowed files
```
components/collabboard/BoardWikiDrawer.tsx
components/collabboard/BoardWikiDrawer.test.tsx
```
Forbidden: everything else. If a census or source test elsewhere pins the chip markup, STOP and
ask, with the conflict written out (spec line, code at file:line, proposed resolution).

Use `rg` or prefix `timeout 30` on every search. Every test command is `timeout 600 npx vitest run …`.
Delete any temporary diagnostic file. Never use git stash, reset, restore, checkout, clean, commit
or push. Never run a production build. Real tool calls only.

## 5. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/BoardWikiDrawer components/collabboard/boardAiChatWiring
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-202.json
```
The failing FILE set must equal the 26-file baseline. Compact report: files changed, tests,
output, both mutations. Do not commit.

**Live (CTO, own tab):** the Chess Lessons page shows "Video transcript · Basic Chess Openings
Explained" and "PDF · chess_opening_theory.pdf — page 1" as links, and each opens its original.

## 6. Commit message (verbatim)
```
feat(wiki): a page's sources look like links to the original

The "Compiled from" chips already opened their source, but looked like
grey tags with no kind, so months later nobody would know the way back
to the original. Each openable source now shows whether it is a video
transcript or a PDF, reads as a link, and says what clicking opens.
```
