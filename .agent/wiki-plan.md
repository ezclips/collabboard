# The compiled board wiki — plan for review

**Status: PLAN ONLY. No build is authorized by this document.** Each unit below
gets its own GO.

Opened 2026-09-19 on `feature/board-retrieval`, after followups items 8 and 15
closed. Written against locked premises rather than around them — they are
recorded in full in section 1 because a decision that lives only in a chat log
gets re-argued, which this repository has already paid for twice.

---

## 1. The locked premises, and their reasoning

These were decided before this plan was written. They are not re-opened here.

### P1. Lexical retrieval, now. The wiki does not wait for vectors.

Compilation reads the **included** set. q05 and q08 are **ordering** inversions
*within* that set, not inclusion failures: the minimal-evidence rank
(`20260918180000`) already guarantees the property compilation needs — no
rated-relevant passage leaves the top-K on the measured corpus. What reads the
set is an LLM writing a page, and it sees both the intro and the answer, exactly
as the chat model does today. That is why every live answer this week was
correct despite noise a rank floor would have cut.

Waiting would couple a product feature to an infrastructure project that is
allowed to fail its own measurement (P2). The mitigation is in the wiki's shape
instead: **the compiled input set is shown with the page** — that chain is the
mitigation, not decoration — and the user can correct the page, durably.

**Confirmed by the fidelity run (section 3):** the compiler used 3 of 6
passages and silently ignored the bicycle-maintenance and knitting passages that
term-matched the Audi query. Ranking noise did not reach the page.

### P2. The vectors result gates infrastructure only, never the wiki.

Predicted and falsified **before** its run; published either way. The prediction
is two-sided: vectors separate q05's intro from its answer and q08's intro from
its answer, scored on the same 36 ratings, with no rated-relevant passage lost.
A null stops the semantic-retrieval build — ANN index, worker deploy, post
embeddings — not as a verdict about vectors forever, but as a falsified premise.
It also closes the claim that vectors are the only lever that reaches those
pairs, so nobody re-funds the infrastructure on a dead premise later.

The wiki proceeds either way, so nothing about it is invisible until a bad
result arrives.

### P3. Edits win. Recompilation proposes; it never overwrites.

This is followups item 15's question one level up, and the same rule applies: the
human statement stands, the derivation is shown as stale or gone, and the machine
proposes. "Recompile wins" makes every edit a draft, and nobody invests in a
draft. "Merge" is a reconciliation system whose failure mode is silent corruption
of meaning — a third system, and the most expensive answer to a question that
already has a pattern here: **propose, then apply**, as the text actions and the
component editor already do.

The data model that follows: page content is a single authored version, edited
in place; the page records its source set plus the **compile-time version of each
source**; staleness and deletion are **derived by comparison**, never stored as
truth; and a deleted source gets the same gone treatment the citations just got.

---

## 2. Recon — what exists, verified

Every path below was read, not assumed.

### Reusable as-is

