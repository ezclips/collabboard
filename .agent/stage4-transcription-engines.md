# Stage 4 — transcription engines: Phase A package

**PATCH-154, Phase A.** An instrument, not a feature: no product code, no
database, no paid infrastructure, no integration.

**Status: Phase A complete. Phase B NOT STARTED and not authorized.**

Phase A produces decision inputs. The single consolidated measurement
recommendation is delivered after Phase B, against an owner-approved corpus.
Nothing was installed, downloaded, collected or benchmarked to produce this
document.

- Harness: `tools/transcription-probe/` — `probe.mjs`, `corpus.json`, `README.md`
- Raw run: `tools/transcription-probe/last-run.json` — **status UNRUN; see §5**

---

## 1. Gate 0 — licensing

**EVIDENCE ONLY. This section reaches no conclusion.** It delivers
**(a) exact quotes with links and file names**, **(b) three labelled questions
with the evidence under each and no answer**, and **(c) the licences that could
not be confirmed from a primary source**. The recommendation is written by the
CTO and taken by the owner, deliberately not argued here.

### 1a. Evidence — exact quotes

**pyVideoTrans — the CODE.** `https://github.com/jianchang512/pyvideotrans`,
file `LICENSE`, is the **GNU General Public License, Version 3, 29 June 2007**,
verbatim:

> ```
>                     GNU GENERAL PUBLIC LICENSE
>                        Version 3, 29 June 2007
> ```

README badge: `License: GPL v3`. The two clauses the analysis turns on, quoted
from that file:

§0 — the definitions:

> To "propagate" a work means to do anything with it that, without permission,
> would make you directly or secondarily liable for infringement under
> applicable copyright law, **except executing it on a computer or modifying a
> private copy**. […] To "convey" a work means any kind of propagation that
> enables other parties to make or receive copies. **Mere interaction with a
> user through a computer network, with no transfer of a copy, is not
> conveying.**

§2 — Basic Permissions:

> This License explicitly affirms your unlimited permission to **run the
> unmodified Program**. […] You may make, run and propagate covered works that
> you do not convey, without conditions so long as your license otherwise
> remains in force.

**faster-whisper — the CODE.** `https://github.com/SYSTRAN/faster-whisper`,
file `LICENSE`:

> ```
> MIT License
>
> Copyright (c) 2023 SYSTRAN
> ```

**The MODEL WEIGHTS** — a separate question from the code, as the patch says.
The baseline's default, `Systran/faster-whisper-large-v3`, states on its card:

> ```
> License: mit
> ```

