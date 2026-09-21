# Stage 3a — caption fetch-path findings

What was measured, with numbers, and what it means for Stage 3. Run by
`tools/youtube-caption-probe/probe.mjs`; the raw output of the run these tables
come from is committed beside it as `last-run.json`.

**Date:** 2026-09-21. **Node:** v24.11.1. No API key was available, and no
account was created on any third-party service.

**Recommendation up front: none of the three paths is adoptable as an automatic
fetch path.** The honest outcome is paste-a-transcript, with STT as the Stage 4
door. Reasoning below.

---

## The set

Nine videos, chosen by probing candidates and keeping what they turned out to
be rather than by assuming from the title. The probe re-checks each one's
character on every run and reports drift; the run below reported none.

| Video | Covers | Duration | Manual / ASR tracks |
|---|---|---|---|
| `dQw4w9WgXcQ` | human captions, several languages | 213 s | 5 / 1 |
| `jNQXAC9IVRw` | very short | 19 s | 2 / 0 |
| `9bZkp7q19f0` | non-English (Korean), auto-generated only | 252 s | 0 / 1 |
| `aircAruvnKk` | 30 caption languages — track selection | 1,120 s | 30 / 1 |
| `1La4QzGeaaQ` | playable, **no captions at all** | 338 s | 0 / 0 |
| `_uQrJ0TkZlc` | long, human captions | 22,447 s (6.2 h) | 8 / 1 |
| `8jLOx1hD3_o` | very long, auto-generated only — scale | 112,049 s (31 h) | 0 / 1 |
| `2lAe1cqCOXo` | gated: sign-in demanded | — | — |
| `5qap5aO4i9A` | unplayable: ended live stream | — | — |

---

## Per-path results

| | A — Data API v3 | B — timedtext | C — transcript library |
|---|---|---|---|
| Videos attempted | 9 | 9 | 9 |
| **Caption text acquired** | **unmeasured** (see below) | **0 / 9** | **6 / 9** |
| Of the 6 that have captions | unmeasured | 0 | **6 / 6** |
| Track metadata obtained | unmeasured (no key) | **7 / 9** | 6 / 9 |
| Formats returned | unmeasured | none (empty body) | JSON segments |
| Median latency | 0.2 s (unauthenticated error) | 1–3 s | 0.10–1.45 s |
| Rate limiting seen | unmeasured | none at 25 requests | none at 25 requests |

**Path A is scored `unmeasured`, not zero.** A 0/9 would sit in the table as
though the path had been tried and failed, which is not what happened: no
authenticated call was ever made. The only thing measured on path A is the
response to an unauthenticated request. Everything else about it below is
documentary.

### A — official YouTube Data API v3

Measured: `captions.list` without a key returns **HTTP 403
`PERMISSION_DENIED`**, "Method doesn't allow unregistered callers". That is the
expected answer to an unauthenticated call and says nothing about the path's
viability, so the decisive point is documentary rather than measured:

> **`captions.download` requires an OAuth token carrying permission to EDIT the
> video** — the owning channel, or an account it has granted edit rights to.
> An API key alone does not satisfy it.

**This is an authorisation limit, not a quota limit.** A funded project with
raised quota still could not use this path for arbitrary user-submitted videos,
because the barrier is per-video edit permission the uploader would have to
grant. `captions.list` would return track *metadata* — languages, whether a
track is ASR — but that is metadata, not text.

Said precisely, because the earlier wording overstated it: the constraint is
**edit permission, not strictly ownership**, and it is a statement about the
documented API surface rather than a measured result.

**Unmeasured, stated plainly:** any authenticated call at all — acquisition,
`captions.list` with a key, and real quota costs. All need a Google Cloud
project and, for download, a video this account may edit; none exists here. The
probe makes the live call automatically if `YOUTUBE_API_KEY` is set, so the
metadata half is reproducible by anyone with a key.

### B — timedtext

The path splits in two, and reporting it as one number would hide the finding.

- **Discovery works.** The watch page carries a `captionTracks` array with a
  `baseUrl` per track: 7 of 9 videos listed tracks, including all 30 languages
  of `aircAruvnKk`.
- **Acquisition does not.** Fetching those `baseUrl`s returns **HTTP 200 with a
  zero-byte body** — in all four formats tried (default, `json3`, `srv3`,
  `vtt`), on every video that had tracks.

