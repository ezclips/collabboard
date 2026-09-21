# PATCH-154 — Stage 4 transcription instrument: faster-whisper baseline, pyVideoTrans challenger

**Status:** approved 2026-09-22 — Phase A authorized and handed off; Phase B NOT authorized (needs an approved corpus)

> Lifecycle note: this is the draft. The **Final Implementation Specification**
> is written only after the owner approves (AI_WORKFLOW.md, patch lifecycle).

> **This patch is an INSTRUMENT, not a feature.** It measures. It ships no
> product code, touches no database, provisions nothing paid, and integrates
> with nothing. Its output is a findings document and a committed raw run.

## Goal
Measure whether we can generate a trustworthy timestamped transcript from
uploaded media, and decide between a minimal faster-whisper worker and the
pyVideoTrans transcription workflow — on evidence, not on preference.

## Reason
Stage 3b ingests transcripts that already exist. The owner has decided that
**videos without captions are in product scope**, and uploaded media is the
first input for that. Nothing in this system transcribes anything today.

Uploaded media is also the capability that **can definitely ship**: it carries
no YouTube acquisition question. That is why it is measured before PATCH-155.

## Why now / why this order
- It is independent of the blocked hosted path. Stage 3b's isolated
  verification, rollout and live acceptance continue on their own track and are
  not gated by this.
- It needs no third-party account and no spend decision.
- PATCH-155 (YouTube acquisition) could produce a perfect technical result we
  still may not deploy, because its permission question is unresolved. Building
  the definitely-deployable capability first is the cheaper order.

## Expected Outcome
One consolidated recommendation: which engine, at what settings, at what cost
per source hour, with which failure modes, and what remains unmeasured. Plus a
committed raw run so the numbers can be re-read rather than re-argued.

## Files to Create
- `tools/transcription-probe/` — the harness, matching the Stage 3a pattern
  (`tools/youtube-caption-probe/`):
  - `probe.mjs` (or equivalent) — orchestrates both candidates over the corpus
  - `corpus.json` — the corpus MANIFEST: id, origin, licence, rights basis,
    duration, language, category. **Media files are never committed.**
  - `last-run.json` — the raw output of the run the findings cite
  - `README.md` — how to reproduce, including every install performed
- `.agent/stage4-transcription-engines.md` — the findings document

## Files to Modify
- none in this patch. `CURRENT_TASK.md` is updated by the CTO at close.

## Files that MUST NOT be touched
Reject on contact. STOP and report if the work appears to require one.

- **anything under `supabase/`** — no schema, no migration, no SQL
- **anything under `lib/`, `app/`, or `components/`** — this patch ships no
  product code, and in particular does not touch the transcript importer,
  `knowledgeTranscriptCitation.ts`, the reader, or the wiki
- `package.json` / `package-lock.json` — no new application dependency. The
  Python side lives OUTSIDE the repo (see Architecture Notes)
- any existing test file
- anything under `.fable5/` or `.claude/`

## Architecture Notes

### Where the instrument runs
faster-whisper and pyVideoTrans are Python; this is a Next.js repo. **Neither
becomes an application dependency.** They are installed in an isolated
environment outside the repo, and what lands in the repo is the harness, the
corpus manifest, the raw run and the findings — exactly the Stage 3a shape.

**Execution profile is unlike PATCH-153 and the owner should know it before
approving:** this installs Python packages and downloads multi-gigabyte model
weights. Record disk used, install locations and anything left behind. Nothing
is installed system-wide without saying so in the report.

### Gate 0 — licensing, BEFORE anything is installed
Assess one specific question, not GPL in general:

> May we run an **unmodified pyVideoTrans CLI as a separate process**,
> internally, on our own infrastructure?

Distinguish that from **copying its code** into ours and from **distributing
it** with our application. GPL-3.0 does not prohibit commercial use, and a
process boundary alone does not settle every integration question.

Also review the licences of the selected **model weights** and of **ffmpeg** as
invoked.

**If the adoption route is unclear, the faster-whisper baseline continues
independently.** An unresolved licence does not stall the measurement that
matters; it removes one candidate from the recommendation.

### Gate 1 — the no-speech gate. BLOCKING.
A candidate that invents speech over silence **fails**, and no other result
redeems it.

