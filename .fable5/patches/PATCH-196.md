# PATCH-196 — Board AI reads the board wiki (wiki-query-plan U1)

Status: AUTHORIZED (PM decision, 2026-09-27; owner: "you are the PM … go online/repo on how to do
it based on people who have done it"). The decisions and their evidence are in
`.agent/wiki-query-plan.md`. Read it first: D1–D4 are the design this spec implements.
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: `b64051fd`
Read first (in this order):
- `.agent/wiki-query-plan.md` (the decisions) and `.agent/retrieval-followups.md` §3 (how search
  passages became citable as `S{n}.{i}`; this patch adds a third kind of passage to the same
  mechanism);
- `lib/domain/ai/boardAiSearchContext.ts`: `BoardAiSearchPassage`, `BoardAiSearchSource`,
  `mergeBoardAiSearchPassages`, `boundBoardAiSearchPassages`, `boardAiSearchContextBlock` (the
  origin line and the `titleOnly` wording) and `BOARD_AI_SEARCH_PASSAGE_OVERHEAD`;
- `lib/server/ai/boardAiChatSearch.ts`: `BoardAiSearchReader` and `searchBoardAiContext` (steps
  1–3, the timeout, and how one failing source does not lose the other), plus the reader's
  production implementation;
- `lib/domain/ai/boardAiSearchQuery.ts` (`buildBoardAiSearchQuery`: reuse its terms);
- `lib/domain/ai/boardAiChatCitation.ts`: the `BoardAiCitationItem` union,
  `citationItemFromPassage`, `boardAiCitationItemFromPassage`, `boardAiCitationIdentityKey`,
  `boardAiCitationsFromStored`, `canonicalItem`, `BOARD_AI_CITATION_INSTRUCTIONS`;
- `lib/server/ai/boardAiProvenanceProof.ts` (signing must still verify every OLD proof);
- `lib/domain/wiki/boardWikiPageSources.ts` (`boardWikiPageSourcesFromStored`,
  `boardWikiSourceStates`, `boardWikiPageFreshness`) and
  `lib/server/wiki/boardWikiSourceVersions.ts` (`readCurrentSourceVersions`);
- `lib/server/ai/boardWikiCompilation.ts` (it compiles from search passages);
- `supabase/migrations/20260919120000_create_board_wiki_pages.sql` (columns and RLS; read only,
  NO migration in this patch);
- `components/collabboard/BoardAiChatDrawer.tsx` (how a citation renders and calls
  `onOpenCitation`), `components/collabboard/BoardWikiDrawer.tsx` (`selectedPageId`),
  `app/dashboard/canvas/[id]/CanvasClient.tsx` (`openBoardAiCitation` ~11344/11365,
  `openBoardWiki` ~2239).

---

## 1. Why

The owner asked where the "Output" part of the LLM-wiki pattern is: ask a question, get the answer
from the wiki. It does not exist. When board search runs, the chat reads raw posts and PDF passages
every time and never reads a compiled wiki page, even a page someone corrected by hand. Both
Karpathy's pattern and nashsu/llm_wiki (which our wiki is based on) answer from the wiki first
(llm_wiki's agent tools: `wiki.search`, `wiki.read_page`, then `source.search`). Details and
sources are in the plan.

## 2. The design

### 2.1 A third kind of search passage: `'wiki'`

- `BoardAiSearchSource` becomes `'post' | 'knowledge' | 'wiki'`.
- `BoardAiSearchPassage` gains `wikiPageId?: string` and
  `wikiFreshness?: 'current' | 'stale' | 'sources-gone' | 'unknown'`.
- In `ResolvedBoardAiContextBlock.passages` (identity and label only, never text), a wiki passage
  carries `wikiPageId`.

### 2.2 Reading and scoring the wiki (D3: in-app, lexical, no migration)

- Add `searchWikiPages(boardId, limit)` (or similar) to `BoardAiSearchReader`. Its production
  implementation reads `board_wiki_pages` scoped by `board_id`, **after** the same
  `canReadBoardKnowledge` check STEP 1 already performs, with the same reader and authority as
  the other two searches. Select `id, title, content, sources, compiled_at`; cap it at 200 rows
  (`order by updated_at desc`).
- Score in a PURE domain function (new `lib/domain/ai/boardAiWikiSearch.ts`):
  - match the terms from `buildBoardAiSearchQuery(message)`, case-insensitively, on word
    boundaries;
  - score = 3 × (distinct terms in the title) + (distinct terms in the content);
  - a page needs at least one term;
  - ties are broken by title, alphabetically, so the order is deterministic;
  - return the top `BOARD_AI_WIKI_MAX_PAGES = 2`.
- Excerpt: at most `BOARD_AI_WIKI_EXCERPT_CHARS = 1500` characters of the page body. Start it at
  the paragraph containing the first matching term, or at the page start if the first match is in
  the title. Keep the page's `[S…]` source markers as they are.
- Run it inside the SAME bounded search clock as posts and chunks. A wiki failure must not fail
  the search: treat it as no wiki passages, exactly as one failing source is already treated.
- Freshness is best-effort. Compute it with `readCurrentSourceVersions` +
  `boardWikiPageFreshness` for the chosen pages only. Any error gives `'unknown'`, never a failed
  search.

### 2.3 Order and budget (D1, D4)

- Wiki passages go FIRST in the block, then the existing merged post and PDF passages.
- Their total characters (text + overhead) may take at most 40% of `availableChars`. If the next
  wiki excerpt does not fit, skip it. The post and PDF passages keep the rest, with the existing
  rules unchanged.
- The block is still ONE `board-search` block. The four-slot rule, the de-duplication and
  `BOARD_AI_SEARCH_MIN_ROOM_CHARS` are unchanged.

### 2.4 What the model reads (D2: chain of custody)

- Origin line for a wiki passage:
  `[S{n}.{i} | board wiki page, compiled from board sources{FRESH}: {title}]`, where `{FRESH}` is
  `""` for current, `" — STALE: its sources changed after it was compiled"`,
  `" — its sources were deleted"`, or `""` for unknown.
- Add ONE sentence where the search rules already live (`BOARD_AI_CITATION_INSTRUCTIONS` or the
  search block's own lead-in; say which in the report):
  > Board wiki pages are summaries compiled from the board; when a post or document passage
  > supports a statement, cite that passage, and cite a wiki page only for what it alone
  > supports. Treat a STALE page as possibly out of date.

### 2.5 The citation: new item type `wiki-page`

- `BoardAiCitationItem` gains `{ type: 'wiki-page'; wikiPageId: string; label: string }`.
- `boardAiCitationItemFromPassage`: a `'wiki'` passage with a `wikiPageId` emits it; without one
  it emits null.
- `boardAiCitationIdentityKey`: `wiki-page:{wikiPageId}`.
- `boardAiCitationsFromStored`: accept and validate the new type (non-empty string id and label);
  reject anything malformed, as for the other types.
- `canonicalItem` and provenance: the new type canonicalizes to its own fields. **Every existing
  proof must still verify byte for byte**: add a test that verifies a pre-patch proof fixture
  unchanged.
- **The error-compounding guard (D6).** The wiki compiles from search passages
  (`boardWikiCompilation.ts` uses `boardAiCitationItemFromPassage`). A compiled page must NEVER
  list another wiki page as its source. The compiler must therefore never read wiki passages:
  either it calls the search without the wiki, or it drops `'wiki'` passages before compiling.
  Pick the smaller change, and pin it with a test.

### 2.6 Opening a wiki citation

- `BoardAiChatDrawer`: a `wiki-page` citation renders with the label prefixed "Wiki: " and calls
  `onOpenCitation` like the others.
- `CanvasClient.openBoardAiCitation`: `wiki-page` → open the board wiki drawer ON THAT PAGE.
  `BoardWikiDrawer` gains an optional `requestedPageId` prop. When the drawer opens, or when the
  prop changes, with a page id that exists in its list, it selects that page; an unknown id leaves
  the current selection. Follow the dock/claim rules `openBoardWiki` already uses (the chat and
  the wiki must not fight over the screen).
- The reader's own `onOpenCitation` (`KnowledgeSourceReaderDrawer`) ignores `wiki-page`. That is a
  no-op; it must not crash.

## 3. Tests

- **Domain scoring:**
  - title outranks body;
  - no match gives no page;
  - the top 2 are returned;
  - the tie-break is deterministic;
  - the excerpt starts at the matching paragraph and is capped at 1500;
  - `[S…]` markers survive.
- **Search** (`boardAiChatSearch` tests, with the stub reader):
  - wiki passages come first;
  - the 40% cap holds;
  - a wiki read error still returns the posts and chunks;
  - a freshness error gives `unknown`;
  - an all-stopword message makes no wiki read;
  - still exactly one block.
- **Citations:**
  - `S{n}.1` on a wiki passage gives a `wiki-page` item;
  - a missing `wikiPageId` gives null;
  - the identity key;
  - stored round-trip and malformed rejection;
  - an OLD proof fixture still verifies, and a proof over a `wiki-page` citation verifies.
- **Origin line:** stale, gone and current wording.
- **Compiler guard:** a compile never records a `wiki-page` source.
- **UI:**
  - the "Wiki: " label;
  - `openBoardAiCitation` opens the wiki with `requestedPageId`;
  - `BoardWikiDrawer` selects the requested page, and ignores an unknown id;
  - the reader's opener ignores `wiki-page`.
- **Mutations:**
  - put wiki passages last → the order test must fail;
  - remove the 40% cap → the cap test must fail;
  - let the compiler keep wiki passages → the guard test must fail.

  Report all three.

## 4. Allowed files

```
lib/domain/ai/boardAiSearchContext.ts (+ test)
lib/domain/ai/boardAiWikiSearch.ts (+ test)                 (new)
lib/domain/ai/boardAiChatContext.ts                          (the passages identity type only)
lib/domain/ai/boardAiChatCitation.ts (+ test)
lib/server/ai/boardAiChatSearch.ts (+ test) and the file holding its production reader
lib/server/ai/boardAiProvenanceProof.ts (+ test)            (only if the new type needs it)
lib/server/ai/boardWikiCompilation.ts (+ test)              (§2.5 guard only)
components/collabboard/BoardAiChatDrawer.tsx (+ its citation test)
components/collabboard/BoardWikiDrawer.tsx (+ test)
components/collabboard/KnowledgeSourceReaderDrawer.tsx      (only if needed for the no-op)
app/dashboard/canvas/[id]/CanvasClient.tsx                  (openBoardAiCitation and the drawer prop only)
```

Forbidden:
- migrations and the database;
- the chat route's credit logic;
- `package.json`.

If a census or source test elsewhere pins something this changes, or anything conflicts with the
code, STOP and ask, with the conflict written out: the spec line, the code at file:line, and your
proposed resolution. Never use git stash, reset, restore, checkout, clean, commit or push. Never
run a production build. Make every edit with a real tool call; never write a tool call, a
`<bash>` block or a command out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/ai lib/server/ai lib/domain/wiki lib/server/wiki components/collabboard/BoardAiChatDrawer components/collabboard/BoardWikiDrawer
npx vitest run --reporter=json --outputFile=.opencode-vitest-196.json
```

The failing FILE set must equal the 26-file baseline. Report:
- files changed and tests added;
- the output;
- the three mutation results;
- where the §2.4 sentence went.

Do not commit.

**Live (CTO, CDP 9333, separate tab), on a board that has a compiled wiki page:** ask Board AI a
question with search on, where the question matches that page.
- The answer cites "Wiki: …" and, where one exists, a raw passage too.
- Clicking the wiki citation opens the wiki on that page.
- A question matching no page shows no wiki citation.

## 6. Commit message (verbatim)

```
feat(board-ai): answers read the board wiki first

Board search now also searches the board's compiled wiki pages, in-app and
lexically (title weighted, at most two pages, at most 40% of the search
budget), and puts them first in the one search block, the order
nashsu/llm_wiki uses. A wiki passage is cited as a new wiki-page item that
opens the wiki on that page. Chain of custody: the model is told a page is a
compiled summary and to cite the raw passage where one exists, a stale page
is labelled stale, and the wiki compiler never takes a wiki page as a source.
Existing provenance proofs verify unchanged.
```