**The failure mode is the dangerous part: it is a silent success.** Status 200,
no error, empty string. Code that checks `res.ok` sees a healthy response and
would store an empty transcript. Anything built here needs to treat
empty-as-failure explicitly, because the transport will not.

This reflects YouTube's proof-of-origin gating on caption URLs: the URL is
handed out freely and is not usable without a session-bound token.

### C — third-party transcript library

**`youtube-transcript` v1.3.1, MIT licensed.** Terms: the package itself is MIT
— permissive, no cost, no account. What matters is not its licence but what it
does at runtime.

**How it works, which is the finding.** It calls YouTube's **private InnerTube
endpoint** (`/youtubei/v1/player`) while declaring itself the **`ANDROID`
client**. That is why it succeeds where path B fails: it presents a client
identity that is not this application, against an API with no public contract.

Measured: **6/6 of the videos that have captions**, at 0.10–1.45 s each,
25/25 consecutive requests with no throttling.

**It was measured out-of-tree, installed in a temporary directory, and it is
deliberately not a dependency of this repository.** Measuring what a technique
achieves is what an instrument is for; shipping it is a different decision, and
this commit does not take it.

---

## Segment quality — path C, the only path that returned text

| Video | Segments | Text units | p50 / p95 / max seg | Span ÷ duration | 45 s windows | Sentence punct. | Commas | Upper-case ratio |
|---|---|---|---|---|---|---|---|---|
| `dQw4w9WgXcQ` | 61 | 2,089 | 2.68 / 4.36 / 4.68 s | 0.85× | 4 | no | yes | 0.045 |
| `jNQXAC9IVRw` | 6 | 217 | 2.16 / 4.64 / 4.64 s | 0.82× | 0 | yes | yes | 0.006 |
| `9bZkp7q19f0` | 67 | 654 | 5.20 / 8.32 / 10.20 s | **1.48×** | 5 | yes | no | 0.5 |
| `aircAruvnKk` | 216 | 13,444 | 4.64 / 7.58 / 12.66 s | 0.90× | 23 | yes | yes | 0.244 |
| `_uQrJ0TkZlc` | 4,530 | 241,814 | 4.00 / 4.00 / 4.00 s | 0.99× | 381 | yes | yes | 0.015 |
| `8jLOx1hD3_o` | 46,959 | 1,696,642 | 4.72 / 6.16 / 12.16 s | **2.00×** | 2,422 | yes | **no** | **0.000** |

**Timing granularity:** integer milliseconds throughout, on every track.

**Can segments group into the plan's ~30–60 s windows?** The measurements
**support trying it**, and that is the strongest form the claim may take.
Median cue length is 2–5 s and the longest cue *observed* is 12.7 s, so in this
set a window is built from many whole cues. **That is an observed maximum, not
a guarantee**: nothing in the formats bounds cue duration, and a future or
unsampled track may carry a cue longer than a window. Any implementation must
therefore define what happens to an oversized cue rather than assume none
exists — see *Rules an importer must define* below. The `45 s windows` column
is the count produced by cutting on offsets.

### Three quality findings that would have become defects

1. **Cues overlap in time, so windows must be cut on absolute offsets, not by
   summing durations.** On auto-generated tracks the cue spans sum to **2.00×**
   the video's real length (`8jLOx1hD3_o`) and **1.48×** (`9bZkp7q19f0`);
   counted directly, **99.9%** of that video's 46,959 cues start before the
   previous cue ends (77.6% on the Korean track). Human-authored tracks run
   0.82–0.99× with **0%** overlap — under 1 because they have gaps instead.
   Any windowing that adds durations would mis-time every citation after the
   first overlap, and the error accumulates through the video.

   **Absolute cue timestamps and the overlaps themselves must be preserved**,
   not normalised away: the overlap is what the source says, and a citation's
   timestamp has to be traceable to a cue's own start rather than to a position
   reconstructed from arithmetic.

   **Overlapping time did not mean duplicated words here.** Checked rather than
   assumed: consecutive cues repeat text in only **0.5%** of cases on the
   31-hour ASR track (239 of 46,959). So this delivery is a sliding window in
   *time* carrying distinct words, not the rolling-caption duplication that
   other caption formats can produce. **That is a property of what this path
   returned, not a guarantee about SRT/VTT a user supplies**, where rolling
   captions genuinely do repeat lines — which is why an importer has to state a
   rule rather than rely on this number.

