# Asking the board wiki — query and "save to wiki"

**Status: DECIDED by the PM (2026-09-27), built unit by unit.** Each unit gets its own PATCH spec.
This continues `.agent/wiki-plan.md`, which built the compiled pages and deliberately left the
query side until real pages existed.

The owner asked where the "Output" part of Karpathy's diagram is ("user node → wiki → rich
answer; compounding knowledge"). It is not built. Today the Board AI chat searches the raw board
every time and never reads a wiki page, and no answer ever goes back into the wiki.

---

## 1. What others learned

**Karpathy's pattern** (`nashsu/llm_wiki/llm-wiki.md`) names three operations: ingest, **query**,
lint.
- Query: "the LLM searches for relevant pages, reads them, and synthesizes an answer with
  citations."
- "Good answers can be filed back into the wiki as new pages". That is where the compounding
  comes from.
- For search, an index of the pages is read first, and at moderate scale (hundreds of pages) that
  "avoids the need for embedding-based RAG infrastructure".

**nashsu/llm_wiki, the implementation our wiki is based on** (source read 2026-09-27):
- The chat agent's tools, in this order: `wiki.search` (keyword, optionally vector) and
  `wiki.read_page`, then `source.search` for raw sources, then graph and web. **Wiki first, raw
  sources second.**
- Context budget (`src/lib/context-budget.ts`): about 5% index, 50% wiki pages, 15% reserved for
  the answer, the rest history and system prompt. Each page is capped at 30% of the page budget
  (minimum 5K characters), so a single page cannot take up the whole budget.
- The system prompt: "Answer using the provided LLM Wiki context and references. If the context is
  insufficient, say what is missing instead of inventing details."
- Each answer shows the wiki pages it used, grouped by type.
- **"Save to Wiki" is an explicit button on each answer.** They first detected "save-worthy"
  answers automatically and removed it (`chat-panel.tsx`: "save-worthy detection removed — user
  has direct 'Save to Wiki' button"). A saved answer becomes a `type: query` page in
  `wiki/queries/`, is added to the index and the log, and is then **auto-ingested** so its content
  flows into other pages.

**Practitioners' warnings:**
- **Error compounding.** When an AI answer is stored and later read back as if it were a source,
  mistakes build on each other. Keeping synthesis at query time "preserves the chain of custody
  … because nothing the LLM produces is ever stored as a source" (Lahoti, "The Hidden Flaw in
  Karpathy's LLM Wiki").
- **Check quality before filing.** "Evaluate LLM-generated answers before filing … content below
  threshold gets flagged for human review" (rohitg00, "LLM Wiki v2"). The same source recommends
  provenance on every write, and flagging contradictions rather than resolving them silently.
- **Hybrid, not one or the other.** The wiki is the curated "what we know" layer, and raw
  retrieval is the "what the corpus says right now" evidence. The combination gives fewer
  hallucinations than retrieval alone (Atlan, "LLM Wiki vs RAG").
- **"Zero maintenance" is not true.** Contradiction checks and cleaning up stale pages recur; that
  is the lint operation.

## 2. The decisions

**D1. Answers read the wiki first, and still see the raw passages.** When board search runs,
matching wiki pages go into the SAME search block, ahead of the post and PDF passages. They are one
more kind of passage, citable as `S{n}.{i}` like the rest. This is llm_wiki's order and the hybrid
lesson, and it keeps our invariants intact: one search block, the four-slot rule, the character
budget, and the positional citation grammar shipped in followups item 3.

**D2. Chain of custody: a wiki page is never evidence on its own.** A wiki passage is presented
as "compiled from sources", with its freshness (`boardWikiPageFreshness`: current / stale /
sources-gone). The prompt tells the model to cite the raw passage when it has one, and to use a
wiki page for synthesis. A stale page is labelled stale for the model and in the citation. This is
the fix for the error-compounding warning, applied at read time.

**D3. Wiki search is in-app and lexical, with no migration.** A board has tens of pages, not
thousands. Read the board's pages through the caller's own RLS client, and score by term matches
with a title bonus, the way llm_wiki's Phase 1 does. Measure before adding an index or vectors
(`wiki-plan.md` P2 still applies: vectors gate infrastructure, not features).

**D4. The budget is borrowed from llm_wiki, with our own numbers.** At most 2 wiki pages per turn.
Each page excerpt is capped so that the raw passages always keep room. The exact numbers are set
in the spec and then measured on the rating battery; they are not imported from llm_wiki.

**D5. "Save to wiki" is a button, and it creates a proposal.** It follows llm_wiki's lesson (an
explicit button, not auto-detection) and our own P3 ("edits win; the machine proposes"):
- the answer becomes a proposal for a new page, or for an addition to an existing page;
- a person accepts it through the proposal flow the Recompile button already uses.

**D6. No automatic cascade.** llm_wiki auto-ingests a saved answer into other pages. We do not.
That is the step that turns one wrong answer into several wrong pages, and a board is shared by a
team. The saved page's `sources` are the passages the answer actually cited, never the answer
itself. Contradiction checks come later, as lint (U3).

## 3. The units

- **U1 — Board AI reads the wiki (D1–D4).** Wiki passages in the search block, a citation item
  that opens the wiki at that page, and freshness shown on it. Measured by the golden questions
  asked with and without the wiki on a board that has compiled pages: answer correctness and
  whether the citations resolve.
- **U2 — "Save to wiki" (D5, D6).** A button on each answer, creating a proposal for a new page
  or an addition, whose sources are the passages the answer cited.
- **U3 — Lint, later.** Find stale pages, pages whose sources are gone, and contradictions between
  pages. It is decided against real use (as in `wiki-plan.md` §5b), not before.

## 4. Non-goals

- Embeddings, ANN index or graph weights (llm_wiki's ×3.0 / ×4.0 / ×1.5 / ×1.0 are fitted to
  another corpus).
- A cross-board wiki (it breaks the per-board ACL inheritance).
- Automatic filing of answers.

## Sources

- https://github.com/nashsu/llm_wiki: `llm-wiki.md`, `src/lib/context-budget.ts`,
  `src/components/chat/chat-panel.tsx`, `src/components/chat/chat-message.tsx`,
  `src-tauri/src/agent/tools.rs`
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- https://foundanand.medium.com/the-hidden-flaw-in-karpathys-llm-wiki-e3a86a94b459 (search
  summary; the page itself is paywalled)
- https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2
- https://atlan.com/know/llm-wiki-vs-rag-knowledge-base/