This is not a quality preference. We attach **timestamps** to cited passages,
so invented speech becomes a confident, checkable-looking lie at a specific
moment in a video. A wrong character range looks wrong; a wrong timestamp looks
right. Whisper-family models hallucinate on silence and music by documented
habit, which is why this is a gate and not a line in a table.

**Pin the model, decoding settings and VAD configuration BEFORE scoring**, and
report them with every result. faster-whisper exposes a VAD filter; evaluate it
explicitly rather than leaving it at a default nobody recorded.

Negative inputs — any invented speech fails:
1. digital silence
2. room noise (no speech)
3. instrumental music, no vocals

**Positive control — required, and the gate is worthless without it:** quiet
real speech that MUST be transcribed. A pipeline that suppresses everything
would otherwise pass a gate made only of negatives. This is the same shape as
the item-18 adversarial harness, where two positive controls exist so that a
classifier rejecting everything cannot score green.

### Gate 2 — comparison, on equal terms
Same media, equivalent recognition settings wherever the two allow it.
**Disable translation and any optional LLM post-correction** for the baseline;
pyVideoTrans contains post-processing that can rewrite recognised text, and an
enabled rewriter compared against a raw engine is not a comparison.

If pyVideoTrans wins anything, **say where the win comes from**: audio
preprocessing, segmentation, or simply different model settings. A win that is
really a settings difference is a settings change to the baseline, not a reason
to adopt an application.

### The corpus — defined before it is collected
**Possession of a file is not permission to process it.** Ownership, recording
consent and processing rights are separate questions.

- **No personal files.** The two real Word documents on this machine remain
  out of scope for everything, and the same discipline applies here.
- Every clip carries a documented **rights basis** in `corpus.json`.
- **German:** either purpose-recorded speech from consenting participants with
  permission to retain recordings and derived transcripts, or an openly
  licensed corpus named by **exact release and licence**, with the selected
  clips listed. Synthetic speech may supplement; it may not replace real German
  speech.
- Reference excerpts are derived **independently of both engines**. Neither
  engine's output may be ground truth for the other.

Coverage: clear English; clear German; names, numbers, units and negation;
multiple speakers; background noise or music; long pauses; a no-speech control;
a positive quiet-speech control; and one long recording for duration scaling
and timestamp drift.

### Retention of the instrument's own artifacts
Distinguish **temporary working media** from **retained evidence**. Document
what the probe writes, where, and what it deletes. Media is not committed; the
manifest and the raw run are.

## Migration Notes
None. No schema, no data, no deployment.

## Potential Risks
1. **Model download size and disk.** Multi-gigabyte weights. Report actual
   usage and location; stop and ask before consuming unreasonable disk.
2. **A no-speech gate that only rejects.** Mitigated by the positive control
   above — without it, "transcribes nothing" scores perfectly.
3. **pyVideoTrans configuration coupling.** Its recognition modules read shared
   application configuration; extracting a folder is not adopting a library.
   If isolating the transcription task proves impractical, that is itself a
   finding — report it rather than fighting it.
4. **Environment ≠ deployment.** A desktop result does not establish server
   behaviour. Record that as a limitation, as Stage 3a did.

## Commit
  Commit message:
  feat(tools): Stage 4 transcription instrument — measure before choosing

  Stage 3b ingests transcripts that already exist; nothing here transcribes.
  Videos without captions are in product scope, and uploaded media is the first
  input for that -- the capability that can ship regardless of how the YouTube
  acquisition question resolves.

  An instrument, not a feature: no product code, no database, no paid
  infrastructure, no integration. faster-whisper is the baseline because it is
  the engine pyVideoTrans wraps; pyVideoTrans is the challenger and must show a
  measured benefit worth a larger runtime and a GPL-3.0 dependency, given that
  the features we exclude are most of what it does.

  Two gates before any comparison. Licensing is assessed first, scoped to
  running an unmodified CLI as a separate internal process rather than to GPL
  in general, so an unclear answer removes a candidate instead of stalling the
  work. The no-speech gate is blocking: we attach timestamps to citations, so
  invented speech over silence is a confident lie at a precise moment, and a
  wrong timestamp looks right in a way a wrong character range never does. It
  carries a quiet-real-speech positive control, because a gate built only from
  negatives is passed by a pipeline that transcribes nothing.

  Corpus rights are settled before collection: possession of a file is not
  permission to process it, no personal files, and references derived
  independently of both engines.