2. **The two auto-generated tracks sampled here carry no casing and, in one
   case, no commas.** `8jLOx1hD3_o`: upper-case ratio **0.000** over 1.7 M
   characters, no commas. Sample: `"this complete c plus plus course will"`.
   The human-authored tracks sampled carry both.

   **Scope of that claim, stated because it is easy to over-read.** This is an
   observation about **two ASR tracks in this set**, not a general property of
   auto-generated captions — YouTube's ASR output varies by language, age and
   pipeline, and two samples cannot establish otherwise. It also says **nothing
   about transcription accuracy**: whether the words are *correct* was not
   measured at all, and formatting is not a proxy for it. What follows is only
   that citation readability cannot be assumed uniform, so any claim about it
   must say which track it came from and on what evidence.

3. **Scale is real.** A 31-hour video yields **46,959 segments and 1.7 MB of
   text** from a single URL paste. That is larger than any DOCX the extraction
   ceilings admit, and it arrives with no Content-Length to pre-check.

---

## Failure modes observed

| Cause | Video | Path B reports | Path C reports |
|---|---|---|---|
| Captions genuinely absent | `1La4QzGeaaQ` | `captions-unavailable` | `TranscriptDisabled` |
| Sign-in demanded | `2lAe1cqCOXo` | `playability:LOGIN_REQUIRED` | `TranscriptDisabled` |
| Unplayable (ended stream) | `5qap5aO4i9A` | `playability:UNPLAYABLE` | `TranscriptDisabled` |

**Path C collapses three different causes into one wrong message.** All three
come back as "Transcript is disabled on this video", including the two where
captions are not the problem at all. Stage 3d requires refusing *with a
sentence that names the workaround*; built on path C, that sentence would tell
users captions were disabled when the video actually needed a sign-in.

**The rule this implies, stated so it is not mis-taken as licence to diagnose.**
Playability status *can* separate some causes — `LOGIN_REQUIRED` and
`UNPLAYABLE` are specific and were observed. But it is not a general diagnosis
and must not be treated as one:

- Assert a specific cause **only** when the response explicitly supports it.
- **"Captions are disabled" is only ever said when the source actually says
  so.** It must never be inferred from an absence, an empty body, an unexpected
  shape or a failed request.
- Everything else — unavailable, ambiguous, empty, unrecognised, network
  failure — is **"could not retrieve captions"**, which is honest about not
  knowing.

An unsupported diagnosis is worse than no diagnosis: it sends the person to fix
something that is not broken.

**Quota / rate limiting:** no 429 and no throttling at 25 consecutive requests
on either reachable path (path B 25/25 HTTP 200 in 14.6 s; path C 25/25 in
2.8 s). **This is a weak result and should not be read as a quota finding** —
25 requests from one IP is far below where limits would appear. Neither path
publishes a rate limit, which is itself the point: an undocumented path has no
limit you can design against.

### A defect that would have shipped: no track is chosen

Path C returns **the first track in YouTube's list**, not the video's language.
Verified on every successful video — `tookFirstTrack` true 6/6:

| Video | Content language | First track | Returned |
|---|---|---|---|
| `aircAruvnKk` | English | `ar` | **Arabic** |
| `_uQrJ0TkZlc` | English | `zh-CN` | **Chinese** |

Both are English videos that would have been ingested, hashed, chunked and
cited **in a language nobody asked for**, with no error anywhere. Track
selection is a requirement in its own right, not a detail of whichever library
is used.

---

## Recommendation

**None of the three paths should be adopted as an automatic fetch path.**

- **A** cannot serve arbitrary third-party videos. The blocker is per-video
  **edit permission**, which the uploader would have to grant, and no amount of
  quota or funding changes that. Its authenticated behaviour is **unmeasured**.
- **B** can discover tracks but cannot fetch text, and fails as a silent
  HTTP 200 — the worst shape of failure for a pipeline that would store the
  result.
- **C** works today, on every video that has captions. But it works by
  presenting a **false client identity to a private, uncontracted API**. That
  is a decision for the PM rather than a technical judgement I should make
  alone, and per the standing instruction the ToS reasoning belongs in the
  commit that lands a chosen path, not this one. Setting that question aside
  entirely, it is still a **fragile** dependency: an undocumented endpoint with
  no compatibility promise, which is why libraries in this category break
  repeatedly. It also mis-reports failure causes and selects no track.

