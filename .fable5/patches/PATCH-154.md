# PATCH-154 — Stage 4 transcription instrument: faster-whisper baseline, pyVideoTrans challenger

**Status:** draft — awaiting owner approval

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
