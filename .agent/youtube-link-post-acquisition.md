# YouTube acquisition, evaluated against the Link-post workflow — 2026-09-22

Stage 3a evaluated acquisition **paths**. This evaluates acquisition **products**
against a workflow that did not exist when 3a was written: the entry point is the
**existing canvas Link post**, and the fetch is **server-side**.

That reframing disqualifies the Stage 4 incumbent on shape alone, and surfaces one
operational fact that 3a could not have measured.

**Recommendation up front: no self-hosted caption library is adoptable for this
workflow. The choice is between a paid caption service and a user-initiated,
client-side acquisition — and that choice is the owner's, because the honest
version of it is not a technical question.** See §5.

---

## 1. The workflow this is evaluated against

Stated by the owner 2026-09-22, and treated here as the requirement set:

| # | Requirement |
|---|---|
| W1 | A Link post containing a supported YouTube URL acquires a transcript, associated with **that post and that board** |
| W2 | The transcript enters the **shared knowledge pipeline** — Board AI and Wiki index the same content, with timestamp citations |
| W3 | The **existing video card stays**. It shows transcript status and an **actionable** failure state |
| W4 | Opening a citation reaches the quoted transcript range and offers the **corresponding video timestamp** |
| W5 | Caption retrieval is either automatic on link creation or behind a **"Read video"** action — to be decided |
| W6 | Any **paid** speech-to-text fallback requires an **explicit user action** |
| W7 | **URL change and post deletion** are handled explicitly: a post can never retain a transcript belonging to a previous video |

W7 is the one most likely to be under-built, and it is the one that produces a
**confident citation to the wrong video** — the failure shape this stream has now
produced three times in other forms.

---

## 2. Why pyVideoTrans is disqualified for this workflow

PATCH-154 evaluated it as the Stage 4 transcription engine. Against W1 it is the
wrong shape, independent of any measurement:

- It is a **desktop media tool**. Its input is a file, not a URL in a post.
- It assumes an **interactive local environment**, not a server responding to a
  post being created.
- It carries the unresolved **GPL-3.0 vs "non-commercial project"** conflict
  recorded in `.agent/stage4-transcription-engines.md` §1c.

**This does not waste PATCH-154.** Its Gate 1 no-speech discipline, the
quiet-speech positive control and the harness apply unchanged to *whatever* engine
performs speech-to-text. What changes is that the engine is now a **fallback
behind caption acquisition**, not the primary path. Uploaded-media transcription
remains a separate capability, as the owner stated.

---

## 3. Repositories surveyed

GitHub repository search, sorted by stars, across four queries: `youtube
transcript api`, `youtube transcript server/service/rest`, `youtube subtitles api
self-hosted`, `youtube captions whisper fallback`.

### 3.1 The dominant architecture is the one we want