## Rollback Plan
Delete `tools/transcription-probe/` and the findings document, and uninstall
the external Python environment per the README. Nothing in the application
changes, so there is nothing to revert in product code.

## Acceptance Criteria
1. Gate 0 reports a scoped licensing answer, or reports it unresolved AND the
   faster-whisper baseline still completes.
2. Gate 1 is applied to the complete pipeline of each candidate, with model,
   decoding and VAD settings pinned and reported. Any invented speech on the
   three negative inputs = FAIL for that configuration.
3. The quiet-speech positive control is transcribed. A candidate failing it has
   not passed Gate 1.
4. Every corpus clip carries a documented rights basis; no personal files.
5. German results are reported separately from English.
6. Reference excerpts are independent of both engines.
7. Any pyVideoTrans advantage is attributed to preprocessing, segmentation or
   model settings.
8. Cost per source hour, processing time per source minute, peak memory and
   disk are reported for both.
9. `last-run.json` is committed and the findings cite it.
10. Limitations are stated explicitly, including that desktop results do not
    establish server behaviour.
11. **One consolidated report.** Not a sequence of partial approvals.

## Required Tests
None in the vitest sense — this patch adds no application code. The gate below
is a regression check that the instrument changed nothing.

## Verification
```
npx vitest run            # failing FILE SET identical to the pre-edit capture
npx tsc --noEmit          # exit 0
npm run check:boundaries  # identical to the pre-edit capture (currently 2 pre-existing errors)
git status --porcelain    # no unexpected product-code changes
git log --oneline -1
```

A pre-edit capture of all three is taken BEFORE any edit and pasted alongside.

## Estimated Difficulty
medium — the measurement is not hard; the discipline is. The risk is a
plausible number produced by an unrecorded configuration.

---

## Recorded now, implemented later — provenance integration

**Not this patch.** Recorded so it is not rediscovered.

`KNOWLEDGE_TRANSCRIPT_DISCLOSURE` currently reads *"User-provided transcript.
The video association is the importer's claim and has not been verified."* It
is shipped in the reader, the citation link, and — since PATCH-153 — on wiki
pages.

A future product patch must make the disclosure **origin-aware** across all
three surfaces, distinguishing: creator-provided captions, YouTube-generated
captions, transcripts from our own engine, and user-provided transcripts. The
existing wording is **preserved for manual imports**. A machine-generated
transcript records its engine, model version, actual language and processing
configuration, and says so — *"Machine-generated transcript; may contain
recognition errors."*

**A machine transcript must never be labelled user-provided merely because it
shares the importer.**

## Recorded now, resolved before rollout — storage lifecycle

**Not this patch.** Followups item 19 already records that superseded
transcript payloads have no sweep. Uploaded media is orders of magnitude
larger, and cancellation and failure both leave artifacts.

Before any product rollout of uploaded-media transcription, item 19 and
uploaded-media retention are resolved **together**: cancellation and failure
cleanup, retention periods for original media and derived transcripts, and safe
collection of superseded objects — which item 19 already says needs a grace
period plus a fresh reference check at deletion time. The instrument does not
implement the sweep; it documents its own artifacts.

---

# Final Implementation Specification

**Approved by the owner 2026-09-22.** Execute this section EXACTLY. Everything
above it is context. Where this section and the context disagree, this section
wins; if the disagreement looks like a defect rather than a refinement, STOP and
report.

## Execution is in two phases. Phase A is authorized now. Phase B is not.

**Phase B cannot run yet** — it needs a corpus that does not exist, whose rights
basis is an owner decision. Do not begin it. Do not collect media. Do not
download model weights.

**One consolidated report still applies**: the recommendation is delivered once,
at the end of Phase B. Phase A produces decision inputs, not a recommendation.

---

# PHASE A — authorized

Three deliverables. No Python is installed, no model is downloaded, no media is
collected, and nothing is benchmarked.

## A1 — Gate 0: gather the licensing facts. Do NOT conclude.

Produce a findings section that **quotes sources and stops**. You are gathering
evidence for a decision the CTO drafts and the owner takes. Do not write "we
can" or "we cannot".

Gather, with exact quotes and links:
1. The pyVideoTrans licence as published in its repository (confirm GPL-3.0 and
   the exact file).
2. The faster-whisper licence (confirm MIT and the exact file).
3. The licence of the model weights each candidate would use by default — this
   is separate from the code licence and is frequently different.
