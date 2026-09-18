# Board retrieval — deferred work, with the evidence

Decisions already taken and deliberately not done yet. Each item records **what**,
**why it was deferred**, and **the evidence that justifies doing it** — because an
item without its evidence gets re-argued from scratch, and a deferral that lives
only in a chat log gets lost.

Tracked in git on purpose (see the negation in `.gitignore`). "Remembered by
whoever was in the session" is the pattern that has already cost this project
twice: the verification baselines existed only in one agent's history until
2026-09-18, and the retrieval plan sat outside version control for three
dispatches.

Opened 2026-09-18, on `feature/board-retrieval`, after Commit 2
(`d5aaf12` — the search functions and the toggle) and its corrections.

---

## 1. Title weights — `setweight` A/B

**What.** Index posts as
`setweight(to_tsvector('simple', title), 'A') || setweight(to_tsvector('simple', body), 'B')`
instead of `to_tsvector('simple', title || ' ' || body)`, and let `ts_rank` see
the weights.

**The evidence.** The current index concatenates title and body into ONE
unweighted vector. The migration comment says "the title leads, as it does in the
resolver" — it leads in *string order*, which contributes nothing to rank.
Every lexeme is weighted identically, so a post whose **title** is exactly the
user's question ranks no higher than one that mentions the words in passing
halfway down its body. The title is the most deliberate text a user writes on a
post, and it is currently worth the same as an aside.

**Why deferred.** It changes the INDEX EXPRESSION, so it needs a rebuild of
`padlets_search_gin`. That rebuild is already owed to language detection, and
`CREATE INDEX` holds a lock that blocks writes for its duration. Paying that cost
once, for all three changes together, is the entire reason these are batched.

**Goes with:** the index rebuild — alongside R2's type widening (which needs a
fixture) and `E'<br\\s*/?>'` (removes a dependency on
`standard_conforming_strings`), plus the double evaluation of the projection in
the padlets index expression.

---

## 2. Neighbour expansion for passages — `chunk_index ± 1`, not a higher K

**What.** When a chunk matches, return it together with its immediate
neighbours as one passage, rather than returning more isolated chunks.

**The evidence.** The observed **median chunk on this corpus is 56 characters**.
With `BOARD_AI_SEARCH_LIMIT_PER_SOURCE = 4`, the PDF source contributes roughly
**224 characters against a 14,000-character budget** — about 1.6% of the room
available, for the source the whole feature was built to reach.

**Why NOT simply raising K.** Ten chunks of 56 characters is 560 characters of
disconnected fragments, not a passage. A fragment that small rarely contains a
complete sentence, let alone enough context for a model to ground an answer or
for a reader to recognise the source. **More slots holding fragments is still
fragments.** Raising K also multiplies citation targets while making each one
less meaningful.

**Why deferred.** It is a shape change to the SQL (a window or lateral join over
`chunk_index`), and it should be decided by what the first live run actually
shows rather than pre-emptively. It is also entangled with item 4: if the chunks
are small because the CHUNKER fragments text, expansion is a workaround for a
defect rather than a feature.

**EXPANSION IS ONLY AS GOOD AS THE NEIGHBOURS, and on this corpus they are thin
too.** The page-4 Iran hit is 158 characters and the chunks around it are the
same order of size, so `± 1` here buys a few hundred characters rather than a
paragraph. That is precisely why item 4's instrument is **one prose-heavy real
document** and not this slideshow: measuring expansion against a corpus that has
no long chunks anywhere cannot tell you whether expansion works.

**The prediction on record, to be tested by the first live run:** if the PDF
source contributes roughly 224 characters and the answer reads as though nothing
was found, the honest conclusion is **not** that K is wrong — it is that
56-character chunks are not passages.

---

## 3. Per-passage citations for search results

**What.** Give each search passage its own citation target, so a reader can click
through to the post or page an answer leaned on.

**The evidence.** `citationItemFromBlock` currently returns `null` for a
`board-search` block. Attachments are all clickable; search results are not. That
is a **grounding regression against attachments**: the feature that reaches the
most sources is the one whose sources cannot be opened, so a user has no way to
check a claim except to search the board themselves — which is what they asked
the product to do.

**Why deferred, and the real obstacle.** A search contributes ONE context block
holding several passages, deliberately: six matches must not evict two of the
user's four attachment slots. Per-passage citations need per-passage identity in
the citation envelope, which collides with that slot rule. Resolving it means
either decoupling citation identity from context blocks, or giving search a
separate envelope of its own. Both are real design work, not a patch.

**Interim behaviour, which is honest but weaker:** each passage carries an origin
line inside the block (`[board post: <title>]`, `[PDF text: <file> — page N]`),
so the model can name a source in prose. The user just cannot click it.

