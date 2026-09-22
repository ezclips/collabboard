# PATCH-156 — transcript by paste: the YouTube panel format, and an affordance on the card

Status: **draft 2026-09-22 — awaiting owner approval**

## Goal

A user who puts a YouTube link on a Freeform board can attach its transcript by
pasting it, and Board AI and the Wiki then cite that transcript **with a
timestamp that lands on the moment the words were said**.

No acquisition. No vendor. No scraping, by us or on our behalf.

## Reason

PATCH-155 (automatic caption acquisition) is **cancelled** — the owner ruled out
scraping, which closed the paid route with it, since no vendor has an authorized
path either (`.agent/youtube-link-post-acquisition.md` §8).

What replaces it is not a consolation. §9 of that document measured YouTube's own
transcript panel and found **324 timestamps across 974 lines** on a 34-minute
video — a cue roughly every six seconds. A person copying that panel is using
YouTube as designed, and the timings come with the text. So the cost Stage 3a
recorded for pasting — *"pasted transcripts usually carry no timings"* — does not
apply to this source, and **W4 is satisfiable with no acquisition at all**.

The missing pieces are narrow: this paste format is not one the parser accepts,
and the card has no way to offer the action.

## Why now / why this order

Most of this feature already exists and must not be rebuilt. Stage 3b shipped the
domain model (`knowledgeTranscriptCues`, `…Document`, `…Import`, `…Version`,
`…Citation`), the Supabase adapters, and the import route at
`app/api/boards/[id]/knowledge/transcript/route.ts`. PATCH-153 shipped the wiki
disclosure.

**Read `lib/domain/knowledge/knowledgeTranscriptImport.ts` and
`knowledgeTranscriptCues.ts` before writing anything.** The chunking invariant
there is load-bearing and subtle: chunks are a *contiguous lossless partition* of
the canonical text, because the version fingerprint is taken over that text and
the text is stored nowhere else. Producing cues that violate it makes stored
transcripts unverifiable.

## BLOCKED DEPENDENCY — read this before planning the work

**The transcript WRITE path cannot run against the current database.** Measured
2026-09-22:

```
knowledge_transcript_create_version:   MISSING [PGRST202]
knowledge_transcript_replace_version:  MISSING [PGRST202]
knowledge_transcript_update_metadata:  MISSING [PGRST202]
```

Those RPCs ship in `20260921160000`, which needs `20260921150000`, which
**refuses to run** without items 17 and 18 (`20260921130000`, `20260921140000`).
So Part B of this patch requires all four to be applied, and they are parked
pending isolated verification.

This is the same defect shape that rendered every PDF card dead on 2026-09-22:
code that reads or calls something the database does not have. It is stated here
so it is a plan, not a discovery.

**Therefore the work splits, and Part A carries no database dependency at all.**

---

# PART A — the parser (no database, buildable and testable now)

## Files to Create
- `lib/domain/knowledge/knowledgeTranscriptPanelPaste.ts`
- `lib/domain/knowledge/knowledgeTranscriptPanelPaste.test.ts`

## Files to Modify
- `lib/domain/knowledge/knowledgeTranscriptCues.ts` — add `'youtube-panel'` to
  `KnowledgeTranscriptFormat`. **Add only**; `'srt' | 'vtt' | 'plain'` keep their
  exact current behaviour.

## A1 — the format, as measured

The panel renders a repeating triple:

```
0:00
0 seconds
Nater Masare. I'm the president and CEO of Buffalo Wings and Rings.
0:08
8 seconds
I am in my hometown, Cincinnati, where Buffalo Wings and Rings started.
```

Line 2 is an **accessibility label** restating line 1 in words.

**NOT MEASURED, and the parser must not assume it:** that reading is the panel's
rendered text, which is a proxy for — not proof of — what the clipboard actually
receives. Whether the accessibility line survives a copy is unknown. **Accept
both shapes:**

- the triple, discarding the accessibility label
- `0:00  text` collapsed onto one line

Accept `m:ss`, `mm:ss` and `h:mm:ss`. The measured specimen was under an hour and
never produced the hour form; its absence there is not evidence it does not
occur.

## A2 — cue END times are derived, and that must be visible

The panel gives each cue a START only. An end must be synthesised as the next
cue's start, and the last cue's end cannot be known from the paste at all.

**This is the part most likely to be built wrong and never noticed.** A citation
carries a range; a wrong end silently widens or narrows what a quote claims to
cover. So:

- derive each end from the following cue's start
- give the final cue an explicit, recorded convention — do **not** invent a
  duration that looks plausible
- record in the representation that ends are **derived, not declared**, so a
  later reader does not mistake them for source data

SRT and VTT declare both times. This format does not, and the difference must
survive into what is stored.

## A3 — refuse a summary, and say why

The owner's first specimen was a segment summary —
`Cincinnati Dishroom Visit (0:00 - 5:05)` — not a transcript. Storing one as a
transcript would let Board AI quote a model's paraphrase as though it were the
source, with a timestamp lending it false precision. That is the exact failure
this stream exists to prevent.

They are separable by **timestamp density**: the measured transcript carries a
cue roughly every 6 seconds; the summary carried 3 ranges for a 34-minute video.

- Reject input whose cue density is implausibly low for its span, with a message
  that names the reason — *"this looks like a summary, not a transcript"* — and
  never a generic parse failure.
