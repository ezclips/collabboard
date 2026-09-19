# Findable, Attachable, Portable — three units after the wiki arc

**Audience: the PM.** Three scoped units, ordered by cost rather than value. Each
is written to be dispatched on its own, with its decisions answered first.

**Standing gate for all three:** the failing-test *file set* equal to the 26-file
baseline in `.agent/verification-baselines.md`, with a name-level diff on any
baseline file a commit touches; `tsc --noEmit` clean; commit without pushing; no
database applies from the implementing agent; and any sub-agent runs on
Sonnet 5 — a standing instruction, restated across sessions, not session-local.

---

## Why these three, and what they are not

The wiki arc is closed and the post-signal class is shut in both save paths.
These three are what sits behind "what can we actually do with this now." They
are independent — any one can ship without the others — but they are not equal
in risk.

One framing to fix before the detail: **the wiki is a derived layer, not an
index.** Making every post a wiki page would produce thousands of pages nobody
wrote, each with no claims and no chain, and would cost the provenance property
that makes a page worth having. It would also break the rollback header's
standing claim that what is in `content` is what a person last wrote.
Findability is a *retrieval* problem, and it is Unit 2.

A Library already exists for collecting posts for reuse
(`padlet_library_item`, `components/collabboard/LibraryPanel.tsx`, "Add to
Library"). Nothing below duplicates it.

---

# Unit 1 — Drag a post into Board AI

**Size:** small. **Database:** none.

## Read this first

This is not a capability unit. Already present:

- `BOARD_AI_CONTEXT_TYPES` contains `padlet` and `padlet-image`
  (`lib/domain/ai/boardAiChatContext.ts`).
- Image context has its own execution path
  (`lib/server/ai/boardAiChatImageContext.ts`, `boardAiChatImageExecution.ts`).
- The drawer already carries `data-board-ai-context-use-selected`, which
  attaches the selected post today.

What is missing is only the gesture. Scoped as ergonomics it is honest and
cheap. Scoped as a feature it will grow a second code path, which is the one way
it can do real damage.

## What changes

- A drag source on the freeform card, and a drop target on the drawer's context
  strip.
- Both routed into the **same** context-request builder the "use selected" path
  already calls. One builder, asserted by a source scan.

| | |
|---|---|
| Slot rule | `BOARD_AI_CONTEXT_MAX_ITEMS = 4`. An image costs one item slot and sixteen characters, and is admitted even after the character budget is spent. |
| Character budget | `BOARD_AI_CONTEXT_MAX_TOTAL_CHARS = 14_000`, single item `6_000`. |

## The carry — non-obvious, and why this needs a test rather than a demo

A search block's sub-token (`S3.2`) has its block number **baked at build time**
from `currentContext.length`, before bounding runs. That is only correct because
`boundResolvedContext` drops a *suffix*, so a surviving search block still has
every attachment in front of it.

A drop that **inserts** an item ahead of existing ones instead of appending
would silently misattribute every passage citation in that turn — no error, no
visible symptom, wrong sources.
`lib/server/ai/boardAiCitationPassageIndex.test.ts` already pins the baked token
against the block's real position; extend it to cover an item added by drop.

## Decisions reserved

**1. What happens on the fifth drop?**
*Recommend:* refuse it and name the four that are attached. Silent eviction of
the oldest is how a user loses the very thing they meant to ask about, and the
budget rule already says attachments win and search yields.

**2. Dropping a post that is already attached?**
*Recommend:* a no-op, not a re-order. Re-ordering moves an existing item's
position, which is precisely what the citation carry above forbids.

## Acceptance

- Source scan: exactly one context-request builder reachable from both the drop
  path and the selected path.
- A dropped text post produces a `padlet` item; a dropped image post produces
  `padlet-image`.
- The fifth drop is refused, and the refusal names the four attached.
- A drop never inserts ahead of an existing item — asserted in the
  citation-index suite, not by inspection.
- Live: drag one of each, ask a question that also searches, confirm citations
  still resolve and open the right post.

---

# Unit 2 — Make images findable

**Size:** medium. **Database:** yes — migration with the house triad
(rollout + verify + rollback).

## What is actually wrong

An image on the canvas is not merely poorly indexed. It is **not indexed at
all**, and the one piece of human-written text describing it is never read.

| | |
|---|---|
| Search function | `search_board_posts_text` filters `p.type IN ('text', 'note', 'card')` |
| Three GIN indexes | `padlets_search_gin` (simple), `padlets_search_en_gin` (english), `padlets_search_de_gin` (german) — all partial, all carrying the same predicate |
| Indexed expression | `COALESCE(title,'') \|\| ' ' \|\| plain_text_from_post_content(content)` |
| Where an image's text lives | `metadata.caption`, which nothing reads. `content` is empty on 293 of 320, and `title` is the literal word "Image" on 254 |

So a user who puts a captioned image on a board and later asks the assistant
about it gets nothing, and has no way to tell that the image was never a
candidate.

## The population, measured

Counted over all 2,126 padlets. The first pass at these numbers was wrong — it
read a single unpaginated page and so counted images in a truncated sample. The
figures below are the paginated count.

| | |
|---|---|
| image posts | **320** of 2,126 |
| titled literally "Image" | 254 |
| `content` empty / non-empty | 293 / 27 |
| carrying `photographer` metadata | 249 |
| carrying a `caption` key | 277 |
| **caption actually non-empty** | **29** |

**The asymmetry is the point, and the doc should not hide it.** Admitting images
adds 320 rows to the indexed set, of which **29 carry human-written text
today**. The remaining ~291 contribute a title that is the word "Image" and,
for 264 of them, stock-photo attribution. The mechanical win is real and is not
about corpus size: today a captioned image is *never a candidate* and nothing
says so. But the honest expectation is 29 captions entering the corpus against
254 rows whose strongest indexed token would be "image" — which is exactly why
acceptance here is measurement rather than judgement, and why the ranking-pair
tripwires are the gate.

It also reframes decision 1 below: `photographer` is not a marginal addition, it
is present on 249 of 320 rows — it would be the *dominant* signal in the
admitted set.

## What changes

1. A new projection function returning a post's searchable text *including*
   `metadata->>'caption'` — declared `IMMUTABLE`, `PARALLEL SAFE`,
   `SET search_path = ''`, mirroring `plain_text_from_post_content`.
   Immutability is not stylistic here: a non-immutable expression cannot be
   indexed.
2. The search function's type filter widened to admit `image`.
3. All three GIN indexes rebuilt on the new expression and the new predicate.

Nothing in the citation path changes: a found image is an ordinary `padlet`
item, so it cites and opens with no work.

## Decisions reserved

**1. Which metadata keys become searchable?**
*Recommend:* `caption` only. `photographer` and `source` are stock-photo
attribution, and they are not a marginal addition: `photographer` is present on
**249 of the 320** rows this unit admits, against 29 non-empty captions. Indexing
them would make attribution the dominant signal in the newly admitted set —
photographer names and "Unsplash" competing with prose everywhere else on the
board. Add them only if a measurement asks for them.

**2. Lock strategy for the index rebuild.**
`CREATE INDEX` blocks writes on `padlets` for the duration of each build. The
`20260918160000` header already states this and its remedy:
`CREATE INDEX CONCURRENTLY`, run *outside* a transaction — which conflicts with
the triad's single-transaction shape.
*Recommend:* keep the builds as the last statements in the file and individually
re-runnable, exactly as `20260918160000` does, and choose CONCURRENTLY at apply
time against the real table size. At 2,126 rows this is seconds.

**3. Captions that are filenames.**
An image captioned `IMG_2024.jpg` becomes a row matching "img" and "jpg".
*Recommend:* index it anyway and measure. A filename heuristic in SQL is a
judgement call in the one place judgement calls are hardest to revise.

## The cost, stated plainly

Write amplification is the standing price of this search design, and item 3 of
`.agent/retrieval-followups.md` already records it: three GIN indexes maintained
on every post edit. Widening the predicate adds 320 rows today and every image
created from here on. That is the trade, and it should be accepted explicitly
rather than discovered later — with the 29-of-320 caption ratio in view, since
it is what the trade buys.

## Acceptance — measurement, not opinion

- The three named ranking pairs in `scripts/db/boardSearchRankingPairs.test.ts`
  re-run and reported before and after. Two of them encode a *current defect* as
  a tripwire: if adding image rows flips one, that is a human decision point,
  not a green light.
- The verify file reads index definitions from the **database**
  (`pg_get_indexdef`), not from the repository — the row-24 lesson.
- The verify is executed against an applied body before delivery, and proved
  able to go red for the defect it names.
- Live: a query that finds an image by its caption, cites it, and opens the
  right card.

---

# Unit 3 — OKF exporter

**Size:** small–medium. **Database:** none. Read-only and additive.

## What OKF is

Google Cloud's Open Knowledge Format, v0.2: a directory tree of markdown files
with YAML frontmatter, one concept per file. Only `type` is required. It is
explicitly not a runtime, not a search index, and Google states it confers no
ranking benefit — so it replaces nothing we built. The spec calls itself a
starting point rather than a finished standard, which is an argument for pinning
the version we target.

Spec: <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md>

**A hard boundary: OKF is a wire format for us, never our schema.** Its
provenance lives in frontmatter inside the markdown body; our body is `content`,
which is client-writable. Moving `sources` there would hand a caller the version
fields the server resolves — the laundering hole we rejected when we chose
`appliedProposalId` as a reference over "newest proposal wins" — and would
discard the slug constraint, the title constraint and the column-level UPDATE
allowlist along with it.

## What already maps

| OKF field | What we store | Fit |
|---|---|---|
| markdown body | `content` | exact |
| `title` | `title` | exact |
| `sources[].last_modified` | `version.updatedAt` | exact — the column the last two commits made honest |
| `generated.at` | `compiled_at` | exact |
| `generated.by` | — | not persisted |
| `verified[]` | `updated_by` / `updated_at` | derivable from a human save |
| `status` | — | no lifecycle field |

## What changes

- `lib/domain/wiki/boardWikiOkfDocument.ts` — pure, no I/O: page row →
  frontmatter + body.
- An export handler on the existing wiki session: the caller's own RLS client,
  no admin client. Export is a read, so a viewer gets it.
- An `index.md` generator, per the reserved-filename rule.

## Decisions reserved

**1. The URI scheme for `sources[].resource`. This is the expensive one.**
We hold ids; citations open through an in-app callback, not a URL. Either a real
deep link or a stable custom URI such as `collabboard://board/<id>/post/<id>`.
Whatever is chosen becomes the identity our pages present to the outside world,
and it is expensive to change once anything has consumed an export.
*Recommend:* settle this before the unit opens, not inside it.

**2. What happens to `[S1.4]` markers on export?**
Our markers are finer-grained than OKF, which expresses relationships as plain
markdown links whose kind is "conveyed by the surrounding prose."
*Recommend:* resolve each marker into a real markdown link to its source. It is
the first time the marker carry pays for itself. The alternative — leaving them
verbatim — exports something portable but meaningless outside our own reader.

**3. `generated.by` in v1?**
The field wants `<producer>/<version>`. `lib/server/ai/boardWikiCompilation.ts`
has the model string at compile time; it simply is not persisted.
*Recommend:* omit the field in v1 rather than couple this unit to a migration.
Persisting the compiling model is worth doing on its own merits, as its own
small unit.

## Two hard rules, not decisions

- **`verified[]` is written only from a human save.** OKF treats human
  verification as a trust tier. Stamping it on machine output is exactly the
  overclaim the citation work and the wiki plan both exist to prevent — the same
  reasoning as "recompilation proposes, it never overwrites."
- **`stale_after` is emitted as nothing.** OKF wants an absolute instant; ours
  is computed by comparing recorded source versions against live ones. A guessed
  timestamp would be worse than an empty field and worse than the truth we
  actually have.

## Acceptance

- Output validates against the reference implementation and sample bundles in
  `GoogleCloudPlatform/knowledge-catalog` — not "it looks right."
- The targeted spec version is pinned in the exporter and named in the commit.
- Golden-file tests: a page with no sources, a page with a *gone* source, a page
  carrying markers.
- Authorization: a viewer can export; a non-member gets nothing; no admin client
  anywhere in the path.

---

# Recommended order

Ordered by cost and blast radius rather than value. If only one ships, it should
be Unit 2 — but it should not ship first.

1. **Unit 1 — drag to attach.** No database, no migration, reversible in a
   commit. It also exercises the citation-index invariant under a new caller,
   which is worth knowing before anything else moves.
2. **Unit 2 — make images findable.** Highest value and highest cost. Needs the
   triad, a lock decision at apply time, and a before/after on the ranking
   pairs. Worth doing properly rather than quickly.
3. **Unit 3 — OKF exporter.** Additive and safe, but it depends on a young spec
   and on a URI decision that outlives it. Last, and only once the URI scheme is
   settled.

**Not started, nothing authorized.**
