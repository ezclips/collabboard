# PATCH-153 — Transcript disclosure on board wiki pages

**Status:** done — implemented `f577c32a`, CTO re-verified 2026-09-21

> Lifecycle note: this is the draft. The **Final Implementation Specification**
> is written into this file only after the owner approves, and the handoff to
> the implementer happens only after that (AI_WORKFLOW.md, patch lifecycle).

## Goal
A board wiki page compiled from a user-pasted transcript says so, once, in its
"Compiled from" chain.

## Reason
`KNOWLEDGE_TRANSCRIPT_DISCLOSURE` — *"User-provided transcript. The video
association is the importer's claim and has not been verified."* — is shown by
the source reader today. **No wiki file references it.**

A wiki page sits further from the source than the reader does: it states things
in prose, compiled by a model, from a transcript a person pasted and a video
association nobody checked. It is the surface that most needs the disclosure
and the only one without it.

This is the failure shape `.agent/wiki-plan.md` names as its own motivation — a
confident answer drawn from less than the reader believes it has.

## Why now / why this order
PATCH-153 is the second of three units for Stage 3b's wiki integration:

1. **`f6858669` (done)** — wiki staleness learned to see transcript mutations.
   It added the `knowledge_documents` read this patch extends, so the
   disclosure costs one extra column rather than a new query.
2. **PATCH-153 (this)** — the disclosure.
3. **Timestamped citations on wiki pages — HELD**, deliberately not this patch.
   It needs cue-range resolution and a reconstruction-cost decision, and it is
   worth nothing until the transcript batch is applied to hosted.

Disclosure before timestamps is the right order: a timestamp is a stronger
claim about an unverified source, so the caveat must not arrive after it.

## Expected Outcome
A wiki page citing at least one transcript renders the disclosure sentence once
in its sources section. A page citing only PDFs and posts renders nothing new.
Compilation, editing, staleness and export are unchanged.

## Files to Create
- none

## Files to Modify
- `lib/domain/wiki/boardWikiPageSources.ts` — carry transcript-ness on the
  CURRENT version (see Architecture Notes: it is not recorded).
- `lib/server/wiki/boardWikiSourceVersions.ts` — read the discriminator.
- `lib/server/wiki/boardWikiSourceVersions.test.ts` — cover the read.
- `lib/server/wiki/boardWikiPageRoute.ts` — serialize it beside `state`
  (line ~186), the other current-derived field.
- `lib/server/wiki/boardWikiPageRoute.test.ts` — cover the response shape.
- `components/collabboard/BoardWikiDrawer.tsx` — render it once in the
  `data-board-wiki-sources` section (~line 590).
- `components/collabboard/BoardWikiDrawer.test.tsx` — cover the rendering.

## Files that MUST NOT be touched
Reject on contact. If the change appears to require one of these, STOP and
report.

- anything under `supabase/` — no schema change is needed or permitted here
- `lib/domain/knowledge/knowledgeTranscriptCitation.ts` — the disclosure
  constant is IMPORTED, never redefined or retyped
- `lib/domain/wiki/boardWikiCompiledPage.ts`, `boardWikiEditing.ts`,
  `boardWikiExportBundle.ts`, `boardWikiOkfDocument.ts`, `boardWikiTextDiff.ts`
- `lib/server/ai/boardWikiCompilation.ts`,
  `lib/server/wiki/boardWikiCompileSession.ts`
- `lib/domain/canvas/boardObjectReveal.ts` and its test — these carry the
  PRE-EXISTING `check:boundaries` failure (see Potential Risks). Not ours.
- any test file not listed under Files to Modify
- anything under `.fable5/` or `.claude/`

## Architecture Notes

**The discriminator is `transcript_representation IS NOT NULL`, and nothing
else.** A transcript is stored with `kind = 'text'` deliberately — migration
`20260921120000` argues the case under "WHY NOT A NEW `kind`" — so `kind`
cannot answer this question.