4. ffmpeg's licensing as typically distributed, noting that GPL and LGPL builds
   differ.
5. The FSF's own published position on the distinction between **running** an
   unmodified GPL program as a separate process for internal use, **copying**
   its code into another program, and **distributing** it.

Then state, as three labelled questions with the evidence under each and **no
answer**:
- Q1: running an unmodified pyVideoTrans CLI as a separate process, internally
- Q2: copying any of its code into our application
- Q3: distributing it with our application

**Rule 9 still applies**: if you find a licence that forbids commercial use
outright, report it immediately.

## A2 — the harness, runnable but unrun

Create `tools/transcription-probe/`, matching the shape of the existing
`tools/youtube-caption-probe/`:

- **`corpus.json`** — the MANIFEST SCHEMA plus the entries you can fill from A3.
  Every entry carries: `id`, `category`, `language`, `durationSeconds`,
  `origin` (where it came from), `licence`, `rightsBasis` (why we may process
  it), `referenceTranscriptPath` (may be null until a human supplies it).
  **Media files are never committed and never referenced by absolute path
  outside the probe's own working directory.**
- **`probe.mjs`** — the orchestrator. It must:
  - read `corpus.json` and refuse to run on any entry lacking `rightsBasis`
  - invoke each candidate as an external process
  - record, per clip per candidate: the pinned model, decoding settings and VAD
    configuration; wall-clock processing time; peak memory; the produced
    segments with timings
  - write `last-run.json` with all of it, including a `configuration` block
  - **not** score accuracy. Scoring compares against human references that do
    not exist yet.
- **`README.md`** — how to reproduce, what gets installed, where, how much disk,
  and how to remove it. Written for someone who has not read this patch.

`probe.mjs` must run and exit cleanly against an EMPTY corpus, reporting that
there is nothing to measure. That is its Phase A acceptance test.

## A3 — propose the corpus, do not collect it

Research and propose, for the owner to approve:

- **Openly licensed speech corpora** that could supply the English and German
  clips. For each: exact name, exact release/version, exact licence, where it is
  hosted, and whether it permits our use. Name candidate clips by identifier
  where the corpus allows.
- Which categories an open corpus can cover, and which it cannot. The patch
  requires: clear English; clear German; names/numbers/units/negation; multiple
  speakers; background noise or music; long pauses; a no-speech control; a
  **quiet-speech positive control**; one long recording.
- The gap: state plainly which categories would need purpose-recorded audio
  from consenting participants, because that is the part the owner must supply.

**Collect nothing.** Propose only. No downloads.

---

# PHASE B — NOT authorized. Do not begin.

Listed so the shape is known. It starts only on a separate owner approval that
names the approved corpus.

B1. Install the external Python environment per the README; report disk used and
    install locations.
B2. Download the pinned models; report sizes.
B3. Run Gate 1 (no-speech) on the complete pipeline of each candidate, with the
    three negative inputs and the quiet-speech positive control. **Blocking.**
B4. Run Gate 2 comparison on equal settings, translation and LLM
    post-correction disabled.
B5. Measure cost per source hour, time per source minute, peak memory, disk.
B6. Write `.agent/stage4-transcription-engines.md` and commit `last-run.json`.

---

## Verification — Phase A

Before any edit, capture and paste:

```
npx vitest run
npm run check:boundaries
```

After:

```
npx vitest run            # failing FILE SET identical to the capture
npx tsc --noEmit          # exit 0
npm run check:boundaries  # identical to the capture (2 pre-existing errors)
node tools/transcription-probe/probe.mjs   # exits cleanly on an empty corpus
git status --porcelain
git log --oneline -1
```

Paste REAL, COMPLETE output for every one (handoff rule 6).

## Stop conditions

STOP and report, leaving the tree clean, if:
- any work appears to require a file on the MUST NOT list
- you are tempted to install Python, download a model, or fetch media — that is
  Phase B and it is not authorized
- you cannot answer a licensing question from a primary source. Report the gap;
  do not infer a licence
- an openly licensed corpus cannot cover a required category. That is a finding,
  not a problem to solve by substituting something convenient

## Commit

Use the `## Commit` message in this patch file verbatim, with this single
addition as its final line:

    Phase A only: licensing evidence, harness, corpus proposal. Nothing
    installed, nothing downloaded, nothing measured.