| What | Where | Why it matters |
|---|---|---|
| Citation item shape | [boardAiChatCitation.ts:122](lib/domain/ai/boardAiChatCitation.ts#L122) | `{type, knowledgeDocumentId?, pageNumber?, padletId?, charStart?, charEnd?, label}` — already covers both source kinds a wiki compiles from. **This is the sources chain**, not a new type. |
| Identity key / de-dup | [boardAiChatCitation.ts:143](lib/domain/ai/boardAiChatCitation.ts#L143) | "the same source cited twice is one source" is already solved. |
| Sub-token grammar | `BOARD_AI_CITATION_TOKEN_PATTERN` | `^S([1-9][0-9]*)(?:\.([1-9][0-9]*))?$` — a model names an opaque position and the server maps it back. The compiler reuses this unchanged; it is what stops a model writing identity. |
| Real retrieval | [boardAiChatSearch.ts:156](lib/server/ai/boardAiChatSearch.ts#L156) | `searchBoardAiContext(client, reader, boardId, userId, message, availableChars, coverage, blockIndex)` — authorizes through the caller's own client **before** the privileged reader. Compilation reuses it whole. |
| Board read ACL | [knowledgeBoardReadAuthorization.ts:29](lib/server/knowledge/knowledgeBoardReadAuthorization.ts#L29) | owner, else `is_board_member` RPC. One helper, already the chat path's. |
| Board write ACL | `SupabaseKnowledgeBoardAuthorizer.canMutateBoard` in [knowledgeIngestionAdapters.ts:79](lib/infra/knowledge/knowledgeIngestionAdapters.ts#L79) | owner, or collaborator whose role is exactly `editor`. The edit surface's gate. |
| Role resolution | [aiRoles.ts](lib/ai/aiRoles.ts), `resolveAIModelForRole` | Four roles exist: `source-ai`, `edit`, `board-chat`, `component`. **Compilation resolves an existing role — no new role, no hardcoded model.** |
| Provenance signing | `boardAiProvenanceProof.ts` | HMAC over canonical fields. The pattern for "a derived record a user can also write". |
| Gone-state precedent | followups item 15, shipped `48ef467` | A deleted source shows as gone rather than vanishing or erroring. |

### Explicitly NOT reusable, and this is the sharpest recon finding

**`source_references` cannot carry a wiki page's sources.** Two independent
blockers, both at the schema level
([20260820_create_knowledge_data_foundation.sql:76](supabase/migrations/20260820_create_knowledge_data_foundation.sql#L76)):

```sql
target_padlet_id   uuid NOT NULL REFERENCES public.padlets(id)             ON DELETE CASCADE,
source_document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
```

1. **The target must be a padlet.** A wiki page is not a padlet.
2. **The source must be a knowledge document.** A wiki compiles from board
   **posts** as well; there is no padlet-source column.

And a third, which decides the design rather than merely blocking reuse:

3. **`ON DELETE CASCADE` on `source_document_id` means a note's provenance
   VANISHES when its source is deleted.** The chat citation path does the
   opposite — `board_ai_messages.citations` is `jsonb` with **no** foreign key
   ([20260902120000_create_board_ai_chat.sql:60](supabase/migrations/20260902120000_create_board_ai_chat.sql#L60)) — which is
   exactly why item 15 could give citations a *gone* state at all. A row that
   cascades away cannot be shown as gone; it is simply absent, and the page
   silently loses a source it really did use.

> **Therefore the wiki's source set follows the CITATION pattern, not the
> `source_references` pattern: recorded content with no foreign key to the
> source, so deletion is derivable and renderable rather than destructive.**
> This is a premise-level consequence of P3 that only recon surfaced.

### Does not exist (confirmed)

- **No wiki anything.** `wiki` matches nothing in `supabase/migrations/`, `lib/`,
  `components/` or `app/` — the only hits repo-wide are inside the vendored
  Excalidraw fork.
- **No compilation call**, no page storage, no editor surface.
- Embeddings infrastructure is present but not live (worker at `instances=0`, no
  ANN index, `knowledge-query` has no committed deploy tooling, board posts are
  not embedded at all). **Out of scope — section 6.**

---

## 3. Unit 0 — the compilation-fidelity instrument (DELIVERED, for review)

`scripts/db/wikiCompilationFidelity.ts`. Read-only against CollabBoard; it
writes no table and no board, and spends real DeepSeek tokens.

### Design

It runs the **real** `searchBoardAiContext` and the **real** block builder, so
the passages are the ones the product would compile from, carrying the same
`S{n}.{i}` sub-tokens the citation layer already resolves. Nothing is
hand-picked. It then makes the compilation call and measures two things that
fail differently:

1. **UNMARKED (automatic).** A sentence carrying no token. The prompt requires
   every sentence to end with the id(s) it came from, so one that does not is
   unattributable by construction and needs no human judgement.
2. **UNSUPPORTED (human).** A sentence whose cited passage does not say what the
   sentence claims. Only a person can judge this, so the output is a **marking
   sheet**: every sentence beside the identity of the passage it names, with all
   passages printed in full underneath.

The second number is the real one; the first is a floor.

### Two metric defects the runs found, and fixed

- **A title carrying tokens was counted as a claim.** A title is a summary, not
  a statement of fact. It is now excluded from the claim count and **reported
  separately** — because a title is the one place an overclaim can enter without
  any sentence being wrong (see the finding below).
- **The licensed refusal was counted as UNMARKED.** The prompt permits one
  unattributed sentence when the passages do not cover the topic. Counting it
  scored the single most desirable behaviour a compiler has as its worst
  failure. A declining page is now a distinct **OUTCOME**, not a bad page.

### The run

Reference board, `deepseek-flash`, temperature 0.2.

| | Audi bumper/horn | Chess control (nothing on the board answers it) |
|---|---|---|
| passages retrieved | 6 (4,186 chars) — 3 post, 3 pdf | 2 (2,068 chars), both noise |
| outcome | compiled | **DECLINED** |
| claims | 11 | 1 (the licensed refusal) |
| **unmarked** | **0** | **0** |
| **invented tokens** | **0** | **0** |
| passages used | 3 of 6 | 0 of 2 |
| `finish_reason` | stop | stop |

**Hand-marked: 11 of 11 traced, 0 unsupported.** Checked against the German
source text, including the two hardest: the workshop/lock-carrier account and
the mounting-tab geometry both render `Schuld war der Idiot meiner Werkstatt…
einfach irgendein Loch genommen… Öffnung des Horns nach oben zeigt` and `Die
Lasche ist also hinter dem Aluprofil befestigt. Davor geht nicht…` without
invention or drift. One faithful transposition of voice (the author's "bei mir"
became "in one case") and no factual change.

**The control is the stronger result.** Given two term-matching but irrelevant
chess passages it wrote exactly one sentence — "The passages do not cover who
won the chess tournament in Berlin last year" — cited nothing, and invented
nothing. Declining is the behaviour a durable page most needs and the hardest to
get.

### Findings that change the plan

1. **THE TOKEN BUDGET IS THE FIRST REAL DESIGN CONSTRAINT, and 4,000 fails.**
   The first run returned `finish_reason: length` with **completion 4000/4000 and
   reasoning 4000** — the entire budget spent reasoning, **zero content emitted**.
   This is the `deepseek-flash` defect that
   [tokenBudgets.test.ts](lib/server/ai/tokenBudgets.test.ts) exists to catch,
   recurring on a new surface and caught by this instrument on its first run.
   At 12,000 it completes; the worst observed completion is **3,862, of which
   3,412 (88%) is reasoning**. A production budget of **8,000** is roughly twice
   the worst observed — to be re-measured and recorded with the others before any
   server action adopts it.
2. **COMPILATION CANNOT BE A SYNCHRONOUS REQUEST UNDER THE CHAT TIMEOUT.**
   Observed 15.4–18.2s against `BOARD_AI_CHAT_TIMEOUT_MS = 20_000`, at a budget
   twice the chat's. Compilation needs its own bound and its own progress
   treatment; it is not a chat turn.
3. **Page length varies materially run to run** at fixed settings: 11 claims
   (3,204 completion) and 18 claims (3,862) for the same topic and the same
   passages. Fidelity held in both automatic halves; only the 11-claim run was
   hand-marked. **Recompilation is therefore not idempotent**, which is an
   argument *for* P3 — a recompile that overwrote would silently rewrite a
   page's length and wording on every run.
4. **The title is the overclaim surface.** The Audi page is titled "Audi A2
   Bumper Removal for Horn Replacement" while containing no removal procedure —
   the passages do not have one. Every sentence is true; the title promises more
   than the page delivers. The declining chess page still produced the heading
   "Chess Tournament in Berlin". **Titles must be constrained or human-authored**;
   this is a unit-2 design input, not a defect in the sentences.

---

## 4. The units

Each ends at the established gate and gets its own GO. None is authorized here.

### Unit 1 — page storage and the edit-wins data model

- One wiki per board, inheriting the board's ACL. A cross-board wiki stays ruled
  out: per-board scope is what keeps "every source re-authorized on every read"
  true.
- `board_wiki_pages`: board id, title, **authored content as a single version**,
  timestamps, author.
- The **source set** recorded as content, following the citation pattern — **no
  FK to `knowledge_documents` or `padlets`** — each entry carrying the citation
  item shape plus the source's **compile-time version** (document
  `content_sha256` / `updated_at` for a PDF, `updated_at` for a post).
- Staleness and goneness are **derived by comparison at read time**, never
  stored. A stored flag would go stale itself.
- **Acceptance:** a page survives a source edit with its content byte-identical;
  a deleted source leaves the page intact and the entry resolvable as gone; no
  schema path exists by which a recompile can overwrite authored content.
- **Verification:** domain tests for staleness/goneness derivation; a migration
  rollback file; RLS asserted by the same pattern the knowledge tables use.

### Unit 2 — the page surface

- Read and edit in place; **the sources chain is always visible with the page**
  (P1's mitigation, so it is not optional and not collapsed by default).
- Stale banner and gone state; **refresh is a proposal** — a diff the user
  applies or discards. Nothing overwrites an edit, ever.
- Title handling per finding 4.
- **Acceptance:** there is no code path from a compile result to stored content
  that does not pass through an explicit user action.
- **Verification:** component tests including "a recompile arrives while the user
  has unsaved edits"; a source-scan asserting no direct write from compile output
  to page content.

### Unit 3 — compilation as a server action

- Resolves an **existing** AI role through `resolveAIModelForRole` — no hardcoded
  model, no browser-named provider, no second execution stack.
- Reuses `searchBoardAiContext` whole, including its authorization-before-
  privileged-reader order.
- Its own timeout and budget per findings 1–2, recorded in `tokenBudgets.test.ts`
  with the others.
- **Acceptance:** a compile for a board the caller cannot read returns not-found
  without reaching a privileged reader; the budget is asserted alongside the
  existing ones.
- **Verification:** route tests mirroring the chat route's; one live run on the
  reference board.

---

## 5. What a fidelity failure would change

Stated before the numbers were known, and unchanged by them.

**A fidelity failure is not tunable.** If sentences do not trace to their cited
passages, the response is not a better prompt or a bigger budget — it is that
**compilation must become human-directed**: the model proposes claims and a
person accepts each one before it reaches a page. That is a different product
with a different cost, and building storage and UI first would have committed us
to the automatic version before knowing.

**On this evidence that change is not required.** Zero unmarked, zero invented
tokens, 11 of 11 hand-traced, and a correct refusal on the control. What the runs
*do* require is narrower and already folded in: a measured budget (finding 1), a
non-chat timeout (finding 2), acceptance of non-idempotent recompiles (finding 3,
which P3 already handles), and constrained titles (finding 4).

**The threshold for later runs**, so this is not re-judged case by case: any
unmarked sentence, any invented token, or any hand-marked unsupported sentence on
a page is a fidelity failure and reopens this section. The instrument is the
standing check, re-run when the managed model moves — the same rule the token
budgets carry.

---

## 5b. The deferred logic layer — v2, decided against real pages

Added with Unit 3. **Nothing here is authorized**, and the point of writing it
down is that the one decision it depends on has already been taken.

### What the research found

The Tortoise-style reading of a wiki is that a page is not the unit of meaning —
a *claim* is. A page asserts many things; a reader wants "what does this board
say about X, and what is that based on", which is a question about claims and
their relations, not about documents. The failure mode of a page-only wiki is
that two pages can quietly contradict each other and nothing in the system is
capable of noticing, because nothing below the page has an identity.

### The decision already taken, which is what makes this deferrable

**Compiled content keeps its passage-level markers** (`[S1.2]`, the chat path's
grammar) in the stored page, and the chain records each source with its
compile-time version. So the mapping *this sentence came from that passage* is
in the database today, on every compiled page.

That is the whole reason this can wait. A claim-level layer is **derivable from
content + chain** over pages that already exist. Deciding it later would have
meant recompiling live pages to recover the mapping — and recompilation is not
idempotent (measured: 11 vs 18 claims, same topic, same passages), so the pages
would come back different. Cheap now, impossible retroactively.

### The three options, in the order they should be tried

1. **A claim view derived from markers.** No schema. Split a stored page on its
   markers and render claim → passage → source. Answers "what is this sentence
   based on" and costs nothing to abandon. It is the only one of the three that
   can be built without deciding anything.
2. **A typed page-relations table.** `supports` / `contradicts` / `refines`
   between claims, written by a person or proposed by a compilation. This is
   where contradiction detection would live, and it is a real system: identity
   for claims that survives an edit, a lifecycle for relations whose endpoints
   moved, and a second thing for every consumer of a page to understand. Not to
   be started before option 1 has shown who asks for it.
3. **An optional spike**, time-boxed, only if 1 and 2 disagree about what a claim
   is. A spike is not a phase — it produces a written answer to one question and
   is thrown away.

### The rule

**This is v2, and it is decided against real compiled pages** — not against the
plan, not against a sample, and not before a board has pages people have edited.
The question "is the page the wrong unit" cannot be answered by reasoning about
it; it is answered by watching what people ask a wiki that already exists.

---

## 6. Non-goals

Stated so the plan cannot drift into them.

- Embeddings, ANN index, worker deployment, post embedding — **separate plan,
  separately gated** (P2).
- Merge semantics for edits versus recompiles — ruled out by P3.
- Any change to per-query retrieval, and the open retrieval followups (1, 2, 4,
  7, 12, 13).
- The reader's own not-found state and the existing-PDF chooser's viewport
  overflow — both recorded in item 15, neither part of this stream.
