// Parsing a transcript a person copied out of YouTube's own transcript panel.
//
// WHY THIS FORMAT EXISTS AT ALL. Automatic caption acquisition was ruled out --
// scraping, by us or via a vendor -- so the acquisition work was cancelled. What
// replaces it is not a consolation: a person copying the panel is using YouTube
// as designed, and the timings come with the text. A 34-minute video's panel
// measured 324 timestamps across 974 lines, a cue roughly every six seconds.
// So Stage 3a's finding that pasting costs timestamp citations -- true of
// arbitrary pasted sources -- is simply not true of this one.
//
// ============================================================================
// WHAT THE PANEL GIVES, AND THE ONE THING IT DOES NOT
// ============================================================================
//
// Each cue is rendered as a triple:
//
//     0:00
//     0 seconds
//     <the words>
//
// Line 2 is an ACCESSIBILITY LABEL restating line 1 in words. The panel gives
// each cue a START only -- there is no end time anywhere in the paste. SRT and
// VTT declare both; this format does not, and that difference has to survive
// into what is stored (see the DERIVED ENDS section below).
//
// ONLY ONE SHAPE IS MEASURED. The triple above is the panel's RENDERED text,
// which is a proxy for -- not proof of -- what the clipboard actually receives.
// Whether the accessibility line survives a copy is UNKNOWN, so the collapsed
// form `0:00  text` on one line is accepted too. Both shapes must produce
// identical cues.
//
// ============================================================================
// LINE-BASED, NOT BLOCK-BASED
// ============================================================================
//
// knowledgeTranscriptCues.ts splits SRT/VTT on blank lines. This format has no
// blank line between cues -- every line is significant -- so the block splitter
// cannot see it and this module walks lines instead. It is delegated to from
// parseKnowledgeTranscript; it is not a second entry point.

import { domainError, type DomainError } from '../core/errors';
import { err, ok, type Result } from '../core/result';
import {
  parseKnowledgeTranscriptTimestamp,
  type KnowledgeTranscriptCue,
  type KnowledgeTranscriptParse,
} from './knowledgeTranscriptCues';

/**
 * A duration written in words, which is the accessibility label's whole shape:
 * `0 seconds`, `8 seconds`, `1 minute, 3 seconds`, `1 hour, 2 minutes`.
 *
 * RECOGNISED BY SHAPE, NOT BY A LIST OF PHRASINGS. The label is localised --
 * this machine renders the English form while the browser locale is German --
 * so any list of exact strings would be wrong on the next locale. The shape is:
 * one or more `number + unit` pairs, separated by commas or `and`, covering
 * nothing but time units, and carrying no sentence punctuation.
 *
 * It must not match cue TEXT. A line like "I waited 5 seconds" is text: it has
 * other words, so it fails the anchored `^...$` match below and is kept.
 */
const DURATION_IN_WORDS = /^\d+\s*(?:hours?|minutes?|seconds?|hrs?|mins?|secs?|min|s|h)\b(?:[\s,]*(?:and\s+)?\d+\s*(?:hours?|minutes?|seconds?|hrs?|mins?|secs?|min|s|h)\b)*$/i;

export function isAccessibilityLabel(line: string): boolean {
  return DURATION_IN_WORDS.test(line.trim());
}

/**
 * The one-line shape: a timestamp, whitespace, then text. Deliberately
 * permissive about the gap because the clipboard's exact spacing is unknown;
 * the timestamp itself is still fully validated by the shared parser below.
 */
function splitCollapsedLine(line: string): { startMs: number; text: string } | null {
  const match = /^(\S+)\s+(.+)$/.exec(line.trim());
  if (!match) return null;
  const startMs = parseKnowledgeTranscriptTimestamp(match[1]);
  if (startMs === null) return null;
  const text = match[2].trim();
  if (text.length === 0) return null;
  return { startMs, text };
}

