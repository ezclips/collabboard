# PATCH-203 — Board AI answers render their formatting (bold, lists, headings)

Status: AUTHORIZED (PM decision, 2026-09-27). Owner screenshot: an answer shows `**1.d4**` and
`**2.Bf4**` with the asterisks visible. The model writes Markdown; the chat prints it as plain
text (`BoardAiChatDrawer.tsx` ~1686-1697: `whitespace-pre-wrap` + `{message.content}`).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-202 (`9b4e60ce`)

**Dependency decision (PM):** add `react-markdown@10.1.0` (exact pin; peer `react >=18`; the
repo is on React 19). It is the standard React Markdown renderer and is safe by default: it does
not render raw HTML (no `rehype-raw`, never add it), and its default `urlTransform` drops
`javascript:` and other unsafe URLs. No `remark-gfm`: CommonMark covers bold, italics, lists,
headings, code and links, which is what the answers use. The repo has no Markdown renderer today
(checked).

Read first:
- `components/collabboard/BoardAiChatDrawer.tsx` ~1680-1700: how a message bubble renders, user
  vs assistant, and the citation/SOURCES block rendered separately below it;
- how Save as Note / Save to wiki read the message content (they must keep the RAW Markdown:
  the wiki stores Markdown, and a note's own formatting path is separate).

---

## 1. Design
- **Assistant** messages render `message.content` through a small component
  `components/collabboard/BoardAiMarkdown.tsx`: `<ReactMarkdown>` with a `components` map giving
  compact Tailwind styling that fits the `text-xs` bubble:
  - `p` with a small bottom margin (not after the last one);
  - `strong`, `em`;
  - `ul` / `ol` with `list-disc` / `list-decimal` and `pl-4`;
  - `li`;
  - `h1`-`h4` as small semibold lines (never large headings in a chat bubble);
  - inline `code` and `pre` in a light grey box, with `pre` scrolling horizontally;
  - `a` opening in a new tab with `rel="noopener noreferrer"`;
  - `blockquote` with a left border;
  - `hr`.

  Drop `whitespace-pre-wrap` for assistant bubbles only; paragraphs come from the Markdown.
- **User** messages stay plain text, exactly as today (what the person typed is not Markdown).
- **Streaming / pending** replies: if the bubble renders partial text while streaming, render it
  through the same component. Unclosed `**` simply shows as text until closed; that is fine.
- Nothing else changes: the SOURCES block, the buttons, and the content passed to Save as Note /
  Save to wiki (raw Markdown).
- No `dangerouslySetInnerHTML` anywhere.

## 2. Tests
- `BoardAiMarkdown.test.tsx`:
  - `**1.d4**` renders `<strong>1.d4</strong>` with no asterisks in the text;
  - a `- a\n- b` list renders a `ul` with 2 `li`;
  - `## Heading` renders a small heading element;
  - raw HTML such as `<img src=x onerror=alert(1)>` or `<script>` is NOT rendered as an element;
  - a `javascript:` link has no `javascript:` href;
  - a normal link has `target="_blank"` and `rel` containing `noopener`.
- Chat drawer: an assistant message with `**bold**` shows a `strong`; a USER message with
  `**bold**` shows the asterisks literally; Save to wiki / Save as Note still send the raw
  Markdown (existing tests stay green; add one assertion if none covers it).
- **Mutations** (report each):
  1. Render the assistant message as plain text → the strong test fails.
  2. Add `rehype-raw` or `skipHtml={false}` with raw HTML allowed → the raw-HTML test fails. If
     that can't be done without installing, instead render via `dangerouslySetInnerHTML` in a
     throwaway edit.

## 3. Allowed files
```
package.json, package-lock.json                     (react-markdown@10.1.0 only: `npm install react-markdown@10.1.0 --save-exact`)
components/collabboard/BoardAiMarkdown.tsx (+ .test.tsx)   (new)
components/collabboard/BoardAiChatDrawer.tsx (+ its tests)
```
`npm install` is allowed while the dev server runs; a production build is not. If vitest cannot
load the ESM package, fix it in `vitest.config.ts` (allowed, only for that) and say what you did.
If a census or source test pins the bubble markup (e.g. `whitespace-pre-wrap`), STOP and ask, with
the conflict written out (spec line, code at file:line, proposed resolution).

Use `rg` or `timeout 30` on every search. Every test command is `timeout 600 npx vitest run …`.
Delete temporary diagnostic files. Never use git stash, reset, restore, checkout, clean, commit or
push. Never touch the database. Real tool calls only.

## 4. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/BoardAiMarkdown components/collabboard/boardAiChat components/collabboard/BoardAiChatDrawer components/collabboard/KnowledgeSourceReaderDrawer
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-203.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO, own tab):** an answer on the London transcript shows bold moves and bullet lists
with no asterisks; Save to wiki still puts the Markdown (with `**`) into the wiki draft.

## 5. Commit message (verbatim)
```
feat(board-ai): answers render their formatting

The model answers in Markdown and the chat printed it raw, so moves
read as **1.d4**. Assistant answers now render through react-markdown
(pinned, raw HTML never rendered, unsafe links dropped) with compact
styling for the chat bubble. What you typed stays plain text, and Save
as Note / Save to wiki still keep the original Markdown.
```