**Do not select the whole `transcript_representation` column.** It holds every
cue and can reach 8 MiB, and the wiki reads it for every source of every page
render. Select a scalar out of it instead:

```
transcript_representation->>representationVersion
```

**The precise claim, which is narrower than "database-enforced" and is the only
one this patch relies on:** the column's CHECK constraint (`20260921120000`,
line 51) requires `representationVersion` to be a number whenever
`transcript_representation` is non-null. Therefore
`transcript_representation->>representationVersion` is non-null **exactly when
`transcript_representation` is non-null** — the scalar is a faithful proxy for
the column, and nothing more. What makes a row a transcript is that a
representation was written to it; that is the definition, not a guarantee the
constraint provides.

**The select syntax is verified, not assumed.** PostgREST accepts both casts
and JSON-path expressions in `select`. Tested 2026-09-21 against the running
local `collabboard` stack (PostgREST on 54321):

```
select=id,probe:metadata->>type   -> HTTP 200
select=id::text                   -> HTTP 200
select=id,definitely_not_a_column -> HTTP 400  {"code":"42703", ...}
```

The control matters: PostgREST **does** reject an unparseable or unknown
select with `400 / 42703`, so the 200s are proof the expressions parsed and
executed rather than being silently ignored.

**Do not confuse this with the `f6858669` hazard.** That risk is an *unapplied
column* — hosted has no `transcript_mutation_revision`, so PostgREST answers
`42703 column does not exist`. Same error code, different cause: one is a
missing column, the other would be invalid syntax. The syntax is now proven
valid; the missing column remains a real ordering constraint (see Migration
Notes).

**Transcript-ness is read from the CURRENT version and never recorded.** It is a
fact about what the reader is looking at now. A `gone` source has no current
version and therefore makes no claim, which is correct — we cannot assert
anything about a source we can no longer read.

**Exactly where the field lives — this is specified, not left to judgement.**
The route sends `version: status.source.version`, which is the RECORDED
compile-time version, so the discriminator cannot simply ride along with it.
Build it this way and no other:

1. `BoardWikiSourceVersion`, `document` variant, gains **`isTranscript?: true`**
   — OPTIONAL, exactly as `transcriptMutationRevision` was made optional in
   `f6858669`, and for the same reason: a required field is a compile-time
   obligation on every literal of that variant across the repo, tests included.
   Optional means the MUST-NOT-TOUCH consumers (`boardWikiEditing.ts`,
   `boardWikiExportBundle.ts`, `boardWikiOkfDocument.ts`,
   `boardWikiTextDiff.ts`) need no edit at all. If adding it forces an edit to
   any of them, STOP — you have made it required.
2. `hasChanged` **must not compare it.** Transcript-ness is not a change
   signal, and it is never present on the recorded side.
3. `parseVersion` **must not read it.** It is not stored; reading it back would
   make a compile-time snapshot masquerade as current fact.
4. `BoardWikiSourceStatus` gains `isTranscript: boolean`, set by
   `boardWikiSourceStates` from the CURRENT version it already holds — not by
   the route re-consulting the map.
5. The route serializes that status field.

Steps 1 and 4 are the whole reason this is written out: a version field and a
status field are both defensible, they land in different files, and one of the
two routes through a MUST-NOT file.

**Once per page, not once per source.** The disclosure is a statement about the
page's provenance. Repeating it on every chip turns a caveat into noise, and
noise is how a caveat stops being read.

## Migration Notes
None. No schema change.

**Deployment ordering — the same hazard `f6858669` hit.**
`transcript_representation` ships in migration `20260921120000`, which is **NOT
applied to the hosted database**, and this patch adds it to a live read path.
`f6858669` made both queries throw and the route return 503, so the failure is
loud rather than a silent "every source deleted" — but the ordering still
binds: **apply `20260921120000` before this code reaches production.**

## Potential Risks