> This repository contains the conversion of
> [openai/whisper-large-v3](https://huggingface.co/openai/whisper-large-v3) to
> the [CTranslate2](https://github.com/OpenNMT/CTranslate2) model format.

**The weights did NOT differ from the code licence**, contrary to the patch's
expectation that it is "frequently different". The unresolved half is the
**upstream** `openai/whisper-large-v3` card, named but not read here.

**ffmpeg — as typically distributed.** `https://www.ffmpeg.org/legal.html`:

> FFmpeg is licensed under the [GNU Lesser General Public License (LGPL) version
> 2.1] or later. However, FFmpeg incorporates several optional parts and
> optimizations that are covered by the [GNU General Public License (GPL)
> version 2] or later. **If those parts get used the GPL applies to all of
> FFmpeg.**

> Note that FFmpeg is not available under any other licensing terms, especially
> not proprietary/commercial ones, not even in exchange for payment.

The GPL/LGPL split is a property of the **BUILD**, not of the name "ffmpeg".
Items 1, 2 and 18 of the same page's compliance checklist separate them:

> 1. Compile FFmpeg **without** "--enable-gpl" and **without** "--enable-nonfree".
> 2. Use dynamic linking […] for linking with FFmpeg libraries.
>
> 18. Make sure your program is not using any GPL libraries (notably libx264).

**The FSF's published position** (`https://www.gnu.org/licenses/gpl-faq.html`):

Running, without distributing (`#NoDistributionRequirements`):

> Nothing. The GPL does not place any conditions on this activity.

Internal use in one organisation (`#InternalDistribution`):

> No, in that case the organization is just making the copies for itself. […]
> However, when the organization transfers copies to other organizations or
> individuals, that is distribution. In particular, providing copies to
> contractors for use off-site is distribution.

Running a modified version internally (`#UnreleasedMods`):

> The GPL permits anyone to make a modified version and use it without ever
> distributing it to others. […] The situation is different when the modified
> program is licensed under the terms of the GNU Affero GPL.

Incorporating GPL code into a proprietary system (`#GPLInProprietarySystem`):

> You cannot incorporate GPL-covered software in a proprietary system. […] A
> system incorporating a GPL-covered program is an extended version of that
> program.

> However, in many cases you can distribute the GPL-covered software alongside
> your proprietary system. To do this validly, you must make sure that the free
> and nonfree programs **communicate at arms length**, that they are not
> combined in a way that would make them effectively a single program.

The single-work line (`#MereAggregation`) — the passage the separate-process
argument rests on:

> Where's the line between two separate programs, and one program with two
> parts? This is a legal question, which ultimately judges will decide. **We
> believe that a proper criterion depends both on the mechanism of communication
> (exec, pipes, rpc, function calls within a shared address space, etc.) and the
> semantics of the communication (what kinds of information are interchanged).**
> […] **By contrast, pipes, sockets and command-line arguments are communication
> mechanisms normally used between two separate programs.** […] But if the
> semantics of the communication are intimate enough, exchanging complex internal
> data structures, that too could be a basis to consider the two parts as
> combined into a larger program.

Containers (`#AggregateContainers`):

> No, the analysis of whether they are a single work or an aggregate is
> unchanged by the involvement of containers.

**One quotation that belongs in the record without interpretation.** The
pyVideoTrans README's Disclaimer reads:

> This software is an open-source, free, **non-commercial project**. Users are
> solely responsible for any legal consequences arising from the use of this
> software (including but not limited to calling third-party APIs or processing
> copyrighted video content).

GPL-3.0 does not prohibit commercial use, and the FSF FAQ states that *"the GPL
allows everyone"* to sell copies. Both statements are in the same repository.

### 1b. The three labelled questions, with evidence under each and NO ANSWER

This section deliberately does not conclude. The recommendation is written by the
CTO and taken by the owner; a licensing opinion is not a coding deliverable and
does not arrive already argued. **No "we can" or "we cannot" appears here.**

#### Q1 — Running an unmodified pyVideoTrans CLI as a separate process, internally, to measure it

**Evidence on the running side.** GPL-3.0 §2 affirms *"your unlimited permission
to run the unmodified Program"*, and *"You may make, run and propagate covered
works that you do not convey, without conditions so long as your license
otherwise remains in force."* §0 defines propagating to **exclude** *"executing
it on a computer or modifying a private copy"*. The FSF FAQ
`#NoDistributionRequirements` answers *"Nothing. The GPL does not place any
conditions on this activity."* `#InternalDistribution` confirms internal use
within one organisation is not distribution, while adding that *"providing
copies to contractors for use off-site is distribution."*

**Evidence on the separate-process side.** `#MereAggregation` gives the
criterion: *"a proper criterion depends both on the mechanism of communication
(exec, pipes, rpc, function calls within a shared address space, etc.) and the
semantics of the communication (what kinds of information are interchanged)"*,
and states that *"pipes, sockets and command-line arguments are communication
mechanisms normally used between two separate programs"*, with the caveat that
*"if the semantics of the communication are intimate enough, exchanging complex
internal data structures, that too could be a basis to consider the two parts as
combined into a larger program."* The FAQ also states that this line *"is a legal
question, which ultimately judges will decide."* `#AggregateContainers` adds that
*"the analysis of whether they are a single work or an aggregate is unchanged by
the involvement of containers."*

**Evidence NOT gathered.** Whether our specific invocation would be "unmodified"
in the licence's sense; whether the semantics of the communication between our
server and the CLI would stay at arm's length under the FAQ's two-part criterion;
whether any part of our infrastructure or personnel arrangement would reach the
*"contractors for use off-site"* carve-out.

#### Q2 — Copying any of its code into our application

**Evidence.** `#GPLInProprietarySystem`: *"You cannot incorporate GPL-covered
software in a proprietary system"*; *"A system incorporating a GPL-covered
program is an extended version of that program."* GPL-3.0 §5 requires a
modified or conveyed work to be licensed *"as a whole, under this License"*. §13
addresses combination with AGPLv3 code, carrying that licence's network clause.
`#MereAggregation`: *"If the modules are included in the same executable file,
they are definitely combined in one program. If modules are designed to run
linked together in a shared address space, that almost surely means combining
them into one program."*

**Evidence NOT gathered.** Which parts of pyVideoTrans would be candidates for
copying, and whether our product is a "proprietary system" in the sense that FAQ
answer uses. Neither the licence text nor the FAQ speaks to our specific
distribution posture.

#### Q3 — Distributing it with our application

**Evidence.** `#GPLInProprietarySystem`: *"in many cases you can distribute the
GPL-covered software alongside your proprietary system. To do this validly, you
must make sure that the free and nonfree programs communicate at arms length,
that they are not combined in a way that would make them effectively a single
program"*, and on form: *"if they know that what they have received is a free
program plus another program, side by side, their rights will be clear."*
`#MereAggregation` permits an aggregate *"even when the licenses of the other
software are nonfree or GPL-incompatible"*, subject to *"you cannot release the
aggregate under a license that prohibits users from exercising rights that each
program's individual license would grant them."* GPL-3.0 §4–6 impose source and
notice obligations on any conveyance.

**Evidence NOT gathered.** Whether any intended distribution model would reach
the threshold of "conveying" at all; whether a hosted service counts, given that
GPL-3.0 has no network clause while AGPL does (§13, `#UnreleasedMods`); what
notice and corresponding-source obligations a chosen model would trigger.

### 1c. Remaining uncertainty — licences NOT confirmed from a primary source

Required, and separate from the questions above. **An unconfirmed licence
recorded as confirmed is the failure that matters here**, so each is stated
explicitly rather than hedged in a parenthesis.

**Confirmed from primary sources (quoted above):**
- pyVideoTrans code — GPL-3.0, read verbatim from its `LICENSE`.
- faster-whisper code — MIT, read verbatim from its `LICENSE`.
- `Systran/faster-whisper-large-v3` weights — `License: mit`, read from its model
  card. **Note: this did NOT differ from the code licence, contrary to the
  patch's expectation that it "frequently" does.**
- ffmpeg — LGPL-2.1-or-later with GPL-2.0-or-later optional parts, read from
  ffmpeg.org/legal.html.
- The five FSF FAQ answers quoted above, with anchors.

**NOT confirmed from a primary source — each an open question:**
1. **`openai/whisper-large-v3`** — the upstream model the local conversion is made
   from. Named in the conversion note; its card was **not opened**. Its licence is
   unknown here.
2. **The exact licence of each OpenSLR corpus** (SLR12, SLR31, SLR94, SLR95,
   SLR16, SLR17, SLR100). The licence lines in this document were read from the
   **OpenSLR resource index**, not from each corpus's own licence file. Several
   are marked *verify at approval time* on that basis.
3. **SLR155 (Santa Barbara Corpus of Spoken American English)** — the resource
   index line was **not** read either. Listed as a candidate only; its licence is
   entirely unconfirmed.
4. **The ffmpeg build we would actually use** — LGPL vs GPL is a **build flag**
   (`--enable-gpl`), not a property of the name. No build has been pinned.
5. **Model weights for any non-default engine** pyVideoTrans might select by
   default — only its default local faster-whisper path was traced.

**One fact recorded without interpretation.** The pyVideoTrans README's Disclaimer
states the project is *"an open-source, free, **non-commercial project**"*,
while its `LICENSE` is GPL-3.0 and the FSF FAQ states the GPL *"allows everyone"*
to sell copies. Both statements are in the same repository. Recorded as a fact,
not resolved as a conclusion.

**Rule 9 check: no licence was found that forbids commercial use outright.** Had
one been found it would be reported here as a fact, not a conclusion.

---

## 2. Gate 1 and Gate 2 — defined, not run

**Neither gate has been run.** Both are pinned in `probe.mjs` under
`CONFIGURATION`, so that when Phase B runs, the settings travel with the results.

**Gate 1 — the no-speech gate. BLOCKING.** Three negative inputs (digital
silence; room noise, no speech; instrumental music, no vocals) plus a
**quiet-real-speech positive control**. The positive control is not decoration: a
gate made only of negatives is passed perfectly by a pipeline that transcribes
nothing — the same defect shape as the item-18 adversarial harness that reported
`ALL PASS` from a classifier that could not run at all.

**Gate 2 — comparison on equal terms.** Same media, equivalent recognition
settings, **translation and any optional LLM post-correction disabled** for both.
Any pyVideoTrans win must be attributed to audio preprocessing, segmentation, or
model settings — *a win that is really a settings difference is a settings change
to the baseline, not a reason to adopt an application.*

### The two controls, and why they are never pooled

- **`quiet-speech-positive-control`** — NATURALLY quiet speech, purpose-recorded.
  This is the **Gate 1 acceptance case**.
- **`attenuated-speech-supplementary`** — a normal-level clip reduced in gain. A
  **supplementary robustness test of low signal level only**. It is explicitly
  **NOT an acceptance case** and **MUST NOT satisfy the Gate 1 positive
  control**.

Attenuation reduces level; it does not reproduce the articulation, breath support
or room acoustics of naturally quiet speech. Articulation and room acoustics
differ, not just level. Results are reported separately and never merged into the
acceptance verdict.

---

## 3. The corpus — proposed, not collected

**No media was collected, downloaded or referenced.** `corpus.json` ships with an
empty `clips` array and a `proposedSources` section.

### 3.1 The eight assessed sources

| # | Source | Exact release | Licence | Hosted at | Languages | What it covers |
|---|---|---|---|---|---|---|
| 1 | LibriSpeech ASR corpus | SLR12 | CC BY 4.0 | openslr.org/12 | en | clear English, long recording |
| 2 | Mini LibriSpeech | SLR31 | CC BY 4.0 | openslr.org/31 | en | clear English (small subset of #1) |
| 3 | Multilingual LibriSpeech (MLS) | SLR94 | CC BY 4.0 (verify per-language README) | openslr.org/94 | en, de, … | clear English **and** clear German |
| 4 | Thorsten Müller German Neutral-TTS | SLR95 | CC BY 4.0 (verify) | openslr.org/95 | de | clear German (single speaker, >23 h) |
| 5 | The AMI Meeting Corpus | SLR16 | CC BY 4.0 (verify) | openslr.org/16 | en | multiple speakers, room noise |
| 6 | MUSAN | SLR17 | CC BY 4.0 (verify) | openslr.org/17 | n/a | noise/music beds to mix under speech |
| 7 | Multilingual TEDx | SLR100 | CC BY 4.0 (verify) | openslr.org/100 | en, de, … | talk-register English/German |
| 8 | Santa Barbara Corpus of Spoken American English | SLR155 | **not confirmed** | openslr.org/155 | en | conversational speech — **candidate only** |

Licence lines marked *verify* were read from the OpenSLR resource index and must
be confirmed from each corpus's own licence file before selection. **#8 is listed
as a candidate only** — its licence was not confirmed from a primary source, and
inferring one is forbidden by the patch.

### 3.2 What the assessed sources cover

Clear English (#1, #2, #3, #7), clear German (#3, #4, #7), a long recording for
duration scaling and timestamp drift (#1, #3, #4), multiple speakers in one
recording (#5, #8 if its licence clears), and background noise/music **as a
mixing source** (#6 — the mixing act itself needs owner approval).

### 3.3 The gaps — restated per amendment 2, evidence under each

**Claim strength, deliberately weak.** Eight sources were assessed. The
defensible statement is *"the eight sources assessed do not supply a suitable
example, and here is the evidence for each"* — **not** *"an open corpus cannot
supply this."* A broader corpus may exist that was not surveyed; that is a
research gap, not a factual claim about all corpora. Where a stronger claim is
supportable for a **specific** gap, it is made there with its evidence attached.

#### Gap 1 — no-speech control

**Claim:** the eight sources assessed do not supply a suitable
room-noise-no-speech control for our capture environment.

**Evidence:** #1, #2, #3, #4, #7 are read or talk **speech** corpora — every clip
contains speech by construction; that is what a speech corpus is. #5 (AMI) is
meeting-room audio, but room tone exists only as a by-product inside clips that
also contain speech, not as a clean no-speech segment. #8 same reason, licence
also unconfirmed. **#6 (MUSAN) is the closest fit and was checked in detail:** its
music subset is instrumental music, a legitimate Gate 1 negative input — but it is
music the corpus chose, not our audio path; its noise subset is generic, not a
recording of our capture environment.

**Why what they contain does not fit:** MUSAN's **music** subset does satisfy the
"instrumental music, no vocals" negative as a test input, and that is **not a
gap**. What none of the eight supplies is a clean no-speech **room** recording
from the environment the product will actually capture in.

**Stronger claim:** not supported.

**Owner must supply:** digital silence (generable locally, no rights issue) and a
real no-speech room recording from the eventual capture environment. MUSAN music
may be used for the instrumental negative.

#### Gap 2 — quiet-speech positive control

**Claim:** the eight sources assessed do not supply naturally quiet real speech,
which is the Gate 1 acceptance control.

**Evidence:** #1, #2, #3, #7 are read audiobook and talk speech recorded at
normal level for intelligibility — that is the point of a corpus for ASR. #4 is
studio-optimised TTS-reference speech, normal level by construction. #5, #8 are
spontaneous speech recorded to be intelligible in meetings and interviews. #6 is
noise and music, no speech at all.

**Why what they contain does not fit:** naturally quiet speech differs from
normal-level speech in articulation and breath support, not only in level. No
assessed corpus records that condition, and re-gaining a normal clip in post is a
**synthetic manipulation of level**, not a recording of the phenomenon. Retained
as its own category (`attenuated-speech-supplementary`) so it is never mistaken
for this one.

**Stronger claim — SUPPORTED FOR THIS GAP:** a corpus recorded *for
intelligibility* does not, by definition, contain the quiet-speech condition. The
claim is made per-gap, not across all four.

**Owner must supply:** NATURALLY quiet speech, purpose-recorded, with an
independently derived reference transcript. **Nothing may substitute for it.**

#### Gap 3 — names, numbers, units, negation

**Claim:** the eight sources assessed do not supply clips *chosen* for names,
spoken numbers, units and negated statements with a reference verified to contain
them.

**Evidence:** #1, #2, #3, #4 are prose (audiobooks) or studio sentences — numbers
occur by chance in a narrative. #7 is talk register; speakers say numbers
incidentally and the corpus does not select or classify for them. #5, #8 are
conversation, same reason. Checked against what the category needs: clips
**chosen** to contain these phenomena. None of the eight publishes such a
selection, and one cannot be assembled by grepping a reference without a human
deciding which occurrences are the interesting ones.

**Why what they contain does not fit:** prose and talks contain these phenomena
incidentally and unboundedly; the category needs them deliberately and
enumerated. That is a selection act, not a property of a corpus.

**Stronger claim:** not supported.

**Owner must supply:** purpose-recorded scripted speech in both English and
German, **or** a human-curated selection from a corpus whose reference a second
person has verified contains them.

#### Gap 4 — consent and retention provenance for purpose-recorded audio

**Claim:** no corpus among the eight can supply the consent record that
purpose-recorded audio requires. This is a property of the recording method, not
a research gap.

**Evidence:** a consent record is an artifact **we** hold. OpenSLR licences
(CC BY 4.0 where confirmed) are the corpus's own grant; they say nothing about
our obligations to a participant we record ourselves.

**Why what it contains does not fit:** not a coverage question. CC BY 4.0 covers a
corpus clip; it cannot cover audio we record, because the participant's permission
is a separate act.

**Stronger claim — SUPPORTED, and categorical:** no dataset can contain our
consent record for a recording made after the dataset exists.

**Owner must supply:** a consent record per speaker, plus retention terms for
both recording and derived transcript — see §4.

**No personal files.** The two real Word documents on this machine remain out of
scope, and the same discipline applies to media.

---

## 4. Recording request — the gaps an open corpus does not cover

Specific enough to act on without reading the patch. Everything here is
**purpose-recorded**, and everything here needs the consent in §4.4.

### 4.1 What to record

| # | Gap it fills | Language | Scenario / script | Speakers | Target duration |
|---|---|---|---|---|---|
| R1 | quiet-speech-positive-control | **en**, and **de** if resources allow | A person speaking **naturally and quietly**, as one does late at night near a sleeping child — NOT whispering, NOT a gain-adjusted normal take. Read a short factual passage, then speak off-script about their day for the same length. | 1 per language | 3–5 min per language, recorded in one take |
| R2 | names-numbers-units-negation | **en** | Scripted list, read aloud at normal level: personal and place names (incl. ones a recogniser is likely to misspell); spoken integers, decimals and years; units ("twenty ends per inch", "135 newton-metres", "18.5 kilometres"); and **negations** ("the pump does not prime", "it was not the left-hand thread"). ≥60 items per language. | 1–2 per language | 8–12 min per language |
| R3 | names-numbers-units-negation | **de** | Same structure as R2, in German, including numerals read as words ("einhundertfünfunddreißig") and negations ("die Pumpe fördert nicht", "es war nicht das Linksgewinde"). ≥60 items. | 1–2 | 8–12 min |
| R4 | no-speech-control | n/a | **Room tone in the eventual capture environment**: 3+ minutes with nobody speaking, same microphone, gain and room as the product would see. Plus a second take with a laptop fan / HVAC audible. | none | 3+3 min |
| R5 | long-recording (drift) | **en** | One continuous recording ≥30 min — a single speaker reading or talking without a break — to measure duration scaling and timestamp drift. | 1 | ≥30 min |

**Total: roughly 60–75 minutes of new audio**, plus the room tone. Digital silence
for the first Gate 1 negative is generable locally at zero cost and needs no
recording session.

### 4.2 How many speakers, and what "multiple speakers" still needs

R1–R5 are single-speaker by design except where noted. The **multiple-speakers**
category is expected to come from AMI (#5) or SBCSAE (#8) once its licence
clears — **not** from this recording request. If neither clears, add: **R6 — two
speakers in natural conversation, 10–15 min, one take, occasional overlap**,
which is the hardest reference to produce and should be attempted only if the
corpus route fails.

### 4.3 How the reference transcript gets produced — and by whom

The reference must be derived **independently of both engines**. Neither
faster-whisper nor pyVideoTrans output may be ground truth for the other, so the
reference cannot come from either.

**Procedure:**

1. **A human transcribes R1–R3 and R5** (or R6) from the audio, listening only —
   no ASR tool of any kind, on penalty of invalidating the reference. Scripted
   material (R2, R3) is transcribed from the script AND verified against the
   audio, because a reader makes mistakes the script does not contain.
2. **A second person checks it** against the audio, at minimum for R1 (the
   acceptance case) and any clip used for a gate verdict. The checker is a
   different person from the transcriber.
3. **Timestamps**: the human marks segment boundaries with the audio visible in
   an editor. For R1 and R5 the segment granularity can be coarse (≥5 s) — the
   gate is about *whether speech was invented*, not sub-second alignment. For R2
   and R3, mark each scripted item's start and end.
4. **Store as** `referenceTranscriptPath` per clip, with `referenceDerivedBy`
   naming **who** transcribed, **who** checked, the date, and the statement *"no
   ASR engine was used."* That field exists for exactly this audit.

**Acceptance threshold for Gate 1** is *not* WER: it is **zero invented speech on
the negatives, and the positive control transcribed at all**. WER belongs to
Gate 2's comparison.

### 4.4 Consent wording — required for every person recorded

Each participant signs (or records on the audio) a statement covering:

- permission to **record** their voice;
- permission to **retain** the recording;
- permission to **retain and use** the **derived transcript**, including its use
  to evaluate third-party transcription software;
- permission for the audio to be processed by **locally installed** speech
  recognition models during evaluation;
- the **retention terms** below, including deletion on request.

No participant should be recorded before this is signed. Purpose-recorded audio
with no consent record fails the probe's own `rightsBasis` gate by design.

### 4.5 Retention terms for both the recording and the derived transcript

The owner sets the final terms. The instrument's recommendation:

- **Recording (temp)**: retained only for the evaluation window, then deleted.
  Media is never committed to the repository and never addressed by an absolute
  path outside `tools/transcription-probe/media/`.
- **Derived transcript (retained evidence)**: committed to the repo as the
  reference, since it is small, and it is what the measurements are checked
  against.
- **Participant deletion on request**: overrides both. If a participant asks for
  their recording to be removed, the recording is deleted and the derived
  transcript is withdrawn from the manifest — the affected results are re-run
  without them instead of being silently kept.
- **Written down** per clip in the manifest, so the agreement is traceable to the
  file that used it.

Distinguish **temporary working media** from **retained evidence**; the probe
writes only the manifest and `last-run.json`, and commits neither media nor a
reference it did not receive.

---

## 5. The harness, and an empty-corpus run that is NOT a measurement

`probe.mjs` runs on the empty corpus and exits 0. **This proves the harness
executes and the rights-basis refusal works. It proves nothing about recognition
quality.**

`last-run.json` now carries a **top-level `status`** so that cannot be misread:

```json
{
  "status": "UNRUN -- no media processed, no measurements taken",
  "statusMeaning": {
    "recognitionQualityEvaluated": false,
    "gate1NoSpeech": "NOT EVALUATED -- a run with no media cannot test invented speech over silence",
    "gate2Comparison": "NOT EVALUATED -- no engine was invoked, so there is nothing to compare",
    "emptyCorpusRunSatisfiesGates": false,
    "note": "An empty-corpus run demonstrates the harness executes and the rights-basis refusal works. It is not a measurement and must never be reported as one."
  },
  "results": [],
  "nothingToMeasure": true
}
```

Anyone opening that file must see **"not measured"**, not an absence they could
read as a pass.

```
node tools/transcription-probe/probe.mjs
# nothing to measure: corpus.json has no clips.
# ...
# wrote tools/transcription-probe/last-run.json
```

A clip with no `rightsBasis` is refused, exit 1:

```
! the manifest cannot be run:
    clips[0] (x): REFUSED -- no rightsBasis. Possession of a file is not permission to process it.
```

---

## 6. Phase B pre-approval inventory

**This is an inventory to be approved, not a plan being executed.** Phase B begins
only on a separate owner approval that names the approved corpus. **Nothing in
this section has been installed, downloaded, fetched or run.** Package versions
and model sizes below are the ones Phase B *would* use and are stated as the
basis for approval; anything unverifiable is labelled as such rather than
estimated silently.

### 6.1 The exact corpus Phase B would measure

Two tiers, because the open-corpus clips and the purpose-recorded clips come from
different places and carry different rights bases.

**Tier 1 — open corpus (owner must confirm each licence before download).**

| Category | Source (exact release) | Named clips where the corpus allows | Licence |
|---|---|---|---|
| clear-english | LibriSpeech **SLR12**, `dev-clean` | 8 utterances, speaker-disjoint, e.g. `1272-128104-0000` … `1272-128104-0007` (exact ids fixed at approval from `dev-clean/`'s `SPEAKERS.TXT` + chapter listing) | CC BY 4.0 |
| clear-english (long) | LibriSpeech **SLR12**, one full chapter | one chapter from `dev-clean`, ≥20 min, e.g. chapter `1272/128104` | CC BY 4.0 |
| clear-german | Multilingual LibriSpeech **SLR94**, `de` | 8 utterances, ids fixed at approval from the `de` subset listing | CC BY 4.0 **(verify from the corpus README)** |
| clear-german (long) | Thorsten Müller **SLR95** | one continuous segment ≥20 min, id fixed at approval | CC BY 4.0 **(verify)** |
| multiple-speakers | AMI **SLR16**, one meeting | one meeting id fixed at approval | CC BY 4.0 **(verify)** |
| background-noise-or-music | MUSAN **SLR17**, noise + music subsets | 2 music clips (Gate 1 negative) + 2 noise beds (mix source) | CC BY 4.0 **(verify)** |

**Clips that no assessed source supplies (Tier 2 — purpose-recorded, see §4):**
`quiet-speech-positive-control` (R1), `names-numbers-units-negation` (R2, R3),
`no-speech-control` room tone (R4), and the long-recording-second-language case if
needed. `attenuated-speech-supplementary` is produced by gain-reducing one Tier 1
normal clip (R2 or a LibriSpeech clip), labelled distinctly and never pooled.

**Total clip count Phase B would run: ~26**
(8 en + 1 long en + 8 de + 1 long de + 1 meeting + 2 music + 2 noise-mix +
R1 en + R1 de + R2 + R3 + R4 ×2 + 1 attenuated + 1 extra).

**Licences NOT confirmed from a primary source** (see §1c): every SLR94/SLR95/
SLR16/SLR17 line above; the SLR12/CC BY 4.0 line is from the OpenSLR index.
**These must be confirmed before download, and if any fails to clear, that source
is dropped rather than substituted.**

### 6.2 Software installs and model downloads Phase B would perform

Stated per candidate. **None of this is installed.**

| What | Exact package / identifier | Version policy | Approx. size | Install location |
|---|---|---|---|---|
| Python runtime | 3.10.x (pyVideoTrans recommends 3.10; faster-whisper supports 3.9+) | pinned at approval | ~100 MB | `%LOCALAPPDATA%\collabboard-transcription\` (Windows) |
| Baseline engine | `faster-whisper` (pip) | pin exact version at approval | ~5 MB + deps | same env |
| Baseline inference lib | `ctranslate2` (pulled by faster-whisper) | version pinned with faster-whisper | ~100–300 MB | same env |
| Baseline weights | **`Systran/faster-whisper-large-v3`** (Hugging Face) | snapshot revision pinned at approval (the repo supports `xet` revisions — pin one) | **~3 GB** (fp16) | HF cache inside the env dir |
| Challenger | `pyvideotrans` (source via `uv sync`) | pin a git commit/tag at approval | ~1–5 GB with deps | same env or its own |
| Challenger weights | its default local faster-whisper path | **same `large-v3` weights as the baseline** — can share the HF cache | ~0 extra if shared | shared HF cache |
| ffmpeg | `ffmpeg` binary, **LGPL build** (`--enable-gpl` absent) | pin a specific build and record `ffmpeg -version` | ~50–100 MB | env dir, added to PATH |
| Audio decode deps | `ffmpeg`/`libsndfile` as required by each engine | pinned with the engine | included above | env dir |

**Disk footprint, all-in, worst case: ~6–12 GB**, dominated by the Python
environment if both candidates install their full dependency trees. The model
weights are the single largest item and are shared when the cache is shared.

**Install locations are outside the repository.** Nothing above writes inside
`C:\Users\rmeic\Projects\dev\starter` except `tools/transcription-probe/media/`
(media, gitignored) and `tools/transcription-probe/last-run.json`.

**Unverifiable now, named as such:** the exact download sizes are the published
or documented orders of magnitude; the real figures are a Phase B output. The
`large-v3` figure (~3 GB) is the widely cited fp16 order of magnitude for the
CTranslate2 conversion and must be replaced by the measured size on download.

### 6.3 Hardware the run assumes

| Resource | Assumption | Why |
|---|---|---|
| CPU | x86-64, ≥8 cores | CTranslate2 CPU path works without a GPU; `large-v3` on CPU is slow but functional |
| RAM | **≥16 GB** | `large-v3` fp16 plus decode buffers; the engine's peak is a Phase B measurement, this is the floor assumed |
| GPU | **optional** — NVIDIA with **≥10 GB VRAM** for the fp16 `large-v3` if available | pyVideoTrans's README names CUDA 12.8 / cuDNN 9.11 for its GPU path; the baseline's `compute_type: float16` is the GPU setting |
| Disk free | **≥15 GB** on the install volume | ~12 GB worst-case footprint plus working room for the media and outputs |
| Network | needed once, for installs and model downloads | the only network Phase B needs |

**If the host GPU/VRAM is unknown, Phase B must measure and report it before the
first recognition run** — a run whose hardware is unrecorded is the failure shape
this patch exists to prevent. The hardware above is stated as an assumption to be
approved, not as a confirmed fact about the machine.

### 6.4 Proposed execution limits

| Limit | Proposed value | Rationale |
|---|---|---|
| Total clips | **≤30** | the ~26 above plus headroom |
| Total audio minutes | **≤120 min** | the ~26 clips plus the two long recordings, with margin |
| Per-clip cap | **≤35 min** | bounds any single runaway; the ≥30-min long recording is the largest single item |
| Wall-clock budget, CPU-only | **≤6 h** | `large-v3` on CPU is roughly 1–3× real time on a mid-range 8-core; the long recordings dominate |
| Wall-clock budget, GPU | **≤1 h** | the same set on an adequate NVIDIA GPU |
| Peak memory ceiling | **stop and report above ~14 GB RSS** | above the 16 GB assumption's safety margin |
| Disk ceiling | **stop and report above 15 GB used** | matching §6.3 |
| Failure policy | **stop and report on the first failed install, failed download, or Gate 1 FAIL** | Gate 1 is blocking; a FAIL ends the comparison rather than continuing through it |

**The stop-and-report rules are the point of this table.** A run that silently
continues past a Gate 1 failure, or past its own resource ceiling, produces
numbers nobody can attribute — exactly the "plausible number from an unrecorded
configuration" risk the patch names. **On hitting any limit, Phase B stops and
reports; it does not extend itself.**

---

## 7. Limitations, stated explicitly

- **Desktop ≠ deployment.** Nothing here establishes server behaviour, and no
  measurement exists yet to establish anything at all. §6.3 states the hardware
  as an assumption, not a fact.
- **No measurement was taken.** Every performance, accuracy, memory and cost
  figure is owed by Phase B; §6.2's sizes are documented orders of magnitude, not
  measured downloads.
- **The gap claims are deliberately weak** (amendment 2): eight sources assessed,
  not all corpora surveyed. Two gaps carry a stronger claim, argued individually.
- **OpenSLR licence lines were read from the resource index**, not each corpus's
  own file. §1c lists each unconfirmed licence explicitly; they must be confirmed
  before download.
- **Licensing is evidence-only by instruction.** §1b reaches no conclusion; the
  recommendation is the CTO's. **No licence forbidding commercial use outright
  was found** — had one been, it would be reported here as a fact under rule 9.
- **Retention is unaddressed by this instrument.** Superseded media and
  transcripts have no sweep — recorded in the patch and in
  `.agent/retrieval-followups.md` item 19, resolved before product rollout.
