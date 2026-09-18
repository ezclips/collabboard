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

**~~Why deferred.~~ THE PREMISE WAS WRONG, and this is the correction.** It was
deferred because it "changes the INDEX EXPRESSION, so it needs a rebuild". **It
does not have to.** Matching and ranking need not use the same vector: `@@` runs
against the indexed, unweighted vector, and `ts_rank` can be handed a different,
`setweight`-ed vector built on the fly for the handful of rows that already
matched. Both hold the same lexemes, so nothing matchable becomes unrankable, and
the weighted vector is built for at most ten rows per search.

So **title weights are a function-body change with no rebuild**, and they were
taken OUT of the rebuild batch rather than shipped inside it. The same argument
applies with more force to the chunk side: `original_filename` lives on
`knowledge_documents`, and an index expression may only reference its own table,
so a document-title weight could **never** have been indexed at all.

**Why still deferred, on the honest reason:** it has been measured on **one
question**. The 6× separation on q02 is the same instrument failure this document
keeps recording — a rule promoted on the question it was found on, which is the
question it cannot fail.

**What unblocks it:** `scripts/db/boardSearchTitleWeightVariants.sql`, which
scores it across all eleven questions **against the expressions `20260918160000`
actually ships** — three configurations, `GREATEST` of the three, posts flag 0
and chunks flag 1. Scoring it against the old single-`simple` expression would
measure a vector that no longer exists.

**When reading that run:** on the POSTS side a reordering cannot drop anything
(item 7), so the bar is passed vacuously there; on the CHUNKS side the per-source
limit does bite, so chunk reordering is real evidence. Weigh the halves
differently.

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

**The prediction on record, and WHAT THE FIRST LIVE RUN ACTUALLY SHOWED.** The
prediction was: the PDF source contributes roughly 224 characters, the answer
reads as though nothing was found, and the conclusion is segmentation rather
than K.

**The top-passage figure was exact and the rest was wrong.** q01 returned
**2,272 characters** from the PDF source, not ~224. One of them was the answer
(the 158-character page-4 passage); the rest were a 525-character lubricant
passage twice and a 1,064-character drivetrain intro. The answer did not read as
empty — it was substantive and correct.

**The 56-character median never appeared in the results at all.** Nothing
returned by any battery query was near it. The median is dominated by synthetic
probe documents (`PAGE 1 ALPHA`, `CACHE PROBE PAGE ONE` and similar) that no real
question retrieves. So the corpus statistic that motivated this item does not
describe the passages the feature actually returns.

That does not retire the item — a 158-character answer is still thin, and q09's
correct answer is 75 characters — but it does retire the reasoning. **Re-derive
the median over passages that real queries return**, not over all chunks, before
sizing any expansion.

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

**THE BATTERY WAS BUILT AND THE ANSWER IS NO** — see
`scripts/db/boardSearchTuningBattery.ts` and its ratings file. Eleven questions
through the real query builder, 36 passages rated by hand. No rank floor
separates signal from noise without dropping a human-judged relevant passage:

| floor | relevant text lost | characters kept |
|---|---|---|
| relative 0.3 of top-per-source | none | 93% — buys almost nothing |
| relative 0.4 | 1 (q08) | 91% |
| relative 0.5 and above | 4 | 78% and below |
| absolute 0.002 / 0.003 / 0.005 | 1 / 2 / 7 | 71% / 55% / 41% |

0.3 is one step from 0.4, which loses q08. **It is a tuned constant wearing a
relative name**, and the 7% it buys is not worth pretending otherwise.

**Why no floor can work here: the ranking is INVERTED on real questions.** For
"How do I knit a ribbed pattern?" the relevant passage ranks **0.00315** and the
irrelevant document intro ranks **0.00965** — the wrong passage outranks the
right one by 3×. For "How do I remove the bumper… to change the horn?" a
title-only post ranks 0.00784 while the three passages that actually answer rank
0.00134–0.00337. A floor is defined relative to the top hit, so when the top hit
is the wrong passage the floor protects the noise and cuts the answer.

**The lever that DOES work is not a floor and not a constant:** dropping
duplicate passage text removes 29% of retrieved characters and loses nothing,
because this board carries identical text in more than one document. **Shipped.**
It is structural, corpus-independent, and needs no tuning.

### What the four inversions are actually caused by — measured, and it is neither of our first guesses