1. **What is proven about the select, and what is not.** The *syntax class* is
   proven (see Architecture Notes: tested against the local stack, with a
   control). What is NOT proven is this exact query against a database that
   actually has the column, because no such database exists yet — hosted lacks
   it and the local stack is on an older schema. So: the query cannot fail for
   *syntax*; it can still fail for the same ordering reason `f6858669` can.
   **Do not switch to selecting the full column.** If you believe you must,
   STOP and report — that fallback costs up to 8 MiB per source per render and
   is a decision for the CTO, not a workaround.
2. **`check:boundaries` is already red on this branch**: two
   `no-restricted-imports` errors in `lib/domain/canvas/boardObjectReveal.ts`
   and its test, from `21d6533e` (2026-09-11). Capture the check BEFORE editing
   so those two are not mistaken for this patch's doing — and so a genuinely
   new third error is still visible.

## Commit
  Commit message:
  feat(wiki): say when a wiki page was compiled from a pasted transcript

  A wiki page states things in prose, compiled by a model, from a transcript a
  person pasted and a video association nobody verified. The source reader
  carries that disclosure; no wiki file referenced it. The surface furthest
  from the source was the only one without the caveat.

  The discriminator is transcript_representation IS NOT NULL -- a transcript is
  stored as kind 'text' deliberately, so kind cannot answer it. The column is
  not selected whole: it can reach 8 MiB and the wiki reads it per source per
  render, so a scalar is selected out of it, which the column's CHECK
  constraint makes a database-enforced test rather than a convention.

  Transcript-ness is read from the CURRENT version and never recorded: it is a
  fact about what the reader is looking at now, so a gone source makes no
  claim. The disclosure renders once per page, because a caveat repeated on
  every chip stops being read.

  Ordering: transcript_representation ships in 20260921120000, which is not
  applied to production. Apply it before this code ships.

## Rollback Plan
`git revert` the commit. No schema, no data and no stored shape changes, so the
revert is complete and needs no follow-up.

## Acceptance Criteria
1. A page citing at least one transcript renders the disclosure **once**.
2. A page citing only PDFs and posts renders **no** disclosure.
3. A page citing two transcripts renders it **once**, not twice.
4. A source whose transcript-ness is unknown or absent renders **no**
   disclosure. Absent means "not a transcript", never "warn to be safe" —
   otherwise every PDF acquires an unverified-claim notice.
5. A `gone` source makes no disclosure claim.
6. The disclosure text is imported from
   `lib/domain/knowledge/knowledgeTranscriptCitation`, never retyped.
7. The wiki read path's select string asks for the scalar and **not** the bare
   `transcript_representation` column. Stated honestly: this is a source-level
   assertion. It proves the query we send, not that PostgREST liked it — the
   syntax proof is the local-stack test in Architecture Notes, and a stub
   client cannot re-prove it.
8. Staleness, freshness, chip rendering, opening and export are unchanged.
   Specifically: `hasChanged` does not compare `isTranscript`, and
   `parseVersion` does not read it.
9. Adding the field requires **no edit to any MUST-NOT-TOUCH file.** If one is
   needed, the field was made required instead of optional — stop and report.

## Required Tests
- `boardWikiSourceVersions.test.ts` — the scalar maps to transcript-ness;
  absent or null yields not-a-transcript; the select asks for the scalar and
  NOT the bare column.
- `boardWikiPageRoute.test.ts` — the field is serialized beside `state`, and
  derived from current versions rather than recorded ones.
- `BoardWikiDrawer.test.tsx` — the four rendering cases (1-4 above).

## Verification
Run all four and paste REAL, COMPLETE output (handoff rule 6):

```
npx vitest run                 # failing FILE SET must equal the pre-edit capture
npx tsc --noEmit               # exit 0
npm run check:boundaries       # compare to the pre-edit capture; see Risk 2
git log --oneline -1
```

A pre-edit capture of `npx vitest run` and `npm run check:boundaries` is taken
BEFORE any edit and pasted alongside the after-run.

## Estimated Difficulty
easy — one column, one derived field, one conditional render. The care is in
the discriminator and the payload, not in the logic.