Almost every serious tool in this space is **captions-first with a Whisper
fallback** — `Eli-xir/youtube-transcript-mcp` ("caption-first pipeline, local
faster-whisper fallback"), `asimzeeshan/youtube-bridge`, `1-Future/YouTubeTranscriber`,
`arthurli202602-commits/youtube-anycaption-summarizer`, and others. The pattern
this project intends is the ecosystem-standard pattern. **That is a validation of
the design and of nothing else**: the tier is composed almost entirely of small,
unlicensed hobby repositories, and the pattern being common says nothing about
whether its acquisition step is available to us.

### 3.2 Named candidates and why each fails this workflow

| Repo | Licence | Acquisition | Verdict for W1 |
|---|---|---|---|
| `jdepoix/youtube-transcript-api` (8.4k) | MIT | **undocumented YouTube web-client API** | Blocked — see §4.1 and §4.2 |
| `zlxlabs/VideoTranscriptAPI` (214) | **PolyForm Noncommercial 1.0.0** | yt-dlp + CapsWriter/FunASR | **Disqualified — licence** |
| `asimzeeshan/youtube-bridge` | MIT | `youtube-transcript-api` + faster-whisper | Inherits §4.1; and see §3.3 |
| `Kakulukian/youtube-transcript` (584) | MIT | same undocumented path | Inherits §4.1 |
| `mcp-server-youtube-transcript` (596) | MIT | same undocumented path | Inherits §4.1 |

**`zlxlabs/VideoTranscriptAPI` is a rule 9 report.** Its licence is PolyForm
Noncommercial 1.0.0: *"允许任何非商业用途…禁止一切商业用途"* — permits non-commercial
use, **prohibits all commercial purposes**. It is otherwise the closest match by
shape (a FastAPI REST service with `POST /api/transcribe`, task polling, and
export endpoints). It is not available to a commercial product, and no technical
merit changes that.

### 3.3 The owner's "disabled in serverless" suspicion, checked

The suspicion was correct in substance and worse in form. `asimzeeshan/youtube-bridge`
is a self-hosted captions-or-Whisper bridge that requires `ffmpeg` and `deno`, and
documents **Docker Compose only**. It does not *disable* transcription in
serverless — **it does not mention serverless, cloud IP blocking or proxies at
all.**

That is the more dangerous shape. A documented limitation is a decision input; an
**undocumented** one is discovered in production, by us, after the feature ships.
A tool that advertises "extracts transcripts via captions or Whisper" and stays
silent about the constraint that actually breaks it in our deployment is not
usable as-is, whatever its licence.

---

## 4. Three structural findings

### 4.1 There is no authorized API path for a third party's video

Confirmed against Google's own documentation for `captions.download`:

> "This method requires the user to have permission to edit the video."

Scopes are `youtube.force-ssl` / `youtubepartner`, and insufficient permission
returns 403. **Arbitrary YouTube links on a board are, by definition, videos we
cannot edit.** This is not a quota or funding problem, and it confirms Stage 3a's
path-A finding from the primary source.

This is *why* the entire ecosystem uses the undocumented endpoint. There is no
compliant alternative to migrate to.

### 4.2 NEW, and decisive: cloud IPs are blocked

Stage 3a measured path C acquiring captions for **6 of 6** videos that had them.
That measurement stands — and it was taken from a **developer machine on a
residential IP**. Our Link-post workflow fetches **server-side**.

From `youtube-transcript-api`'s own README:

> "YouTube has started blocking most IPs that are known to belong to cloud
> providers (like AWS, Google Cloud Platform, Azure, etc.), which means you will
> most likely run into `RequestBlocked` or `IpBlocked` exceptions when deploying
> your code to any cloud solutions."

Our backend is exactly that. **So the free self-hosted path does not merely carry
the ToS objection Stage 3a raised — in our production topology it does not
work at all**, and the workaround is renting residential proxies, which converts
a fragility problem into an ongoing cost *and* a deliberate blocking-evasion
posture. That is strictly worse than what 3a declined.

The same README states the code *"uses an undocumented part of the YouTube API…
there is no guarantee that it won't stop working tomorrow"*, and that its cookie
authentication for age-restricted videos is **currently broken** by YouTube
changes — a live demonstration of the fragility, not a hypothetical one.

### 4.3 A paid service does not make the acquisition authorized

Supadata and comparable services (TranscriptAPI, SearchAPI, Apify) sell exactly
this capability, priced per credit, with an **AI fallback billed per minute of
video** — a billing split that maps cleanly onto W6. They solve §4.2 completely,
because the blocked-IP problem becomes theirs.

**They do not solve §4.1.** No vendor has an authorized route to a third party's
captions either; they have proxy infrastructure and a contract with *us*. Buying
the capability **transfers** the posture Stage 3a declined — it does not
eliminate it. It does change who bears it, gives us a counterparty and terms, and
removes any need for us to operate proxies or impersonate a client ourselves.

**Whether that transfer is acceptable is the owner's decision, and it should be
taken explicitly rather than absorbed as an implementation detail.** I have not
read any vendor's terms of service; that is the next step if this direction is
chosen, and it must be read before integration, not after.

---

## 5. Recommendation

**For W1, two viable shapes remain. Both are live options; they differ in who
performs the acquisition.**

**Option 1 — paid caption service, behind an explicit action.** A "Read video"
button (W5), one credit per fetch, with the speech-to-text fallback as a second,
separately-consented action (W6). Fits the workflow, survives our deployment
topology, gives per-video cost control and an auditable provenance record.
Requires: reading the vendor's terms, and accepting §4.3.

**Option 2 — client-side acquisition in the user's own browser.** The fetch
happens from the user's IP, in their session, on a video they are already
watching in the card; the transcript is posted to our pipeline. §4.2 disappears,
because it is not a datacenter request. This is architecturally different from
anything measured so far and has **not** been evaluated — cross-origin access to
the caption endpoint is the open question, and it may simply not be reachable
from a page context.

**Not recommended: self-hosting a caption library server-side.** It fails §4.2 in
our topology, requires proxy rental to work at all, and carries the §4.1 posture
without a counterparty.

**Whatever is chosen, W5 should be a "Read video" action rather than automatic
acquisition on link creation.** Automatic fetch spends money or quota on every
pasted link, including the many that are pasted and never read, and it makes the
§4.1 posture implicit in the product rather than a thing a person chose.

---

## 6. What this evaluation did not establish

- **No vendor terms of service were read.** §4.3 is a structural argument about
  what a vendor can possibly have, not a reading of any contract.
- **No candidate was run.** Nothing here is a measurement; §3 is a source and
  licence review.
- **Option 2 is unevaluated.** Whether a browser page can reach a caption track
  cross-origin is unknown and is the one cheap experiment that could change the
  recommendation.
- **W2, W4 and W7 are unaddressed here.** They are pipeline and lifecycle
  requirements, independent of which acquisition is chosen. W7 in particular —
  URL change and deletion — needs a written rule before any acquisition ships,
  because it is what stops a post citing a previous video's transcript.