---

## 4. The chunk-size question — and its instrument

**What.** Determine whether 56-character median chunks are a **chunker defect**
or a **corpus artefact**.

**The evidence that this is unresolved.** Both explanations fit what has been
observed, and they call for opposite responses:

- *"The chunker fragments text"* — a defect. Fixing it improves every
  retrieval path at once, including the embedding search, and item 2 becomes
  unnecessary.
- *"These documents hold little text per page"* — not a defect. The sample is
  a slide-deck export, where a page genuinely may hold one headline. Then item 2
  is the right answer and the chunker is fine.

**Only one of these is a bug, and no measurement so far distinguishes them.**

**The instrument.** Take ONE prose-heavy real document — continuous paragraphs,
not slides — put it through the existing ingestion path, and inspect the chunk
length distribution: median, p10, p90, and the count under 100 characters.

- If a prose document ALSO chunks to a ~56-character median, the chunker
  fragments text and that is the defect to fix.
- If it chunks to a normal size (hundreds to low thousands), the chunker is
  correct and the 56 is the slide deck telling the truth about itself.

Run this **before** committing to item 2, because the answer decides whether
item 2 is a feature or a workaround.

---

## 5. `p_min_rank` — the tuning lever, deferred until there is data to set it

**What.** A minimum-rank parameter on both search functions, mirroring the vector
RPC's `p_min_similarity` exactly: an optional argument, `NULL` by default,
applied before `LIMIT`.

**Why it looked necessary.** The live run of 2026-09-18 assembled 3,018
characters of context for the Iran question, of which roughly 212 answered it —
about 7% signal. A rank floor is the obvious way to cut the rest.

**THE ARITHMETIC THAT DEFERS IT.** The ranks in that result were:

| passage | rank |
|---|---|
| page 4 — the Iran headline (relevant) | **0.00253** |
| Chess Opening Theory ×2 (noise) | 0.00205 |
| chain lubricant (noise) | 0.00188 |

The noise sits at **76–81% of the top hit**. A floor tight enough to separate
them is a floor tight enough to start discarding legitimate SECOND and THIRD
matches on any query where the best answer is spread over several passages —
which is the normal case, not the exception. With no corpus of real queries to
tune against, any threshold chosen now would be fitted to one question.

**What was done instead**, and why it was the better first move: the noise here
came from the QUERY, not the ranking. `board` matched a chess board and `oil`
matched chain oil, so the context stopword list
(`BOARD_SEARCH_CONTEXT_STOPWORDS`) removes the generic terms at source. That is
free, it is explainable to a user — the chip shows the terms actually searched —
and it does not risk dropping real matches.

**When to build it.** When there are real queries to measure: a set of questions
with known-correct answers, ranked, so a threshold can be chosen from the
distribution rather than from one example. Mirror `p_min_similarity` —
`NULL`-defaulted, so shipping the parameter changes nothing until a caller passes
it, and the migration can land ahead of the decision.

**Note that a NULL-default parameter costs a migration and changes no behaviour,**
which is exactly why it is not worth landing speculatively: it would look like
progress while deciding nothing.

---

## 6. The search timeout stops us waiting, it does not stop the query

**What.** `BOARD_AI_SEARCH_TIMEOUT_MS = 3_000` bounds how long the chat waits for
the two search RPCs. It does **not** cancel them. PostgREST offers no
cancellation handle for a call made this way, so when the bound fires the
statement may still be running on the database to completion.

**Why it is written down rather than left implied.** "Timeout" normally means the
work stopped. Here it means we stopped listening. Anyone reasoning about database
load from this constant will get the wrong answer: a board that times out
repeatedly is still paying for every one of those queries, and a slow query that
is retried is two queries, not one.

**Why it is acceptable today.** The searches are bounded reads — two GIN probes
on one board, each capped at ten rows — so an abandoned one finishes on its own
shortly after. The cost is real but small, and it is strictly better than the
alternative the bound replaced, which was an unbounded wait ahead of a generation
timer that had not started.

**When it stops being acceptable, and what to do then.** If the indexes are ever
NOT used — which no test can prove, since it needs `EXPLAIN` against real rows —
an abandoned search becomes a sequential scan over `padlets` and
`knowledge_chunks` running a regex chain per row, with nobody waiting for the
result. At that point the fix is a server-side bound the database enforces:
`SET LOCAL statement_timeout` inside the functions, or a wrapper that sets it.
That is a real cancellation and it makes the constant mean what it appears to
mean.

**The signal to watch for:** search latency near the 3-second bound in normal use,
or database CPU that does not fall when chat traffic does.