Diagnosed with `--diagnose`, which records coverage, term frequency and ranked
length per passage. Three attributions are now evidence rather than hypothesis:

- **q08 is NOT a ranking defect.** The query says `ribbed`; the answering
  paragraph says **"Ribbing"**. `simple` does no stemming, so they never match —
  the paragraph matches only `knit`, once, while the introduction genuinely
  contains all three query terms five times. **The ranking is correct given what
  matched.** No normalization flag, no weighting and no coverage rule can fix
  this pair. It belongs to the language/stemming item. **Confirmed in the
  database on the exact pair:** the answering chunk does not match `ribbed` under
  `simple` and does under `english`; the intro matches under both.
- **q08 and q05 are chunk-vs-chunk, so item 1 cannot touch them.** The chunk rank
  is `ts_rank(to_tsvector('simple', c.text), q.query, 1)` — `c.text` alone, no
  filename, no title. An earlier attribution of the inversion to post title
  weights was wrong. (And q05 is not inverted at all: its answer outranks the
  intro, 0.006487 vs 0.006154.)
- **q02 is LENGTH NORMALIZATION, not coverage.** Two of its three answering
  passages match exactly as many distinct terms, exactly as often, as the
  title-only post that beats them — coverage 2, occurrences 2 for both. What
  differs is length: 29 ranked characters against 380. Flag 1 divides by
  `1 + log(length)`, so the short document wins. **Coverage-first ordering was
  scored against the same 36 ratings and fixes 0 of 4 inverted pairs.**
- **Title weighting would make q02 worse.** The title-only post's only signal is
  its title, so `setweight` A/B raises the passage that is already wrongly on
  top. Item 1 stays valid for posts in general; it is not the fix for this.

**The open tension, and how it was closed.** Flag 1 was adopted because flag 0 let
long chunks win by being long — live-proven. The same normalization is what
rewarded a 29-character title-only post in q02. **No single flag serves both**,
and `scripts/db/boardSearchRankingVariants.sql` was run against the real database
to establish it rather than argue it:

| variant | q02 title-only | post 341 | post 406 | chunk p6 | noise chunk |
|---|---|---|---|---|---|
| n1 (shipped) | 0.0078393 | 0.0033648 | 0.0033526 | 0.0013907 | 0.0013855 |
| n0 | 0.0202642 | 0.0202642 | 0.0202642 | 0.0101321 | 0.0101321 |
| n2 | 0.0040529 | 0.0003166 | 0.0003118 | 0.0000654 | 0.0000641 |
| `ts_rank_cd` | 0.111622 | 0.0479112 | 0.0477366 | 0.0198025 | 0.0197281 |
| `setweight` A/B | 0.0783928 | 0.0336483 | 0.0335257 | 0.0331706 | 0.0055352 |

**The resolution is a SPLIT, shipped as `20260918150000`.** Posts move to flag 0,
chunks stay on flag 1. Legitimate because the two ranks are never compared —
`mergeBoardAiSearchPassages` takes top-K per source precisely because they are
different scales — so the corpus-length argument that justified flag 1 was never
operative for posts in the first place.

- **n0 is the only column that fixes q02**, and it fixes it by making the three
  posts rank *identically* (0.0202642 three ways) on genuinely identical evidence
   — same two terms, twice each. A tie is not an order, so the migration adds one
  tie-break: **at equal rank, a post with a body beats a post without one.** That
  states the preference where it can be argued with, instead of letting a
  logarithm imply the opposite.
- **n0 is unsafe for chunks**: it ties the answering page-6 chunk to a
  bicycle-maintenance chunk with nothing to do with the question, both 0.0101321.
- **n2 makes q02 worse** (12.8× instead of 2.33×); **`ts_rank_cd` and `setweight`
  A/B leave it at 2.33×**, i.e. unfixed.
- **q03 survives**, which was the constraint on any fix: its title-only post
  matches 3 of 3 terms and wins on rank outright under flag 0 (0.0607927 against
  a tie at 0.0202642), so the tie-break never fires on it.

**`setweight` A/B is the one unused column with a signal, and it is not for q02.**
On the chunk side it separates the answering Audi page-6 chunk from
unrelated-document noise by **6×** (0.0331706 vs 0.0055352) where flag 1 manages
0.4%. That goes to the stemming round for full-battery scoring, not here.

