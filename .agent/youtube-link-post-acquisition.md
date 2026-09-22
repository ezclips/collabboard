# YouTube acquisition, evaluated against the Link-post workflow — 2026-09-22

Stage 3a evaluated acquisition **paths**. This evaluates acquisition **products**
against a workflow that did not exist when 3a was written: the entry point is the
**existing canvas Link post**, and the fetch is **server-side**.

That reframing disqualifies the Stage 4 incumbent on shape alone, and surfaces one
operational fact that 3a could not have measured.

**Recommendation up front: no self-hosted caption library is adoptable for this
workflow.** §5 originally left two options open — a paid caption service, or
user-initiated client-side acquisition. **§7 then measured the client-side option
and closed it**, so the live choice is now between a **paid caption service** and
**staying with paste-a-transcript**. That choice is the owner's, because the
honest version of it is not a technical question. Read §5 as written, then §7,
which supersedes its Option 2.

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

---

## 7. Option 2 measured, and it does not work — 2026-09-22

The owner chose Option 2. Before building it, the assumption it rests on was
tested, because §6 listed it as the one cheap experiment that could change the
recommendation. **It changed it, in the other direction.**

Measured from a real page at `http://localhost:3000` in the authenticated
Chromium over CDP 9333, against `dQw4w9WgXcQ` (6 caption tracks, confirmed
present).

### 7.1 What a browser may call, and what it returns

| Endpoint | CORS | Result |
|---|---|---|
| `youtube.com/watch` | **no `Access-Control-Allow-Origin` header at all** | `TypeError: Failed to fetch` |
| `youtubei/v1/player` | **preflight `OPTIONS` → HTTP 403** | `TypeError: Failed to fetch` |
| `api/timedtext` | **`Access-Control-Allow-Origin: http://localhost:3000`** (echoed, with `Allow-Credentials: true`) | HTTP **200, 0 bytes** |

**The only endpoint that permits cross-origin access is the one that returns
nothing.** Both endpoints that can enumerate caption tracks refuse the browser
outright — one by omitting the header, one by rejecting the preflight.

A `no-cors` request to the watch page returns an **opaque** response
(`type: "opaque"`, `status: 0`), which proves the network path is fine and the
refusal is CORS specifically — and an opaque body is unreadable by construction,
so it is not a workaround.

### 7.2 The empty 200 is not a CORS artifact

A **real, freshly extracted, signed** caption URL was tested — pulled from the
watch page on this machine's own residential IP, carrying
`ip, expire, signature, sparams, key` — and requested two ways:

- from the browser page, cross-origin: **200, 0 bytes**
- from `curl` on the **same machine and same IP that obtained it**: **200, 0 bytes**

So the empty body is not caused by CORS, by the origin, or by an IP mismatch
against the URL's own `ip` parameter. `timedtext` returns a silent empty 200 to a
correctly signed request from the IP it was signed for. This independently
reproduces Stage 3a's path-B finding — *"can discover tracks but cannot fetch
text, and fails as a silent HTTP 200"* — and shows it now holds even with a valid
signature.

### 7.3 Why Option 2 cannot be built

The client-side chain needs two steps: **enumerate the caption tracks**, then
**fetch one**. Step 1 is refused by the browser at both available endpoints. Even
granting step 2 a working URL, step 1 has no path — and step 2 returns nothing
anyway. There is no ordering of these that succeeds.

**This is not a limitation we can engineer around from a page context.** It is
not a missing header we can add, a proxy we can configure, or a parameter we
have not found: one endpoint refuses the origin, the other refuses the
preflight, and the permitted one is empty.

### 7.4 What this does and does not prove

- It **does** establish that our own JavaScript, in the user's browser, cannot
  acquire a YouTube transcript for a Link post. Option 2 is closed.
- It **does not** establish that the paid-service route fails; vendors operate
  outside a browser origin and are unaffected by every measurement here.
- It **does not** contradict Stage 3a's path C, which used a non-browser client
  and is subject to §4.2's cloud-IP block rather than to CORS.