---

## Review round 1 — implementer spec review, 2026-09-21

Requested before owner approval, because on the previous unit the implementer
caught a spec defect that would have deadlocked it at the gate. Six findings;
three changed this patch, three did not survive checking. CTO verdicts:

| # | Finding | Verdict |
|---|---|---|
| B1 | `->>` is not valid PostgREST select syntax; `f6858669` is a precedent of its failure | **REJECTED, with evidence.** Tested against the running local stack: `metadata->>type` and `id::text` both return 200, while an unknown column returns `400 / 42703`. The control proves the expressions parsed. The finding conflated *invalid syntax* with *missing column* — both surface as `42703`, and `f6858669`'s risk is the second. The proof is now in Architecture Notes. |
| B2 | The "database-enforced" claim is unsound | **PARTLY ACCEPTED.** The kernel is right: the CHECK guarantees the scalar tracks the column, nothing more, and a row IS a transcript because a representation was written to it. The sentence claimed more than it needed. Narrowed. |
| B3 | The patch never says whether the field goes on the version or the status type; one route touches a MUST-NOT file | **ACCEPTED — the best finding of the round.** Both placements were defensible and they land in different files. Now specified as five numbered steps, with the field OPTIONAL so no MUST-NOT consumer needs editing, and acceptance criterion 9 added to catch it if one does. |
| B4 | The route holds the RECORDED version, so "serialize beside `state`" is underspecified | **ACCEPTED.** Resolved by the same five steps: `boardWikiSourceStates` sets it from the current version it already holds, rather than the route re-consulting the map. |
| N3 | Criterion 7 is a source scan that proves nothing about PostgREST | **ACCEPTED.** Reworded to say exactly what it proves and to point at the local-stack test for the part it cannot. |
| N4 | `21d6533e` may not be the SHA the baselines doc names | **REJECTED.** That doc names no SHA for the pair at all; `21d6533e` came from `git log` on the file, which is the stronger source. |
| N5 | A 503 might render as "written by hand" — the same lie in a new costume | **REJECTED, verified.** `BoardWikiDrawer` sets "That page could not be loaded." and never calls `setPage`, so a failed read does not render a page. The "written by hand" line requires a page that loaded with zero sources, which is true. Good hypothesis, wrong about this code. |

Two of the three rejections were settled by running something rather than by
arguing. That is the cheaper move whenever it is available.

---

# Final Implementation Specification

**Approved by the owner 2026-09-21.** Execute this section EXACTLY. Everything
above it is context. Where this section and the context disagree, this section
wins; if the disagreement looks like a defect rather than a refinement, STOP and
report.

## Edit 1 — `lib/domain/wiki/boardWikiPageSources.ts`

**1a.** In `BoardWikiSourceVersion`, `document` variant only, directly after the
`transcriptMutationRevision` field, add:

```ts
    /**
     * True when this document carries a transcript representation RIGHT NOW.
     *
     * OPTIONAL and `true`-only: there is no `false`, because absent already
     * means "not a transcript" and a second way to say it is a second thing to
     * keep in step. Set only on a CURRENT version -- never recorded, never
     * parsed back -- because it is a fact about what the reader is looking at,
     * not about what was compiled.
     */
    readonly isTranscript?: true;
```

**1b.** In `hasChanged`, change no logic. Add this comment immediately above
the `if (recorded.contentSha256 !== null ...)` line:

```ts
    // `isTranscript` is deliberately NOT compared. It is not a change signal,
    // and it never appears on the recorded side at all.
```

**1c.** In `BoardWikiSourceStatus`, add a third field:

```ts
  /**
   * True when this source is a transcript RIGHT NOW. False when it is not, or
   * is gone -- a source we cannot read is a source we cannot make claims
   * about.
   */
  readonly isTranscript: boolean;
```

**1d.** In `boardWikiSourceStates`, set it on both return paths:

