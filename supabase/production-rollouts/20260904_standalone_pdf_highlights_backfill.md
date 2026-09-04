# PDF-R6K — standalone PDF highlight backfill runbook

Companion to `20260904_standalone_pdf_highlights.sql` and its `_verify.sql`.

**The order below is load-bearing.** The reader and the canvas card paint from
`knowledge_source_highlights` only — there is deliberately no citation fallback —
so deploying the standalone renderer against an under-populated table would make
existing highlights disappear from every PDF.

Two separate races are closed here:

- **Legacy gap.** Citations written before the standalone table exists have no
  highlight. Gate 9–13 migrates them.
- **New gap.** An old application instance can still create a citation *without*
  a highlight. Gate 3–5 removes that writer first, so nothing new can open a gap
  while the backfill runs.

Tool: `scripts/db/standaloneHighlightProductionBackfill.ts`
(`npx vite-node scripts/db/standaloneHighlightProductionBackfill.ts [plan|execute|verify]`;
no mode means `plan`, and `plan` never writes).

---

## Gate 1 — apply the H3A database rollout

Run `supabase/production-rollouts/20260904_standalone_pdf_highlights.sql` as one
statement batch. It is a single transaction with a preflight and a postflight; a
partial or malformed state aborts it.

## Gate 2 — verify it

Run `20260904_standalone_pdf_highlights_verify.sql`. Require every `pass` column
`t` and the section 12 roll-up `t`. Section 11 will say
`BACKFILL NOT RUN -- do NOT deploy the H2B renderer yet`. That is expected here.

## Gate 3 — deploy the atomic writer, and NOT the renderer

Deploy the application state in which a new exact-span citation and its highlight
are created together through `create_knowledge_source_citation`, **while the old
citation-derived renderer is still what paints**.

Known-good intermediate foundation: `870f1fe46af50eb072eb97773aec3c9cfeca0719`.

Do **not** deploy the standalone renderer yet.

## Gate 4 — prove the atomic write at runtime

On production, create one new exact-span citation and confirm it produced **both**
a `source_references` row and a linked `knowledge_source_highlights` row.

## Gate 5 — prove every writer is on the atomic path

Confirm no instance, worker, background job or canary still writes a citation
without its highlight. Rolling deploys, pinned versions and long-lived tabs all
count. This is a human/runtime judgement; the tool cannot see it.

## Gate 6 — prepare the administrative connection

Set the dedicated variable, and nothing else:

```
COLLABBOARD_HIGHLIGHT_BACKFILL_DATABASE_URL=postgres://…?sslmode=require
```

Required:

- **direct PostgreSQL**, or **Supavisor SESSION mode on port 5432**
- one backend session for the whole run
- the approved administrative/session connection supplied for this release —
  **never an application role**

Forbidden, and refused by the tool:

- Supavisor **transaction** mode (port `6543`) — it cannot hold one backend
  session, so the advisory lock, the snapshot and the inserts could land on
  three different backends