- The `timedtext` empty 200 is measured, not explained. The likely cause is an
  additional attestation parameter now required alongside the signature, but that
  was **not** confirmed and should not be repeated as fact.

**Consequence: the choice collapses to the paid caption service (Option 1) or
staying with paste-a-transcript.** Both remaining options are the owner's
decision, and Option 1 still carries the §4.3 transfer question unanswered.

---

## 8. Owner decision: no scraping, direct or purchased — 2026-09-22

**The owner has ruled out obtaining YouTube captions by scraping**, citing legal
exposure. This closes BOTH remaining options from §5, and the second one is the
part worth stating plainly:

- **Option 1 (paid caption service) is closed too.** §4.3 recorded that a vendor
  has no authorized route either — it has proxy infrastructure and a contract
  with us. Buying the capability transfers the activity; it does not change what
  the activity is. With scraping declined as a category, a vendor performing it
  on our behalf is declined with it. The §4.3 question is now answered.
- **Option 2 was already closed by measurement** (§7).

**PATCH-155 (YouTube caption acquisition) is therefore cancelled, not deferred.**
Nothing further should be spent evaluating acquisition mechanisms.

### 8.1 Heptabase does not give us a path, and the reason is architectural

Heptabase was raised as a model to follow. It imports YouTube captions with one
click, and notably does **not** meter that against its transcription quota —
which is itself the tell: caption import costs them nothing because no
speech-to-text runs. It is an acquisition, not a transcription.

**Heptabase is a desktop application.** The request therefore originates on the
user's own machine, from the user's own IP. That is why neither constraint we
measured applies to them: no CORS, because it is not a browser page bound by an
origin, and no datacenter IP block, because no datacenter is involved.

So "do what Heptabase does" means one of:
- ship a desktop client, or
- ship a browser extension,

and **in both cases it is the same acquisition the owner has just declined**,
performed from the user's device instead of ours. Relocating it does not change
its nature. The model is not available to us on the YouTube side, and following
it would contradict the decision in §8.

**What Heptabase does that IS clean and IS available to us** is its other path:
metered speech-to-text over media the user supplies. That is exactly the
capability PATCH-154 was built to evaluate, and it is unaffected by this
decision.

### 8.2 What remains, and it is more than it looks

**A person reading a transcript in YouTube's own interface and copying it is not
scraping.** It is a human using the product as designed. That path stays open and
needs no vendor, no proxy and no undocumented endpoint.

The reason this matters more than it first appears: Stage 3a recorded that
paste-a-transcript costs us timestamp citations, because *"pasted transcripts
usually carry no timings"* — which makes W4 unsatisfiable. But that was written
about transcripts pasted from arbitrary sources. **YouTube's own transcript panel
displays a timestamp against every line.** If a paste taken from that panel
carries its timestamps, the cost Stage 3a recorded is not a cost here, and W4
survives without any acquisition.

**NOT YET VERIFIED, and it must be before anything is built on it:** the exact
text a copy from that panel produces. An attempt to read the panel through the
persistent browser confirmed the control exists but did not render the segments
(the button carries a localised label on this machine). **The claim above is a
design premise, not a measurement.** Confirming it costs one manual copy-paste
and should happen before the parser is specified, not after.

### 8.3 Direction

1. **Keep the video card** exactly as it is (W3).
2. **Add a transcript by paste**, with a parser for the timestamped format
   YouTube's panel produces — pending §8.2's verification. If the timestamps
   survive the paste, W2 and W4 are both satisfied with no acquisition at all.
3. **Uploaded media → speech-to-text**, which is now the primary AUTOMATED
   capability rather than a fallback behind captions. PATCH-154 continues
   unchanged and becomes more important, not less.
4. **W7 still applies** to pasted transcripts. A Link post whose URL changes must
   not keep a transcript belonging to the previous video, however that transcript
   arrived. Nothing about this decision relaxes it.