**So the recommendation is the "none" branch the plan anticipated:
paste-a-transcript for Stage 3b, with STT as the Stage 4 door.** The plan wrote
that this is better learned from an instrument than from a feature that breaks
weekly, and that is what the instrument found.

### How this recommendation should be read

**Automatic acquisition is deferred by product decision. It is not universally
disproven**, and the difference matters if this is revisited.

Path C acquired captions for **6 of 6** videos that had them. Rejecting it is a
judgement about **maintenance risk and a false client identity against a private
endpoint** — not a finding that acquisition is impossible. Path A's
authenticated behaviour was never measured at all. A later decision could
legitimately reopen either without contradicting anything measured here.

## Rules an importer must define

Consequences of the measurements above, listed because each is a case the data
shows is real or shows cannot be ruled out. **These are requirements on a future
importer, not decisions taken here.**

| Case | Why it must be handled | Rule owed |
|---|---|---|
| Cue longer than a window | 12.7 s is the observed max; nothing bounds it | Define oversized-cue behaviour; never assume none exists |
| Cues overlapping in time | 99.9% of cues on one track | Cut windows on absolute offsets; preserve the overlap |
| Repeated rolling-caption text | rare here (0.5%) but normal in supplied SRT/VTT | State a de-duplication rule rather than rely on this set |
| Ambiguous or empty response | timedtext returns HTTP 200 + empty body | "Could not retrieve captions"; never "captions disabled" |
| Track language | no track is chosen by the measured library | Record language and track kind explicitly as provenance |

### What paste-a-transcript keeps, and what it costs

Keeps: everything downstream is unchanged. Pasted text canonicalises, hashes
and chunks exactly as Stage 1/2 text does, and `content_sha256` still gives the
re-ingestion staleness proof.

Costs, stated rather than glossed: **pasted transcripts usually carry no
timings**, so `timeSeconds` on a citation — and the "cites it with a timestamp
that lands at the right moment" acceptance test — would not be satisfiable from
a plain paste. If timestamps are wanted, the paste has to accept a timed format
(SRT/VTT, which is what a user can export from the YouTube UI) rather than
plain text. That is a Stage 3b design question this instrument does not decide.

---

## What this instrument did not measure

- **Path A with a real key**, and its true quota cost. No Google Cloud project
  exists here.
- **A hosted transcript service** (Supadata, youtube-transcript.io and similar).
  All require an account and an API key. Creating accounts on third-party
  services is outward-facing and outside this instrument's authorisation, so
  they are recorded as unmeasured rather than guessed at.
- **Sustained rate limits.** 25 requests is a smoke test, not a quota probe.
- **Geographic variation.** Every measurement is from one IP in one country;
  `kJQP7kOldHY` returned `ERROR` here during set selection and was dropped from
  the set for that reason. Availability varies by region and this run cannot
  see that.
- **Longitudinal stability.** One run on one day. The InnerTube path's whole
  risk is that it changes, and a single green run says nothing about next month.

---

## Instrument status: COMPLETE, with qualifications

Stage 3a is done. What it establishes, and the limits on each:

| Established | Qualification |
|---|---|
| timedtext acquires nothing, failing as HTTP 200 + empty body | measured on 7 videos with tracks, one IP, one day |
| A third-party library acquires captions for every captioned video tested | 6/6, by presenting a false client identity to a private API |
| Cues overlap in time; windows must cut on absolute offsets | 99.9% / 77.6% on two ASR tracks; 0% on human tracks |
| Cue lengths in this set fit 30–60 s windows | observed maximum 12.7 s — supports trying, guarantees nothing |
| Two sampled ASR tracks lack casing/punctuation | says nothing about accuracy, nor about ASR in general |
| Failure causes are distinguishable only from playability status | and only sometimes; otherwise "could not retrieve captions" |
| No track selection happens by default | 6/6 returned the first track, not the video's language |

**Not established, and not to be cited as if it were:** authenticated Data API
behaviour; quota and sustained rate limits; geographic variation; longitudinal
stability; transcription accuracy of any track; the behaviour of hosted
transcript services.