**What the ratings could NOT decide, stated because it matters more than the
table.** The bar is "never drop a human-judged relevant passage", and a ranking
change can only drop something by pushing it past the per-source limit or past
the character budget. **Neither happens anywhere in this battery**: only q02, q03
and q10 return any post at all, and they return three, one and three — every one
below the per-source limit of four.

**The corpus is not the small thing; the questions are.** The board holds **nine**
`text`/`note` posts. The eleven questions surface **four** distinct ones between
them, so five posts are never returned by anything and no question ever forces a
choice. The posts flag change therefore **passes the bar vacuously** — not
endorsed by the ratings, merely not contradicted. The argument for it is the
mechanism above; the argument against it is item 7.

The three pairs are named gate assertions in
`scripts/db/boardSearchRankingPairs.test.ts`. q02's is now **flipped** — it
carries both measurements, the flag-1 defect and the flag-0 fix, with the
tie-break as the stated mechanism between them. q08's still asserts the defect,
and must until the language work lands: the variants run confirmed that every one
of the five expressions keeps the intro ahead, the best of them still at 1.86×.

**THE LIMIT OF THE BATTERY, which governs how much any of this is worth.** THE
QUESTIONS ARE OURS, NOT USERS'. They were written by people who already knew what
was on the board, so they are unrepresentatively well-aimed: the battery's
baseline signal is **36.8%**, against the **7.0%** measured live on the one
question that also appears in it. That gap is the measure of our own bias. It is
why the bar is **"never drops a relevant passage"** rather than "best average" —
an average optimised against questions we wrote would be fitted to our own
phrasing, whereas a rule that drops a relevant passage even on a question we
aimed ourselves is disqualified on evidence that our bias only makes stronger.

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

---

## 7. The questions never exercise the posts limit — the instrument that would judge flag 0

**What.** `20260918150000` moved `search_board_posts_text` to `ts_rank`
normalization flag 0 on the strength of one question, q02, whose evidence is a
three-way tie. The tuning battery cannot judge that change, and this item exists
so nobody later mistakes "the battery was green" for "the flag was validated".

**Why the battery cannot judge it.** Only three questions return a post at all
(q02: 3, q03: 1, q10: 3), and every one of those counts is **below the per-source
limit of four**. A ranking change can only lose a passage by pushing it past that
limit or past the character budget, and neither is ever reached — so no post
ordering, however wrong, can fail the bar. The change passes vacuously.

**And the corpus is not what is small — the questions are.** The board holds
**nine** `text`/`note` posts; the eleven questions surface **four** distinct ones
between them. Five posts are never returned by anything. Counted 2026-09-18,
after an earlier version of this item wrongly said the board held four — the
board was always big enough to exercise the limit, and the questions never ask it
to. That is a sharper problem than a thin corpus, because adding documents would
not fix it.

**The specific risk flag 0 carries, which flag 1 did not.** Flag 0 ignores
document length, so rank accumulates with every extra occurrence. A long rambling
post that mentions one query term eight times will outrank a short exact answer
that mentions it once. **No post the battery returns does that**, which is why
this is an open risk rather than a ruled-out one. It is the mirror image of the defect
that was fixed, and the revert is ready:
`20260918150000_board_search_posts_rank_evidence_rollback.sql`, whose header says
when running it is the right call.

**What would settle it.** Questions — and where necessary posts — that reach, at
minimum: one long post repeating a query term several times beside a short exact
answer; **more matching posts than the per-source limit, so the limit is actually
exercised**; and a title-only post competing with a body post at *unequal*
coverage in both directions. The first job is to write questions that reach the
five posts nothing currently returns; only then is it clear whether new posts are
needed at all. That is question-writing plus possibly corpus-building, not a code
change, and it is the same kind of instrument item 4 wants for chunk size.

**The signal to watch for before it is built:** a user reporting that board search
surfaces a long post they did not want ahead of the short one that answered them.
That is this item, and it is a revert away.

---

## 8. The `8ebbe969` diagnosis — the gate the reader was built through

**What the gate was.** Plan rev. 4 made one thing a precondition on the whole
reader: diagnose thread `8ebbe969`, a whole-PDF attachment that answered *"Board
AI could not answer. Your message was saved."* on the managed default. The plan's
words: the diagnosis comes **"before any reader is built"**, and its outcome is
**"a reader parameter, not a document quirk"**.