**The honest cost: there is no one-click YouTube import.** The user copies and
pastes, once per video. That is the price of the decision, it is a real
reduction in convenience against Heptabase, and it should be stated to users
rather than hidden behind a spinner that sometimes fails.

---

## 9. §8.2 resolved: the transcript panel carries per-line timestamps — 2026-09-22

Measured, not assumed. The panel was opened through YouTube's own interface on
`VzRZG_NEeLk` (34:13) and its contents read.

**Result: 324 timestamps across 974 lines.** The panel is a repeating triple:

```
0:00
0 seconds
Nater Masare. I'm the president and CEO of Buffalo Wings and Rings.
0:08
8 seconds
I am in my hometown, Cincinnati, where Buffalo Wings and Rings started.
```

Line 1 is the cue offset. Line 2 is an **accessibility label** restating that
offset in words. Line 3 is the text.

**So §8.2's premise holds and W4 survives with no acquisition.** Stage 3a's
finding that pasting costs timestamps was true of arbitrary sources; it is not
true of a paste taken from this panel.

**Still not measured, and it is the one thing a parser must be built against:**
this is the panel's rendered text, which is a proxy for -- not proof of -- what
the clipboard receives on select-all-and-copy. Whether the "N seconds"
accessibility line survives a copy is unknown. The parser must therefore
tolerate BOTH shapes rather than assume one:

- the triple above, discarding the accessibility label
- `0:00  text` collapsed onto one line

and must accept `m:ss`, `mm:ss` and `h:mm:ss` -- this specimen is under an hour,
so the hour form was not observed here and must not be inferred to be absent.

### 9.1 A SUMMARY IS NOT A TRANSCRIPT, and the importer must refuse one

The owner's first paste was a segment summary with coarse ranges
(`Cincinnati Dishroom Visit (0:00 - 5:05)`), not the panel's output. The
distinction is load-bearing and the importer must enforce it:

- A transcript is **what was said**. A citation can quote it and land on the
  moment it was said.
- A summary is **someone else's paraphrase** -- here, a model's. Storing one as a
  transcript would let Board AI quote a restatement as though it were the source,
  with a timestamp lending it false precision. That is exactly the failure this
  stream exists to prevent: a confident answer drawn from less than the reader
  believes it has.

A summary's ranges (`0:00 - 5:05`) are also structurally different from cue
offsets: coarse, span-shaped, and far fewer. **A simple ratio test separates
them** -- this specimen carries 324 cues across 34 minutes, roughly one per six
seconds, while the summary carried three ranges across the same video. An
importer should refuse input whose timestamp density is orders of magnitude
below a plausible cue rate, and say why, rather than accept it and silently
degrade every citation built on it.

Summaries may still be useful, but as DERIVED content that is labelled as such
and never cited as source.

## 10. §9's open question is CLOSED: the accessibility label does not survive a copy — 2026-09-22

Measured from a real paste, by the owner, from a real video
(`sAKVRgN11Po`, an Audi A2 bumper removal) into the import panel.

§9 was careful to say that the triple it recorded was the panel's **rendered**
text, "a proxy for -- not proof of -- what the clipboard receives", and named
the unknown: whether the `N seconds` accessibility line survives a copy.

**It does not.** What the clipboard actually carries is a pair per cue:

```
0:58
of the
0:59
bumper at all it can be stay
```

The timestamp on its own line, the text on the next, and nothing between them.

**The parser needed no change**, which was the explicit test that decision was
set for it: PATCH-156 said accepting both shapes was worth it only if "the
parser must not need changing if it is the other one." A bare timestamp opens a
cue and the following non-timestamp lines become its text, so the real shape
parses on the path that was already there. The accessibility-label branch stays:
it costs one regex, it is what the rendered panel shows, and a future YouTube
build or a different copy path may yet produce it.

It is pinned by tests in `knowledgeTranscriptPanelPaste.test.ts` under *the REAL
clipboard shape, measured at last*. The fixture words are re-typed from a
screenshot rather than copied, and kept to four cues: committing third-party
transcript text is the scraping question wearing different clothes.