```ts
  return sources.map((source) => {
    const now = current.get(boardAiCitationIdentityKey(source.item));
    if (now === undefined) return { source, state: 'gone' as const, isTranscript: false };
    const isTranscript = now.kind === 'document' && now.isTranscript === true;
    return {
      source,
      state: hasChanged(source.version, now) ? 'stale' as const : 'current' as const,
      isTranscript,
    };
  });
```

**1e.** `parseVersion`: **no change.** It must not read `isTranscript`.

## Edit 2 — `lib/server/wiki/boardWikiSourceVersions.ts`

**2a.** Change the documents select to exactly:

```ts
      .select('id, content_sha256, transcript_mutation_revision::text, is_transcript:transcript_representation->>representationVersion, updated_at')
```

The alias `is_transcript:` is required. Without it the returned key for a
JSON-path expression is not something this spec is willing to assume.

**2b.** Above that select, extend the existing comment block with:

```ts
    // The transcript discriminator is a SCALAR pulled out of the jsonb, never
    // the column itself: `transcript_representation` holds every cue and can
    // reach 8 MiB, and this runs for every source of every page render. The
    // column's CHECK constraint guarantees `representationVersion` is present
    // whenever the column is non-null, so the scalar is a faithful proxy for
    // "is this row a transcript" at a few bytes.
```

**2c.** In the document row mapping, add — same conditional-key discipline as
`transcriptMutationRevision`:

```ts
        ...(row.is_transcript !== null && row.is_transcript !== undefined
          ? { isTranscript: true as const }
          : {}),
```

## Edit 3 — `lib/server/wiki/boardWikiPageRoute.ts`

In `pageResponseBody`, in the `sources: states.map(...)` object, add one field
after `state`:

```ts
      isTranscript: status.isTranscript,
```

Nothing else in this file changes. In particular `version:` keeps sending the
RECORDED version.

## Edit 4 — `components/collabboard/BoardWikiDrawer.tsx`

**4a.** Add to the existing import from
`@/lib/domain/knowledge/knowledgeTranscriptCitation`, or add the import if
absent:

```ts
import { KNOWLEDGE_TRANSCRIPT_DISCLOSURE } from '@/lib/domain/knowledge/knowledgeTranscriptCitation';
```

Import the constant. Do not retype the sentence anywhere.

**4b.** In `BoardWikiSourceStatusView`, add:

```ts
  /** Absent means NOT a transcript. The response is untrusted input. */
  readonly isTranscript?: boolean;
```

**4c.** Inside the `<section data-board-wiki-sources="true">`, immediately
AFTER the closing `</ul>` of the chips list and before the section closes, add:

```tsx
                {sources.some((status) => status.isTranscript === true) && (
                  <p
                    data-board-wiki-transcript-disclosure="true"
                    className="mt-2 text-[11px] leading-snug text-amber-800"
                  >
                    {KNOWLEDGE_TRANSCRIPT_DISCLOSURE}
                  </p>
                )}
```

`=== true` is deliberate: absent, undefined and false all mean "not a
transcript". Once per page, never per chip.

## Edit 5 — tests

**5a. `lib/server/wiki/boardWikiSourceVersions.test.ts`** — add:
- a row with a non-null `is_transcript` scalar yields `isTranscript: true`
- a row with `is_transcript: null` yields the key **absent** (assert with
  `Object.prototype.hasOwnProperty.call(...)`, as the existing revision tests do)
- a row with no `is_transcript` key at all yields the key absent
- the select string contains `is_transcript:transcript_representation->>representationVersion`
  and does **not** contain a bare `transcript_representation,` or
  ` transcript_representation ` column request

**5b. `lib/server/wiki/boardWikiPageRoute.test.ts`** — add:
- the serialized source carries `isTranscript` beside `state`
- a source that is gone serializes `isTranscript: false`

**5c. `components/collabboard/BoardWikiDrawer.test.tsx`** — add the four cases:
- one transcript source -> the disclosure renders exactly once
  (`getAllByText` length 1, or query the `data-board-wiki-transcript-disclosure`
  attribute)