**Why it was a gate, which is the part worth keeping.** If the failure was our own
`BOARD_AI_CHAT_TIMEOUT_MS = 20_000` aborting generation, then **passage count is
bounded by latency, not by characters** — more input means a slower first byte, so
search makes generation slower on every turn it fires. Neither
`BOARD_AI_CONTEXT_MAX_SINGLE_CHARS` nor the four-slot rule expresses that. The
plan's conclusion was that the ceiling or the default passage count had to move
*before* anything was built on it.

**What actually happened: the reader was built and `K = 4` was set without it.**
`BOARD_AI_SEARCH_LIMIT_PER_SOURCE = 4` is today **a character-budget decision** —
it was chosen against the 14,000-character total and the four-slot rule, and
latency was not an input to it. That is stated here so it can be checked rather
than assumed.

**The source record is gone.** `8ebbe969` matches nothing anywhere in this
repository — no test, no doc, no comment. The thread id came from a chat session
and the investigation was never written down. **Do not go looking for it**; that
is the cost of the gap, not a task.

**What the live runs have shown since — and this is INFERENCE, not the
diagnosis.** Search is bounded separately at `BOARD_AI_SEARCH_TIMEOUT_MS = 3_000`
and does not consume the generation clock. q04 completed end to end in **4.5s**.
q01 and q02 assembled **2,272** and **~3,800** characters of context and returned
substantive answers. **No 20-second abort has been observed on any searched
turn.** That is evidence *against* the coupling the plan feared. It is not the
diagnosis the plan asked for: none of those turns was loaded to the worst case,
and none of them is `8ebbe969`.

**The cheap confirm that closes this item.** ONE searched turn loaded to the worst
case — a question that fills the passage budget on **both** sources — timed end to
end, with the elapsed time and the assembled character count recorded here. That
answers the question the gate actually existed to answer: **does passage volume
couple to generation latency?** It is one live call, not an investigation.

**What a pass there does and does not prove.** The confirm is bounded by what
this board can return — K slots from each source, roughly **4–5k characters
against a 14,000 ceiling** — so a green result shows that count-coupling does not
bite at the **reachable** maximum, not at the budget's theoretical one. A board
with longer passages could still reach 14,000 and behave differently. Record the
character count alongside the timing so the next reader can see which maximum was
actually tested.

- If it does not couple: `K = 4` stays a character-budget decision, and this item
  closes with the number written down.
- If it does couple: `K` becomes a **latency-driven** decision, and the ceiling or
  the default passage count moves — which is exactly what the plan said, one unit
  later than it said it.

**Triggers to revisit:** the first 20-second abort on a searched turn, or any
change to `K` or to the context budgets. Either one invalidates the reasoning
above and the confirm has to be re-run.

---

## 9. Discoverability — decided, with a review trigger

**Not an open question.** It was left open by plan rev. 4 and is being closed here
deliberately, because "open" is how a question becomes memory-only and then
becomes nobody's.

**The decision, for this branch:** board search stays **off by default**,
**board-scoped**, with **the toggle as the only discovery surface**. No in-product
prompting, no nudge, no empty-state suggestion, no model-driven invocation.

**The rationale, stated so it can be argued with.** A conservative default
protects cost and noise on a feature that spends a database round trip and up to
four passages of budget on every turn it fires. And **discovery is a launch
decision, not a retrieval one** — it belongs with whoever decides how the feature
is introduced, not with the people tuning `ts_rank`. Shipping a nudge from this
branch would settle a product question by accident.

**What the plan feared, recorded because it is the thing to watch for:** off by
default, board-scoped, one slot of four, no model-driven invocation — *"a user
must know it exists to ever benefit… may go unused and be misread as unwanted."*
**Zero adoption is ambiguous evidence**: it looks identical to rejection, and it
will be read as rejection unless this item is here to say otherwise.

**The review trigger.** If adoption is near zero after real traffic on the first
cohort, add a discovery surface before concluding anything about demand. The
options, so the decision starts from a list rather than from scratch:

- an **empty-state nudge** in the chat drawer when a board has posts or PDFs the
  user has not attached — cheapest, and it fires exactly when search would help;
- a **one-time prompt** on first use of the drawer on a board with knowledge;
- **on by default** for boards above some content threshold — the strongest
  option and the one that spends budget without being asked, so it needs the
  latency answer from item 8 first;
