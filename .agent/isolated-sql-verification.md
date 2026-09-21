# Isolated SQL verification — 2026-09-21

The first execution of the transcript rollout SQL anywhere, in **two runs** on
a **disposable local Supabase stack** (`collabboard-verify`, ports
56321/56322), built from the baseline snapshot plus all 43 migrations through
`20260920120000`, with the pre-state confirmed to match the hosted ACL exactly.
Both were run by the PM.

| Run | Against | Outcome |
|---|---|---|
| **1 — shimmed** | the SQL as committed at `9b356a4d` | **five defects**, each shimmed past to reach the next |
| **2 — clean** | the fixed SQL at `571b19b6`, fresh stack, **no shims** | **fully green** |

Run 2 is what verifies anything. Run 1 is kept because what it found — and how
one of its defects hid inside the harness built to catch that very kind of
defect — is the part a later reader needs.

**No hosted contact** in either run. Full
log: `C:\Windows\TEMP\opencode\cb-verify\run-log.txt` (outside the repo).

## Why a local stack, and what it does not settle

A local stack builds its schema from migrations, so its pre-state is
*constructed*. A hosted branch clones the **real** ACL. Item 18's whole premise
is "is the real ACL a supported pre-state?", and only a branch answers that.

What the local runs settle is everything mechanical — whether the SQL applies,
repeat-applies, refuses the states it should refuse, rolls back, and restores —
and they settled it with unlimited retries at no cost. **That is now done.**

The hosted branch is still required, and it now runs **once**, against a
sequence already known to work, to answer the one question a local stack
cannot: whether the REAL ACL is a supported pre-state. It is not spending
branch hours discovering syntax errors — which is precisely what run 1 would
have been.

## Run 1 — five defects, all in the prepared SQL, none in the application code

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

## Run 2 — the clean run, fully green

Fresh stack, rebuilt from the baseline snapshot plus all 43 migrations through
`20260920120000`, pre-state again matching the hosted ACL exactly, then the
fixed files at `571b19b6`. **No shims.**

| Step | Result |
|---|---|
| Transcript representation apply + verify | `transcript_representation verify: ok` |
| Item 17 apply → verify → repeat-apply → verify | `hash permission verify: ok`; repeat correctly no-op'd |
| **Item 18 adversarial** | **`ALL PASS -- 5 of 5`** |
| Item 18 apply → verify → repeat-apply → verify | `insert permission verify: ok`; repeat correctly no-op'd |
| Revision column apply + verify | `transcript mutation revision verify: ok` |
| **Transcript RPCs apply + verify** | **`ALL PASS -- 8 of 8`** |
| Rollbacks ×4 (RPCs → revision → item 18 → item 17) | all exit 0 |
| Restoration | UPDATE set == pre-state `True`; table-wide INSERT restored; `content_sha256` client-writable again; revision column and RPCs gone; zero test rows |

**Record the two harness verdicts separately, each against its own
denominator.** A short count reads `*** INCOMPLETE`, never `ALL PASS`, and
combining the totals under one label would let a short adversarial run hide
behind the verifier's count.

`transcript_representation` remains after rollback **by design** — that rollout
has no rollback file.

### The adversarial result means something now, and did not before

Run 1 also reported `ALL PASS -- 5 of 5`, and it was worthless: cases 1-3 were
passing on the classifier's own `malformed array literal` fault, because any
error counted as a refusal. In run 2 each refusal is reported as **"refused as
intended: `<the specific check>`"** — the shape is refused by the check written
to catch that shape, and a fault or the wrong check now fails the case.

The two runs print the same line. Only the second one is evidence.

## Environment note — not a repo defect

The local storage-api creates `storage.objects` policies under **different
names** than the hosted database, so the six expected policy names had to be
created locally before `20260916160000_narrow_storage_write_policies.sql` could
apply.

This is a property of the local stack, not of the rollout, and it is the one
place where local and hosted are known to differ in a way that mattered.
**Nothing was changed in that migration**, and the hosted branch will carry the
real policies. Worth remembering as the kind of gap a local stack can hide:
everything here passed *around* a difference that hosted will present for real.

## Status

**Locally verified, clean, at `571b19b6`. Not applied to hosted.**

What remains, and what each step answers:

1. **Hosted branch** — the real-ACL pre-state, the one question local cannot
   answer. The price decision belongs to the human (Project → Branches).
2. **Hosted rollout** by the authorized operator.
3. **Live end-to-end acceptance**, including a person checking a known
   timestamp.

The local `collabboard-verify` stack is disposable:
`supabase stop --project-id collabboard-verify --no-backup`.