- PostgREST, `supabase-js`, a `psql` framing workaround, `pg.Pool`
- `localhost`, `127.0.0.1`, `::1`, or any local/Docker alias
- `sslmode=disable`, `allow` or `prefer`
- any fallback variable: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_DB_URL`,
  `NEXT_PUBLIC_*`, `.env.local`, `supabase link`, a project ref

There is no override flag. The tool reports `ADMIN_ROLE_READY=YES` only when the
connection can read the migration inputs and insert a highlight naming
`created_by` and `quote_hash` explicitly, and is a trusted maintenance role
rather than one answering to application RLS. It never grants, elevates, sets a
role, or disables RLS — a connection that lacks the capability is refused.

## Gate 7 — set the protected-document denylist

```
COLLABBOARD_HIGHLIGHT_BACKFILL_DENY_DOCUMENT_NAMES="…"
```

Comma- or newline-separated `original_filename` values. **Required and non-empty**
for every mode. The tool reads document metadata first; if a denied document has
any candidate citation it reports `PROTECTED_BLOCKED` and aborts the whole run
*before* reading that document's page text. Resolve such documents out of band.
No filename, quote, page text or Note content ever appears in the output.

## Gate 8 — set the atomic-writer acknowledgement

```
COLLABBOARD_HIGHLIGHT_ATOMIC_WRITER_CONFIRMED=PDF-R6K-H2B-ATOMIC-WRITER-ACTIVE
```

Set this **only** once Gates 4 and 5 are actually proven. It is an
acknowledgement of a human/runtime gate, not evidence of one. `plan` and
`verify` do not need it; `execute` refuses without it.

## Gate 9 — PLAN

```
… npx vite-node scripts/db/standaloneHighlightProductionBackfill.ts plan
```

Read-only: one `REPEATABLE READ READ ONLY` transaction that rolls back. Output is
counts and one hash — `MUTATED=NO`.

## Gate 10 — record the counts and the PLAN_HASH

Write down `PLAN_HASH` and every count. Sanity-check that `TO_CREATE` is the
number of legacy paintable citations you expect, and that `MISMATCHES` and
`PROTECTED_BLOCKED` are `0`.

`MISMATCHES > 0` means an existing highlight disagrees with what the reader
would paint. **Stop.** The tool never repairs or overwrites a row; that needs a
separately reviewed decision.

## Gate 11 — EXECUTE with that exact hash

```
COLLABBOARD_HIGHLIGHT_BACKFILL_EXPECTED_PLAN_HASH=<the hash from Gate 10> \
… npx vite-node scripts/db/standaloneHighlightProductionBackfill.ts execute
```

One `REPEATABLE READ READ WRITE` transaction on the same session: it takes a
non-blocking release advisory lock, re-checks the H3A fingerprint and the
denylist, **recomputes the plan from that transaction's own snapshot**, and
compares the result to your expected hash. A mismatch means the data drifted
since Gate 9 — it rolls back and writes nothing; take a fresh plan.

It inserts only the missing highlights, with `created_by = NULL` (the legacy
author is genuinely unknown, and naming the operator would be a fabrication) and
`quote_hash = NULL` (a migrated row must not be disguised as an atomic write).
Any failure rolls back every insert. There is no partial backfill.

Never substitute a manual `INSERT … SELECT FROM source_references`: it would copy
stale offsets and reimplement the quote fallback and Note-colour rules in SQL,
which is exactly what this tool exists to avoid.

## Gate 12 — VERIFY

```
… npx vite-node scripts/db/standaloneHighlightProductionBackfill.ts verify
```

Read-only. Recomputes the same canonical plan against current data.

## Gate 13 — require RENDERER_BACKFILL_READY=YES

`YES` only when `TO_CREATE=0`, `MISMATCHES=0`, `PROTECTED_BLOCKED=0` and every
paintable legacy citation is `EXACT_EXISTING`. Legitimate non-paintable skips —
`SKIPPED_PAGE_ONLY`, `SKIPPED_REGION`, `SKIPPED_CROSS_PAGE`,
`SKIPPED_UNRESOLVED`, `SKIPPED_NO_PAGE_TEXT` — never block readiness: the reader
paints nothing for them today either.

## Gate 14 — VERIFY again, immediately before the deploy

`verify` recomputes colours from the Notes as they are **now**. If a Note's
colour changed between Gate 12 and the deploy, the stored highlight no longer
matches and it becomes a `MISMATCH`, so readiness flips to `NO`. That is
deliberate. **Stop** and get a separately reviewed correction — H3B has no
`UPDATE` capability and must not gain one.

## Gate 15 — deploy the standalone renderer

Only with a fresh `RENDERER_BACKFILL_READY=YES` from Gate 14.

## Gate 16 — post-deployment smoke proof

On production, open a PDF that carried legacy highlights and confirm the marks
still render, that clicking one still opens its Note, and that deleting a
highlight leaves the Note, the citation and "Used in Notes" intact.

---

## Never

- deploy the standalone renderer before `RENDERER_BACKFILL_READY=YES`
- run `scripts/db/knowledgeSourceHighlightBackfillRunner.ts` against production —
  it is local-only by construction and stays that way
- use Supavisor transaction port `6543`, PostgREST or `supabase-js` for `execute`
- use `supabase link`, a project ref, or a migration push
- hand-write `INSERT … SELECT` from `source_references`, copy stored offsets, or
  reimplement quote fallback or Note-colour derivation in SQL
- run any mode without the denylist
- reuse a stale `PLAN_HASH` after the data has moved
- auto-repair a `MISMATCH`

## Rollback

`HIGHLIGHT_BACKFILL_POSTCOMMIT_ROLLBACK_REQUIRES_SEPARATE_GATE`

This tool rolls back only *before* commit, and deliberately ships no destructive
production rollback command — a convenient "delete all backfilled highlights"
switch is exactly what we do not want next to real annotations. Reversing a
committed backfill requires a separately reviewed emergency procedure built from
that run's own evidence.