/**
 * ============================================================================
 * THE DENSITY RULE, AND WHY IT IS NOT A COUNT
 * ============================================================================
 *
 * The owner's first specimen was a SEGMENT SUMMARY -- three coarse ranges like
 * `Cincinnati Dishroom Visit (0:00 - 5:05)` -- not a transcript. Storing a
 * summary as a transcript would let Board AI quote a model's paraphrase as the
 * source, with a timestamp lending it false precision. That is the exact failure
 * this whole stream exists to prevent, so it is refused rather than stored.
 *
 * THE TWO SPECIMENS SEPARATE BY ORDERS OF MAGNITUDE, so the threshold does not
 * need to be delicate:
 *
 *   - measured transcript: 324 cues over ~34 minutes  -> ~6.3 s per cue
 *   - rejected summary:      3 ranges over ~34 minutes -> ~680 s per cue
 *
 * THE NUMBER IS 45 SECONDS PER CUE, and it is chosen here rather than copied,
 * with its reasoning:
 *
 *   - It sits ~7x above the measured transcript's 6.3 s and ~15x below the
 *     summary's 680 s, so it is not tuned against either specimen's exact value.
 *   - It matches the window target the chunker already uses
 *     (KNOWLEDGE_TRANSCRIPT_WINDOW_TARGET_MS = 45_000), so "one cue per window"
 *     is the natural floor of what this system treats as a normal cadence --
 *     a transcript sparser than one cue per chunking window is not a cadence
 *     this pipeline has ever seen from a real caption track.
 *   - It comfortably accepts the case most likely to be wrongly refused: a
 *     legitimate 40-second clip with 6 cues is ~6.7 s per cue, an ORDER OF
 *     MAGNITUDE inside the limit. The positive control does not merely pass; it
 *     is nowhere near the boundary, which is what makes the boundary meaningful.
 *
 * DENSITY OVER SPAN, NEVER A COUNT. A short clip legitimately has few cues, so
 * a count threshold would refuse it. `spanMs / cueCount` is dimensionless with
 * respect to length.
 *
 * IT IS NOT APPLIED BELOW TWO CUES. Density is undefined for one cue -- and
 * meaningless for zero, which is its own ordinary parse failure below.
 */
export const KNOWLEDGE_TRANSCRIPT_PANEL_MAX_MS_PER_CUE = 45_000;

/** With one cue there is no median of others; this is its fallback. */
const SINGLE_CUE_FALLBACK_MS = 2_000;

/**
 * The MEDIAN of the derived durations, as an integer.
 *
 * Taken from THIS transcript's own cues, so the final cue's end is data rather
 * than a constant someone invented. The median (not the mean) because a single
 * unusually long cue should not drag the estimate.
 */