- only PDFs/posts -> no disclosure
- two transcript sources -> renders exactly **once**
- `isTranscript` absent on every source -> no disclosure

Match the conventions already in that file (jsdom pragma, `afterEach(cleanup)`,
`getAttribute`/`toBeTruthy` rather than jest-dom matchers).

## Verification — run all of these, paste REAL COMPLETE output

**Before any edit:**

```
npx vitest run
npm run check:boundaries
```

Keep both. `check:boundaries` is expected to FAIL with exactly two
`no-restricted-imports` errors in `lib/domain/canvas/boardObjectReveal.ts` and
its test. That is pre-existing and not yours.

**After the edits:**

```
npx vitest run
npx tsc --noEmit
npm run check:boundaries
git log --oneline -1
```

Pass conditions:
- the failing test FILE SET is identical to the before-capture
- `tsc` exits 0
- `check:boundaries` shows the **same two** errors and no third
- the commit exists

## Stop conditions

STOP and report, leaving the tree clean, if:
- adding `isTranscript?: true` forces an edit to any MUST-NOT-TOUCH file (it
  should not; if it does, you made the field required)
- any existing test fails and the only available fix is to change that test
- you conclude the scalar select must be replaced by the full column
- `check:boundaries` gains a third error

---

## CTO review — 2026-09-21. Verdict: ACCEPTED. Commit `f577c32a`.

Re-verified independently rather than from the report, per AI_WORKFLOW.

| Check | Result |
|---|---|
| Files touched | **exactly the 7 authorized**; zero MUST-NOT files |
| Acceptance 9 (optional, not required) | held — the four MUST-NOT consumers are byte-unchanged |
| Deletions in the three test files | **0** — the appends are pure |
| `npx tsc --noEmit` | exit 0 |
| `npm run check:boundaries` | exit 1, **exactly the same two** pre-existing errors, no third |
| `npx vitest run` | 527 files, 26 failed, 56 failed tests, 10234 passed |
| Failing FILE SET vs before | **identical** — diffed both directions, empty |
| Commit message | verbatim from `## Commit` (rule 12) |

Implementation spot-checked against intent, not only against green tests:
`isTranscript?: true` is optional and true-only; `hasChanged` carries the
not-compared comment and no comparison; `parseVersion` does not mention it; a
gone source yields `false`; the select carries the `is_transcript:` alias and
the mapper reads PRESENCE only; the drawer imports the constant and renders
once behind `=== true`.

### Two notes the implementer raised, both correct

**1. A CTO defect in this patch file.** The `## Commit` message still contains
"which the column's CHECK constraint makes a database-enforced test rather than
a convention" — the exact phrasing review finding B2 corrected, which I
narrowed in Architecture Notes and failed to narrow here. The implementer used
the message verbatim as rule 12 requires and reported the discrepancy rather
than editing it, which is the right call both ways.

**The accurate claim is the one in Architecture Notes:** the CHECK guarantees
the scalar is a faithful proxy for the column, and nothing more. A row is a
transcript because a representation was written to it. The commit body
overstates it. Not amended — the commit is the implementer's and the correction
travels here, where anyone tracing the claim will find it.

**Reusable rule:** when a review corrects a claim, grep the patch for every
place that claim appears — the `## Commit` section is prose the implementer is
FORBIDDEN to fix, so an uncorrected sentence there ships verbatim into history.

**2. A self-correction, disclosed unprompted.** A first edit to
`BoardWikiDrawer.test.tsx` truncated an existing test's `stubFetch` setup; it
reverted and verified byte-identity before appending. Confirmed independently:
zero deleted lines in that file. Disclosing a reverted mistake nobody would
have found is the behaviour that makes the rest of a report worth reading.

### Not closed by this patch
Timestamped citations on wiki pages remain HELD behind the hosted transcript
batch. Ordering stands: `20260921120000` must be applied before this code
reaches production.