- **Pick the threshold by testing both specimens**, and write the chosen number
  and its justification into the file. Do not copy a number from this patch.
- A short clip legitimately has few cues. The test is **density over span**, not
  a count, and a genuinely short transcript must pass.

## A4 — parse only; write nothing

Part A produces cues. It does not touch the repository, the route, or any
component.

---

# PART B — the card affordance and dedupe (BLOCKED; do not start)

Listed so the shape is known. **Not authorized**: it needs the four migrations
above applied and verified first.

B1. `FreeformPadletCards.tsx`: a media link card with no transcript shows an
    **"Add transcript"** affordance; with one, the same place shows status and an
    actionable failure state (W3). **Not a modal, and never on paste** — adding
    ten links must not produce ten interruptions.
B2. Paste target accepting the panel format, routed through the existing import
    route.
B3. **Dedupe before offering** (W1): the same video already transcribed on this
    board offers reuse rather than another paste; a transcript already cited by a
    wiki page says so on the card.
B4. **W7**: a Link post whose URL changes must not keep the previous video's
    transcript. Detach on change; the affordance returns.
B5. Freeform only. The drawing canvas is finished and frozen.

---

## Files that MUST NOT be touched

- anything under `components/collabboard/canvas/excalidraw_fork/`
- any drawing-canvas file (finished and frozen by owner instruction)
- `supabase/migrations/**` — this patch applies and writes no SQL
- `lib/domain/knowledge/knowledgeTranscriptImport.ts` chunking invariant
- `.env.local`, `package.json`

## Architecture Notes

`'youtube-panel'` is a **parser format**, not a new document kind. A transcript
from a paste is the same stored object as one from an SRT file: `kind = 'text'`,
one canonical string, character ranges, `transcript_representation` carrying the
cues. Everything downstream — chunking, fingerprinting, citation, staleness —
is untouched, which is the point.

## Migration Notes

**Part A needs none.** Part B needs `20260921130000`, `140000`, `150000`,
`160000`, in that order, verified on a disposable stack first — the last such run
found five real defects before any of it reached a live database.

## Potential Risks

1. **Clipboard shape differs from rendered text.** Mitigated by accepting both;
   the first real paste settles it and the parser must not need changing if it is
   the other one.
2. **Derived cue ends read as declared.** See A2. This is the risk that produces
   a citation that looks precise and is not.
3. **A density threshold tuned on one specimen.** Two specimens exist; a short
   legitimate transcript is the case most likely to be wrongly refused, and it
   must have a test.
4. **Rebuilding what Stage 3b already shipped.** The import route, adapters and
   domain model exist. Read them first.

## Commit

```
feat(knowledge): parse a transcript pasted from YouTube's own panel

Replaces the cancelled acquisition work. A person copying YouTube's transcript
panel is using YouTube as designed, and section 9 of the acquisition note
measured what that copy contains: 324 timestamps across 974 lines on a
34-minute video, a cue roughly every six seconds. So Stage 3a's finding that
pasting costs timestamp citations -- true of arbitrary sources -- is not true of
this one, and timestamped citations survive with no acquisition at all.

'youtube-panel' is a parser format, not a document kind. The stored object is
identical to a transcript imported from SRT, so chunking, fingerprinting,
citation and staleness are untouched.

Two shapes are accepted because only one is measured: the panel renders each cue
as an offset, an accessibility label and the text, but that is RENDERED text and
a proxy for what the clipboard receives. Whether the accessibility line survives
a copy is unknown, so a collapsed "0:00 text" line parses identically. h:mm:ss is
accepted although the measured specimen never produced one.

Cue ENDS are derived from the following cue's start and recorded as derived, not
declared. SRT and VTT carry both times; this format carries only starts, and a
citation's range would otherwise claim a precision the source never gave it.

A summary is refused rather than stored. The first specimen offered was segment
summaries with coarse ranges, which as a transcript would let Board AI quote a
paraphrase as the source with a timestamp lending it false precision. The shapes
separate on cue density over span -- not on count, so a genuinely short
transcript still parses.

Parser only: no repository, route or component is touched. The write path needs
RPCs that do not exist in the database yet (PGRST202, measured), and that work is
Part B and unauthorized.
```

## Rollback Plan

Revert the commit. Part A adds a format and a file; nothing existing changes
behaviour, so no data and no stored transcript is affected.

## Acceptance Criteria

1. The measured specimen parses to cues whose count and first offsets match §9 of
   `.agent/youtube-link-post-acquisition.md`.
2. The collapsed one-line shape parses to the **same** cues.
3. The summary specimen is **refused**, with a message naming the reason.
4. A short legitimate transcript is **accepted** — the positive control that stops
   the density rule from rejecting everything.
5. `'srt'`, `'vtt'` and `'plain'` behaviour is unchanged: their existing tests pass
   untouched.
6. Failing test FILE SET equals the 26-file baseline; `tsc --noEmit` exits 0;
   `check:boundaries` shows its same two pre-existing errors;
   `npm run check:schema` shows no new failure.

## Required Tests

Per acceptance 1–5, plus: `h:mm:ss` parses; a cue's derived end equals the next
cue's start; the final cue's end follows the recorded convention; ends are marked
derived; malformed input fails with a specific message rather than silently
producing zero cues.

## Estimated Difficulty

Part A: moderate — small surface, but the density threshold and the derived-end
convention are judgement calls that must be justified in the file.
Part B: blocked.