- **model-driven invocation** (Stage B, tool calling) — a different feature, not
  a discovery surface, and deferred for its own reasons.

**What would make the trigger fire wrongly:** adoption measured on a cohort whose
boards hold nothing worth searching. Check that the boards in the sample actually
have posts or PDFs before reading a zero as a verdict.

---

## 10. Design C is shipped — what it bought, what it did not, and what is now owed

**Shipped as `20260918160000_board_search_language_vectors.sql`.** Every
searchable row is indexed under `simple`, `english` **and** `german`; a query is
parsed under all three and matched against all three; rank is the `GREATEST` of
the three.

**The property that decided it:** `simple` is retained unchanged, so **no match
that exists today can disappear**. `simple` stems nothing and drops nothing, so
the two new vectors can only add rows. That is what makes the acceptance criteria
all of the form *strictly more* rather than *differently*.

### The probe, which is the evidence the design rests on

| token | `simple` | `english` | `german` |
|---|---|---|---|
| `Stoßstange` | stoßstange | stoßstang | **stossstang** |
| `löse` / `lösen` | löse / lösen | löse / lösen | **los / los** |
| `knitting` / `ribbed` / `Ribbing` | as-is | **knit / rib / rib** | as-is |
| `will` | will | ∅ | ∅ |

q10's answering chunk goes **0.00778 → 0.01413** under `german` at flag 1, and
its lead over the next passage widens **1.10× → 1.29×**. The ß→ss fold also means
`Stossstange` and `Stoßstange` land on the same rows — unavailable under any
single configuration.

### Two claims that were wrong, corrected before anything was built on them

**The `will` collision is NOT recovered.** An earlier draft claimed design C would
fix it. `to_tsvector('german', 'will')` is **empty** — the German dictionary
carries `will` in its own stopword list, as it does `wollen`. Only the `simple`
vector holds the lexeme, and the application drops the term before any
configuration sees it. **`will` stays lost, exactly as documented.** If it is ever
wanted, the fix is a query-side policy — retain the term for the `simple` query
alone — and not a vector. The six-word set (`am, an, in, so, was, will`) is
restated here so it is not rediscovered a third time.

**q08 does not flip, and no design flips it.** Under `english` the answering
paragraph finally **matches** — `ribbed` and `Ribbing` both stem to `rib` — and
the gap narrows **3.07× → 1.35×**. The introduction still leads. Coverage favours
the introduction under `english` too (the query's three terms stem to two, which
the intro also has), so no lexical rule separates them. What is left is the
ranking-versus-semantics problem the flag family already failed to solve. **The
achievement is that the answer's vocabulary now enters the query at all; the
ordering remains inverted, and its tripwire still asserts the defect** — now with
the 1.35× ratio recorded beside it.

### Design B, rejected on measurement — and the theory against it was also wrong

The objection offered was that a word all three configurations agree on appears
three times and inflates rank ~3×. Merged/simple ratios came back **mixed**:
answer 1.26×, intro 0.94×, lubricant 0.85×, slideshow 0.79×, title-only post
0.91×. Normalization by query-term count and by length swamps the occurrence
tripling, in both directions. **B does not inflate rank uniformly; it perturbs it
unpredictably** — a worse property, and the actual reason it lost. Recorded
because a rejection that keeps a false reason gets re-argued from the false
reason.

### R2's widening, with the fixture that changed the answer

Surveyed live across 1,000 rows against R2's criterion — *prose in `content`*:

- **`card` PASSES** and is added. TipTap HTML prose, the same shape as `text` and
  `note`.
- **`comment` FAILS, and this is the finding.** It looks like the strongest
  candidate — 42 of 44 rows are HTML — but `content` holds a rendered **summary**
  of a thread that lives elsewhere, truncation markers included:
  `"<p>one bug left</p>..." (+2 more)`. Indexing it would index truncated text
  plus the literal token `more`. **It confirms R3's ceiling with evidence rather
  than by assertion: the conversation really is not in `padlets.content`.**
- `column`, `image`, `link`, `todo`, `table`, `drawing`, `container`, `date`,
  `file` all fail — placeholder scaffolding, inconsistent substance, URLs, or
  structured JSON.

### What is now owed

1. **`GREATEST()` across three configurations is a scale mix** and is not yet
   scored. The passage *set* should be unchanged (because `simple` is retained),
   so what moves is **ordering** — which is exactly what the battery measures.
   Re-run it after the migration is applied.