function medianDerivedDuration(durations: readonly number[]): number {
  if (durations.length === 0) return SINGLE_CUE_FALLBACK_MS;
  const sorted = [...durations].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * The SRT/WebVTT cue-range arrow, and the WebVTT header.
 *
 * ============================================================================
 * WHY THIS REFUSAL EXISTS: SRT PARSED HERE SUCCEEDED, AND LOST THE WORDS
 * ============================================================================
 *
 * Measured 2026-09-22, on this parser as shipped in Part A. Given ordinary SRT:
 *
 *     1
 *     00:00:01,000 --> 00:00:04,000
 *     Hello there
 *
 * it returned **ok** with two cues whose text was `"--> 00:00:04,000"`. The
 * range line matched the COLLAPSED shape -- a timestamp, whitespace, then
 * "text" -- so the arrow and the end time became the spoken words, and
 * "Hello there" was discarded entirely.
 *
 * That is the worst available outcome, and not a near miss: it is a SUCCESS
 * carrying a transcript of a video in which nobody said anything except a row
 * of timestamps. Every citation built on it would resolve, render, and quote
 * punctuation. It is the same shape as the summary this module already refuses,
 * and as the three defects in LESSONS_LEARNED -- a failure and an answer
 * converging on one value.
 *
 * `-->` IS A DEFINITIVE SIGNAL, not a heuristic. Neither shape of YouTube's
 * panel ever contains it: the panel declares starts only, so there is no range
 * to write. Its presence means the paste is a caption FILE, which this
 * application already parses correctly under its own format.
 */
const CAPTION_FILE_MARKERS = /(^|\n)\s*(WEBVTT\b|.*-->)/;

export function parseYouTubeTranscriptPanel(
  source: string,
): Result<KnowledgeTranscriptParse, DomainError> {
  // REFUSED BEFORE ANYTHING IS PARSED, and named so the person can act on it.
  // "Choose a different format" is a fix they can apply in one click; a generic
  // parse failure would leave them re-copying a transcript that was never the
  // problem.
  if (CAPTION_FILE_MARKERS.test(source)) {
    return err(domainError(
      'validation',
      'This looks like an SRT or WebVTT caption file, not a copy of YouTube’s transcript panel. Choose SubRip (.srt) or WebVTT (.vtt) as the format instead.',
    ));
  }

  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  // Every line before the first timestamp is panel CHROME -- a header like
  // "Transcript" or "Search transcript", and localised equivalents. Discarded
  // wholesale rather than matched against a list of strings, which would be
  // wrong on the next locale (the same reason the accessibility label is
  // recognised by shape).
  const starts: { startMs: number; text: string }[] = [];
  let open: { startMs: number; textLines: string[] } | null = null;
  let sawTimestamp = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    // 1. A bare timestamp opens a cue (the triple shape's line 1). If a cue is
    //    already open with no text, it is empty and contributes nothing.
    const bareStart = parseKnowledgeTranscriptTimestamp(line);
    if (bareStart !== null) {
      sawTimestamp = true;
      if (open && open.textLines.length > 0) {
        starts.push({ startMs: open.startMs, text: open.textLines.join(' ') });
      }
      open = { startMs: bareStart, textLines: [] };
      continue;
    }

    // 2. The collapsed shape: timestamp and text on one line. Complete in
    //    itself, so any cue still open is closed first.
    const collapsed = splitCollapsedLine(line);
    if (collapsed !== null) {
      sawTimestamp = true;
      if (open && open.textLines.length > 0) {
        starts.push({ startMs: open.startMs, text: open.textLines.join(' ') });
      }
      starts.push(collapsed);
      open = null;
      continue;
    }

    // 3. An accessibility label restates the offset in words. Discarded, and
    //    never allowed to become cue text.
    if (isAccessibilityLabel(line)) continue;

    // 4. Anything else is TEXT, and belongs to the cue currently open. Text
    //    before any timestamp is chrome that happened to not be a header line;
    //    there is no cue for it to belong to yet.
    if (open) open.textLines.push(line);
  }
  if (open && open.textLines.length > 0) {
    starts.push({ startMs: open.startMs, text: open.textLines.join(' ') });
  }

  if (starts.length === 0) {
    // Two different failures, reported differently. A paste with no timestamp
    // at all is not a transcript of this shape; a paste whose timestamps were
    // all empty is a transcript with no words. The user's next action differs.
    return err(domainError(
      'validation',
      sawTimestamp
        ? 'This transcript has timestamps but no words beside them'
        : 'This does not look like a transcript copied from YouTube’s transcript panel',
    ));
  }

  // The density rule (see the constant above). Applied only above one cue.
  if (starts.length >= 2) {
    const spanMs = starts[starts.length - 1].startMs - starts[0].startMs;
    if (spanMs / starts.length > KNOWLEDGE_TRANSCRIPT_PANEL_MAX_MS_PER_CUE) {
      return err(domainError(
        'validation',
        'This looks like a summary, not a transcript — its timestamps are too far apart to be cues.',
      ));
    }
  }

  // ==========================================================================
  // DERIVED ENDS. The panel declares STARTS ONLY, so every end below is
  // synthesised and the result says so via `endsAreDerived`. A citation carries
  // a range, and a wrong end silently widens or narrows what a quote claims to
  // cover -- the reader sees a precise-looking timestamp either way. SRT and VTT
  // declare both times; recording the difference is what stops a later reader
  // mistaking these for source data.
  // ==========================================================================
  const cues: KnowledgeTranscriptCue[] = [];
  const derivedDurations: number[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const cue = starts[index];
    // Each cue ends where the NEXT one starts -- the only end the paste implies.
    const nextStart = index + 1 < starts.length ? starts[index + 1].startMs : null;
    if (nextStart !== null) {
      cues.push({ index, startMs: cue.startMs, endMs: nextStart, text: cue.text });
      derivedDurations.push(nextStart - cue.startMs);
    } else {
      // THE FINAL CUE. Its end is unknowable from the paste, so it is the
      // median of this transcript's OWN derived durations -- data, not a
      // constant. A NON-ZERO end is load-bearing: `cuesIntersectingRange`
      // excludes cues where charEnd <= charStart and intersects only when
      // cue.endMs > startMs, so a zero-length tail cue would be a silent hole
      // no citation could ever reach.
      const endMs = cue.startMs + medianDerivedDuration(derivedDurations);
      cues.push({ index, startMs: cue.startMs, endMs, text: cue.text });
    }
  }

  // A non-increasing start would make a derived end precede its own start,
  // which downstream code assumes cannot happen. The panel is in reading order;
  // a file that is not is refused rather than reordered, because reordering
  // would silently rewrite what the person copied.
  for (const cue of cues) {
    if (cue.endMs < cue.startMs) {
      return err(domainError('validation', 'This transcript has a cue that ends before it starts'));
    }
  }

  return ok({
    format: 'youtube-panel',
    cues,
    // The panel declares no language. Never inferred from the text.
    declaredLanguage: null,
    endsAreDerived: true,
  });
}
