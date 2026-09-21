# Isolated SQL verification — run of 2026-09-21

The first execution of the transcript rollout SQL anywhere. Run by the PM on a
**disposable local Supabase stack** (`collabboard-verify`, ports 56321/56322),
built from the baseline snapshot plus all 43 migrations through
`20260920120000`, with the pre-state confirmed to match hosted exactly.

**No hosted contact.** Nothing in this run touched the hosted project. Full
log: `C:\Windows\TEMP\opencode\cb-verify\run-log.txt` (outside the repo).

## Why a local stack, and what it does not settle

A local stack builds its schema from migrations, so its pre-state is
*constructed*. A hosted branch clones the **real** ACL. Item 18's whole premise
is "is the real ACL a supported pre-state?", and only a branch answers that.

What the local run does settle is everything mechanical — whether the SQL
applies, repeat-applies, refuses the states it should refuse, rolls back, and
restores — and it settled it with unlimited retries at no cost. The hosted
branch is still required, and now runs once against a sequence already known to
work, instead of spending branch hours discovering syntax errors.

## Five defects, all in the prepared SQL, none in the application code

The run was shimmed in `%TEMP%\cb-verify` to get past each defect; **repo files
were never edited during the run.** All five are fixed in the commit that
carries this file.

| # | Site | Defect |
|---|---|---|
| 1 | `20260921120000_..._representation_verify.sql:61` | `LIKE … INCLUDING CONSTRAINTS` copies `NOT NULL` but **not** `gen_random_uuid()`, so the probe INSERT omitted `id` and died on the not-null constraint before reaching the check under test |
| 2 | `20260921130000_..._hash_not_client_writable_verify.sql:107` | The same defect, same fix |
| 3 | `20260921130000_..._hash_not_client_writable.sql:62-69` **and** its verifier | The expected UPDATE allowlist was the **wrong set** |
| 4 | `20260921140000_..._insert_not_client_writable.sql:184,187` | `effective_roles \|\| 'anon'` reads the untyped literal as an *array* → `malformed array literal: "anon"` |
| 5 | `20260921160000_knowledge_transcript_rpcs.sql:219` | `knowledge_transcript_assert_version` called **itself** instead of `assert_chunks` + `assert_representation` → `stack depth limit exceeded` on every call; verifier cases 2-8 all failed on it |

### Defect 3 is the one worth reading twice

The allowlist was **guessed**, and the guess was checked against the **column
count** — which matched. 21 either way. It wrongly included
`derivatives_rendered_at` and `derivatives_requested_at` (server-written
lifecycle columns) and wrongly omitted `id` and `processing_attempt`.

Two things make this the instructive one:

- **The correct set was already in this repo**, in
  `20260903_pdf_derivative_render_lifecycle.sql`, labelled "the exact mutable
  column set this rollout restores UPDATE on". It was not read.
- **The file's own comment admitted the guess** — "It has NOT been observed
  name-by-name" — and it shipped anyway.

The design held: because the allowlist is compared **by name in both
directions**, the migration refused to run and printed both sets. A count check
would have applied the wrong ACL and reported success. That is the entire
argument for name pinning, demonstrated against its author.

Reading `id` in the real allowlist also surfaced **followups item 20**:
`authenticated` can UPDATE the primary key. Pre-existing, deliberately not
fixed here.

### Defect 4 also broke the harness that was supposed to catch defects

The adversarial cases 1-3 scored **PASS on the malformed-array-literal error**
— they accepted *any* error as a refusal, so a classifier that could not run at
all read as adversarially sound. Rejection for the wrong reason is not
rejection.

Tightened: a reject case now passes only when the error is `P0001` (a real
`RAISE EXCEPTION`, not a fault) **and** the message matches the specific check
that must catch that shape. A fault reports `refused by a FAULT, not by a
check`; the wrong check reports `refused by the WRONG check`. Three new tests
in `knowledgeItem18Sql.source.test.ts` pin this, including one that checks each
pinned message is text the classifier still raises — a pin naming a vanished
message would fail every case instead of passing them.

## Verified green, with the shims

- Transcript rollout: apply + verify
- Item 17: apply → verify → repeat-apply → verify
- Item 18 adversarial: **ALL PASS -- 5 of 5**, with correct reasons
- Item 18: apply → verify → repeat-apply → verify
- Revision column: apply + verify
- RPCs: apply + verifier **ALL PASS -- 8 of 8** (initial revision, stale
  conflict, content advance, metadata-only advance, failure restore,
  post-delete restore, astral rebuild)
- All four rollbacks
- Restoration matching the recorded pre-state **exactly**: 21-column UPDATE
  allowlist including `content_sha256`, table-wide INSERT restored for `anon`
  and `authenticated`, revision column and RPCs dropped, zero test rows left

`transcript_representation` remains after rollback **by design** — that rollout
has no rollback file.

## Status

This run used shims, so it is **not** a clean verification. Standing until a
clean re-run: the SQL is unverified.

Next: re-run the full sequence with **no shims** on a fresh local stack, then
the hosted branch for the real-ACL pre-state. The branch price decision belongs
to the human. Hosted applies stay with the authorized operator.