2. **Title weights**, scored on the shipping expressions — item 1.
3. **Write amplification is the standing cost.** Three GIN indexes maintained on
   every post edit and every ingestion instead of one. The build itself is
   trivial at this size (2,126 padlets, 86 chunks); the write path is the price,
   and the rollback header says how to buy back half of it by keeping only the
   `german` pair.

---

## 11. What design C actually cost, measured — and the rule it forced

**The battery, before and after C**, with all ten additions rated:

| | before C | after C |
|---|---|---|
| characters retrieved | 22,008 | **27,150** (+23%) |
| signal | 36.8% | **33.1%** |

**C added 5,142 characters and lowered signal.** Of the ten passages it added
across six questions, **nine are irrelevant**.

### The additions, rated

| question | addition | verdict |
|---|---|---|
| q02 | knitting chunk 0 | irrelevant — `bumper` → de `bump` matches "a horizontal bump" |
| q03 | TENS chunks 1, 0 | irrelevant — `note` → de `not` matches every English "not" |
| q06 | TENS chunk 0 | irrelevant — `fix` → "5 **fixed** stimulation gears" |
| q07 | TENS chunk 1 | **RELEVANT** — `stimulator` → "stimulators"; states what the device is for |
| q09 | Audi post 341, Audi chunk 0 | irrelevant — `linked` → en `link`, German "links" (= left) → de `link` |
| q10 | Audi chunks 3, 2 | irrelevant — genuine German stemming, but neither passage covers the Spreizniete |
| q11 | TENS chunk 1 | irrelevant — `year` → "In recent **years**" |

**Five of the nine are cross-language collisions** — the German stemmer treating
an English `-er` as a German suffix, or an English stem colliding with a German
word. This is the structural cost of running two stemmers over a corpus that is
not reliably in either language, and it is not a tuning parameter.

**The most serious single result is q06.** It is the CONTROL question — nothing
on this board is about roofs or garden sheds — and its whole purpose is to return
nothing. It no longer does, because `fix` stems to match "fixed stimulation
gears". A control that no longer controls is worse than a missing test.

### The one genuine gain

q07's page-2 chunk, surfaced because `english` stems `stimulator` and
`stimulators` together. It does state what the device is for. **That is the
recall design C was built for**, and it is one passage out of ten.

### The rank rule this forced — `20260918170000`

C was adopted on "strictly more, never differently". **`GREATEST` voided the
second half**: it let a configuration re-rank a row it did not add. That cost a
rated inversion on q05 — see the tripwire, which now names it as a fourth pair
and the only one **we caused**.

The rule is now: **a row that matches under `simple` is ranked by `simple`; only
rows admitted solely by `english`/`german` are ranked by the better of those
two.** Function-body change, no index work.

**What it does not fix.** A solely-added row still enters at its own scale.
q09's Audi post — admitted only by the `linked`/"links" collision, rated
irrelevant — is still the top of its block at 0.018998.

### The correction to C's own words

"Retention prevents losses, **not additions**." `simple` being retained
guarantees nothing disappears; it never implied the sets would stay the same
size. They were always going to grow, and the growth is where the harm landed.
That sentence was wrong in the design text and is corrected here.

### Open, in order

1. **Should the two stemming vectors be constrained at all**, rather than merely
   re-ordered? With 9 of 10 additions irrelevant, the honest question is not
   where to sort them but whether to admit them. Options not yet scored: require
   a solely-added row to match **two** query terms; restrict `german` to rows
   with a non-ASCII character; drop `english` stemming for terms under 5
   characters (`fix`, `note`, `year` are all short).
2. **Sort solely-added rows below every `simple`-matched row** — strictly a tail.
   Bigger claim than 170000, needs scoring, would fix q09.
3. **Title weights: not adopted.** No adoption signal across eleven questions;
   orders preserved on q01/q03/q04/q07/q09/q11, q02's post tie still decided by
   the tie-break, and it fixes none of the known inversions (q08 stays 1.35×,
   q05 1.16×). q02's "6×" is amplification of an order that was **already
   correct**. And it introduces a candidate harm: on q10 it lifts chunk 2 above
   the rated answer chunk 1 (0.0838 against 0.0776). **Chunk 2 is now rated
   irrelevant**, so that is a real inversion, not a reordering among equals. The
   mechanism is structural — a fixed-size title boost is a larger share of a
   short chunk's vector — so expect it to recur. Do not adopt.
4. **The title-weight numbers need one re-run** against `20260918170000`'s rank
   expression. The comparison above was internally valid, but only for the
   expression that shipped in `20260918160000`.

---

## 12. The additive rank drops a rated-relevant passage — and the instrument that found it

**`20260918170000` is disqualified by this project's own bar.** It drops q07's
rated-relevant TENS page 2 out of the returned set.

### The mechanism, confirmed on the text

The passage contains **"a single pulse"** and **"stimulators"**.

| configuration | terms matched of `single \| channel \| tens \| stimulator \| module` |
|---|---|
| `simple` | 1 — `single` only |
| `english` | 2 — `single`, plus `stimulator` stemmed together with "stimulators" |

Under `GREATEST` it was ranked by `english` and entered the top-K. Under the
additive rank it is ranked by `simple` **because `simple` matched at all**, at
one weak term, and falls below the two bicycle-lubricant chunks at 0.001878.

**So the additive rule's premise is too coarse.** "A row that matches `simple` is
ranked by `simple`" is right about not letting a configuration *inflate* a row it
did not add — and wrong in that it also **discards genuine extra evidence within
a row**. q07's page really does match two query terms; only `english` can see the
second one.

### Why no rule table caught it

**Every rule is scored over the passages the search RETURNED.** A change that
stops returning a passage is invisible: the row is not there to be dropped, so
every rule still reports "drops relevant: none". The table was clean and the
regression was real.

`--collect` made this worse than blind — it was **destructive**. It rebuilt the
ratings file from the current result set, so a passage pushed out of the top-K
had its human rating silently deleted. It cost two real ratings (q10 pages 5 and
6, recovered from git), and it meant **a rule that dropped a relevant passage
would erase the evidence that disqualified it**. Fixed: ratings are now
permanent, and passages that stop being returned are reported as carried.

**New instrument: "Recall against the rating corpus"**, printed above the rule
table. The ratings file is the only record of what the search has ever returned,
so it is the only thing a regression can be measured against.

### The taxonomy this corrects

The ten "additions" were not one kind of thing:

- **Solely-added rows** — matched only by `english`/`german`. All nine irrelevant
  ones are here. An *admission* rule governs them.
- **Promoted rows** — already matched `simple`, lifted into the top-K by a better
  rank elsewhere. **q07's gain is the only one, and it is the only relevant one.**
  A *ranking* rule governs it.

So "the two-term rule keeps q07's gain" does not hold: q07's row is not
solely-added, no admission rule reaches it, and the additive rank has already
removed it. **The ranking question is upstream of the admission question.**

### What to decide, in order

1. **How should a row that matches `simple` weakly and `english` strongly be
   ranked?** Options: take the greatest **only when the better configuration
   matches strictly more terms** (which fixes q07 and still blocks q05, where the
   intro's boost came from the same term count); or rank by the configuration
   that matched the most terms, breaking ties toward `simple`. Neither is scored.
2. **Then** the admission rule — `scripts/db/boardSearchAdmissionVariants.sql`
   scores candidate (a), the two-term rule, with stemmed per-configuration term
   counts that cannot be computed outside the database. Its cost is stated in the
   file: it sacrifices single-term inflection recall, and it does not reach
   q10's two German additions, which are legitimate same-language matches that
   merely miss the question.
3. Candidates (b) non-ASCII gate and (c) minimum stem length are recorded as
   fallbacks with their known weaknesses — (b) keeps q09's post because "Möchte"
   is non-ASCII; (c) kills `year`/`years` to catch `fix`.

### Title weights — cleared, still unadopted

The q10 harm that killed them was an artifact of the max expression: under
additive, chunk 2 ranks in the `simple` branch and the answer stays first
(0.0419 against 0.0308). Across eleven questions there is now **no rated
inversion caused by weighting**, and several correct leads amplify (q02's page-6
chunk 1.003× → 6×).

**That clears the objection without creating a case.** The mechanism still
deserves the suspicion: a fixed-size title boost is a **length artifact** — its
relative effect grows as the passage shortens, and q10's weighted c2/c1 ratio
rose 0.46 → 0.74, under the threshold this time only. If it is ever pursued it
needs a same-document length probe first.
