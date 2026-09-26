"use client";

// Reading a source that has no pages.
//
// The PDF reader's unit is the page: it paginates, renders page images, and
// addresses a citation as "document + page + a range inside that page". A text
// or Markdown source has none of that. It is one continuous canonical string,
// and a citation into it is a half-open character range over exactly that
// string -- the same string the chunker hashed, the same one the chunks
// reproduce when concatenated, and the same one the server returns.
//
// SO THE HIGHLIGHT IS NOT A SEARCH. Nothing here looks for the quoted words.
// The range is applied by index, because the offsets are authoritative and
// searching for text would find the wrong occurrence of a repeated phrase --
// which is the failure this whole stage exists to avoid: a citation that lands
// a little way from what it quotes.
//
// ONE COMPONENT, BOTH PRESENTATIONS. The docked drawer and the focused
// workspace differ in geometry, not in content, exactly as the PDF reader's
// two hosts do. Everything below is host-agnostic; the hosts supply width.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { knowledgeTranscriptReadingBlocks }
  from '@/lib/domain/knowledge/knowledgeTranscriptReadingLayout';
import type { KnowledgeTranscriptStoredRepresentation }
  from '@/lib/domain/knowledge/knowledgeTranscriptVersion';
import {
  projectTranscriptPunctuation,
  readableTranscriptParagraphs,
  transcriptPunctuationChunks,
} from '@/lib/domain/knowledge/transcriptPunctuationProjection';
import PlanLimitNotice, { planLimitFromResponse } from '@/components/billing/PlanLimitNotice';

export interface KnowledgeTextSourceHighlight {
  /** Inclusive, in UTF-16 code units of the canonical text. */
  readonly charStart: number;
  /** Exclusive. */
  readonly charEnd: number;
  /**
   * A new id for a new intent. Clicking the same citation twice is two
   * requests to be taken there, not one -- the same contract the page reader's
   * `pageNavigationRequestId` has.
   */
  readonly requestId: number;
}

export interface KnowledgeTextSourceViewProps {
  readonly documentId: string;
  readonly originalFilename: string;
  /** The canonical text. The offsets below index into THIS string. */
  readonly text: string | null;
  readonly loading?: boolean;
  readonly error?: boolean;
  readonly highlight?: KnowledgeTextSourceHighlight | null;
  /** Which host is drawing it. Geometry only. */
  readonly presentation: 'workspace' | 'side-panel';
  /**
   * PATCH-159. Present ONLY for a transcript, carried from the server row rather
   * than derived here -- the same rule the PDF reader's prop records: inferring
   * "transcript" from the text's shape would eventually call a Markdown file a
   * transcript. `null`/absent means NOT a transcript and renders exactly as
   * before.
   */
  readonly transcriptRepresentation?: KnowledgeTranscriptStoredRepresentation | null;
  /**
   * PATCH-188. The board this transcript belongs to, so a Readable run pays
   * from its owner's plan. Optional: absent on a mount with no board (a test,
   * or a host that genuinely has none), and never sent as an empty string.
   */
  readonly boardId?: string;
}

/**
 * The text split into what is highlighted and what is not.
 *
 * FAILS OPEN TOWARDS THE DOCUMENT, not towards the highlight: a range that
 * does not describe this text yields the whole document unhighlighted, because
 * a reader that shows the source and marks nothing is right about the source,
 * while one that marks an arbitrary span is wrong about both. Clamping to fit
 * would be the worst of the three -- it would produce a confident highlight
 * over characters nobody cited.
 */
export function splitKnowledgeTextHighlight(
  text: string,
  highlight: { charStart: number; charEnd: number } | null | undefined,
): { before: string; marked: string; after: string } | null {
  if (!highlight) return null;
  const { charStart, charEnd } = highlight;
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return null;
  if (charStart < 0 || charEnd <= charStart || charEnd > text.length) return null;
  return {
    before: text.slice(0, charStart),
    marked: text.slice(charStart, charEnd),
    after: text.slice(charEnd),
  };
}

export default function KnowledgeTextSourceView({
  documentId,
  originalFilename,
  text,
  loading = false,
  error = false,
  highlight,
  presentation,
  transcriptRepresentation,
  boardId,
}: KnowledgeTextSourceViewProps) {
  const markRef = useRef<HTMLElement | null>(null);
  const handledRequestRef = useRef<number | null>(null);

  /**
   * PATCH-159. Reading blocks, for a TRANSCRIPT only.
   *
   * THE SAME CONSTRAINT THE FILE ALREADY STATES, now applied to grouping:
   * offsets index the SOURCE text, so the blocks are a contiguous partition and
   * the rendered textContent still reconstructs `text` verbatim. Only CSS and
   * grouping change -- never a character.
   *
   * NULL MEANS NOT A TRANSCRIPT, and it is the single flag the render reads.
   */
  const isTranscript = transcriptRepresentation != null;
  const blocks = useMemo(
    () => (isTranscript && typeof text === 'string' ? knowledgeTranscriptReadingBlocks(text) : null),
    [isTranscript, text],
  );

  const split = useMemo(
    () => (typeof text === 'string' ? splitKnowledgeTextHighlight(text, highlight) : null),
    [text, highlight],
  );

  /**
   * PATCH-160. The readable view, derived and held ONLY for this session.
   *
   * NOTHING HERE IS PERSISTED, and the canonical text is never touched: the
   * readable string is a display-only derivation, so the moment a highlight is
   * on screen the raw view is forced (its offsets are the coordinate space; the
   * readable text's offsets differ by construction).
   */
  const [readable, setReadable] = useState<'as-spoken' | 'readable'>('as-spoken');
  const [readablePhase, setReadablePhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /** Per-chunk projected text, or null when that chunk was refused (renders raw). */
  const [chunkResults, setChunkResults] = useState<readonly (string | null)[] | null>(null);
  /** PATCH-188. The plan-limit refusal's message, or null for every other failure. */
  const [readablePlanLimit, setReadablePlanLimit] = useState<string | null>(null);
  const readableAbortRef = useRef<AbortController | null>(null);
  const readableGenerationRef = useRef(0);
  /**
   * PATCH-188. The plan-limit message of the current run, seen in the batch
   * loop before the phase is committed. A ref, not state: it is read in the
   * same tick it is written, and the phase change is what re-renders.
   */
  const readablePlanLimitRef = useRef<string | null>(null);

  useEffect(() => () => { readableAbortRef.current?.abort(); }, []);

  /**
   * PATCH-178. The batch route's own limits, mirrored so the client batches
   * correctly: twelve passages per request, and 50 s per batch.
   */
  const PASSAGES_PER_BATCH = 12;
  const BATCH_TIMEOUT_MS = 50_000;

  /**
   * One passage's outcome, in the shape the row state uses.
   *
   * A REFUSED passage (the server's projection refused AND its retry refused)
   * renders raw, as does a FAILED one (the request or the model call failed) --
   * both become `null` below. The distinction is kept only long enough to tell
   * an OUTAGE (every passage failed) from a partial result.
   */
  type PassageOutcome =
    | { status: 'projected'; text: string }
    | { status: 'refused' }
    | { status: 'failed' };

  /**
   * ONE BATCH, punctuated by the batch route and RE-PROJECTED here.
   *
   * The server already projected every passage through the same
   * `projectTranscriptPunctuation`, so this second pass can only agree -- but it
   * runs anyway, so everything that reaches the screen has been projected IN
   * THIS FILE too. A batch that fails is all `failed`; it never invalidates the
   * other batches.
   */
  const punctuateBatch = async (
    passages: readonly string[],
    signal: AbortSignal,
  ): Promise<PassageOutcome[]> => {
    const failedAll = (): PassageOutcome[] => passages.map(() => ({ status: 'failed' }));
    try {
      const res = await fetch('/api/ai/transcript-punctuate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        // PATCH-188. Omitted when absent, never sent as undefined or ''.
        body: JSON.stringify({ passages, ...(boardId ? { boardId } : {}) }),
      });
      if (!res.ok) {
        // PATCH-188. A plan-limit refusal is the one failure with its own
        // message; every other failure keeps the caller's fixed text below.
        const body = await res.json().catch(() => null);
        const planLimit = planLimitFromResponse(res.status, body);
        if (planLimit) readablePlanLimitRef.current = planLimit.message;
        return failedAll();
      }
      const parsed = await res.json().catch(() => null);
      const results = parsed && Array.isArray(parsed.results) ? parsed.results : null;
      if (results === null || results.length !== passages.length) return failedAll();
      return passages.map((passage, index): PassageOutcome => {
        const outcome = results[index];
        if (!outcome || outcome.status !== 'projected' || typeof outcome.text !== 'string') {
          return { status: outcome?.status === 'refused' ? 'refused' : 'failed' };
        }
        // SECOND CHECK: re-project the server's text against this passage.
        const projected = projectTranscriptPunctuation(passage, outcome.text);
        return projected.ok ? { status: 'projected', text: projected.value.text } : { status: 'refused' };
      });
    } catch {
      return failedAll();
    }
  };

  const runPunctuation = async () => {
    if (typeof text !== 'string' || text.length === 0) return;
    readableAbortRef.current?.abort();
    const controller = new AbortController();
    readableAbortRef.current = controller;
    const generation = ++readableGenerationRef.current;
    setReadablePhase('loading');
    // A new run starts clean: a previous plan-limit refusal never leaks into it.
    readablePlanLimitRef.current = null;
    setReadablePlanLimit(null);
    const chunks = transcriptPunctuationChunks(text);
    const passages = chunks.map((chunk) => text.slice(chunk.charStart, chunk.charEnd));
    try {
      // ONE BATCH AT A TIME, in order: a 60-minute video is ~6 requests, not 60.
      const outcomes: PassageOutcome[] = [];
      for (let start = 0; start < passages.length; start += PASSAGES_PER_BATCH) {
        const batch = passages.slice(start, start + PASSAGES_PER_BATCH);
        const timer = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
        let batchOutcomes: PassageOutcome[];
        try {
          batchOutcomes = await punctuateBatch(batch, controller.signal);
        } finally {
          clearTimeout(timer);
        }
        if (readableGenerationRef.current !== generation) return;
        outcomes.push(...batchOutcomes);
      }
      // PATCH-188. A plan-limit refusal takes precedence over the partial/outage
      // branches: the whole request is refused, and the user needs to see why.
      if (readablePlanLimitRef.current !== null) {
        setReadablePlanLimit(readablePlanLimitRef.current);
        setReadablePhase('error');
        return;
      }
      // EVERY passage failed the request itself: that is an outage, not a
      // partial result, so the raw text stays and the error is stated.
      if (outcomes.length > 0 && outcomes.every((outcome) => outcome.status === 'failed')) {
        setReadablePhase('error');
        return;
      }
      setChunkResults(outcomes.map((outcome) => (outcome.status === 'projected' ? outcome.text : null)));
      setReadablePhase('ready');
    } catch {
      if (readableGenerationRef.current !== generation) return;
      setReadablePhase('error');
    }
  };

  /** The toggle's one handler: first press runs, afterwards it is free. */
  const toggleReadable = () => {
    if (readable === 'as-spoken') {
      setReadable('readable');
      if (readablePhase === 'idle' || readablePhase === 'error') void runPunctuation();
      return;
    }
    setReadable('as-spoken');
  };

  /** How many chunks kept their original wording (refused, or never run). */
  const refusedChunks = chunkResults === null
    ? 0
    : chunkResults.filter((result) => result === null).length;

  /**
   * The readable text, rebuilt from the ORIGINAL characters plus each chunk's
   * projection. A refused chunk contributes the original slice unchanged, so
   * the readable view is never missing words -- only missing punctuation.
   */
  const readableText = useMemo(() => {
    if (typeof text !== 'string' || chunkResults === null) return null;
    const chunks = transcriptPunctuationChunks(text);
    return chunks
      .map((chunk, index) => chunkResults[index] ?? text.slice(chunk.charStart, chunk.charEnd))
      .join('');
  }, [text, chunkResults]);

  const readableParagraphs = useMemo(
    () => (readableText === null ? null : readableTranscriptParagraphs(readableText)),
    [readableText],
  );

  /**
   * Scroll to the highlight once per REQUEST, not once per render.
   *
   * Keyed on requestId for the reason the page reader is: a second click on
   * the same citation is a new intent and must move the view again, while a
   * re-render for an unrelated reason must not yank a reader who has scrolled
   * away. `block: 'center'` so the cited span lands with its context around
   * it rather than jammed against the top edge.
   */
  useEffect(() => {
    if (!highlight || !split) return;
    if (handledRequestRef.current === highlight.requestId) return;
    const node = markRef.current;
    if (!node) return;
    handledRequestRef.current = highlight.requestId;
    // Marked handled BEFORE the call, and the call itself is optional: a host
    // without scrollIntoView (an older browser, a test environment) must still
    // render the highlight. The citation is shown either way; only the
    // convenience of being scrolled to it is lost.
    node.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [highlight, split]);

  if (loading) {
    return (
      <div
        data-knowledge-text-source="loading"
        className="flex h-full items-center justify-center text-sm text-gray-500"
      >
        Opening {originalFilename || 'document'}…
      </div>
    );
  }

  if (error || typeof text !== 'string') {
    return (
      <div
        data-knowledge-text-source="error"
        className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500"
      >
        This source could not be opened.
      </div>
    );
  }

  return (
    <div
      data-knowledge-text-source="ready"
      data-knowledge-text-source-document={documentId}
      data-knowledge-text-source-presentation={presentation}
      // The range the reader believes it is showing, so a live check can
      // compare it against the citation that asked -- and see nothing at all
      // when a malformed range was refused above.
      data-knowledge-text-source-range={split ? `${highlight!.charStart}:${highlight!.charEnd}` : undefined}
      className="h-full min-h-0 overflow-y-auto"
    >
      <article
        className={[
          'mx-auto w-full px-5 py-6',
          // The only difference between the hosts: a focused workspace has the
          // whole viewport and would otherwise set lines far too long to read,
          // so the measure is capped. The docked drawer is already narrow.
          presentation === 'workspace' ? 'max-w-3xl' : '',
        ].join(' ')}
      >
        {/*
          PATCH-160. The readable toggle, for a TRANSCRIPT only. A Markdown or
          .txt source has punctuation already, so the control never renders
          there.
        */}
        {isTranscript ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-knowledge-transcript-readable-toggle="true"
              data-knowledge-transcript-readable-state={readable}
              disabled={split !== null}
              aria-pressed={readable === 'readable'}
              title={split !== null
                ? 'Showing a citation — the words it points at are the original ones'
                : undefined}
              onClick={split !== null ? undefined : toggleReadable}
              className={[
                'rounded border px-2 py-0.5 text-[11px]',
                split !== null
                  ? 'cursor-not-allowed border-gray-200 text-gray-400'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              {readable === 'readable' ? 'Readable' : 'As spoken'}
            </button>
            {/* A highlight forces the raw view, with the reason stated. */}
            {split !== null ? (
              <span data-knowledge-transcript-readable-forced="true" className="text-[11px] text-gray-500">
                Showing the original text because a citation is highlighted.
              </span>
            ) : null}
            {readablePhase === 'loading' ? (
              <span data-knowledge-transcript-readable-status="loading" className="text-[11px] text-gray-500">
                Adding punctuation…
              </span>
            ) : null}
            {readablePhase === 'error' ? (
              <span data-knowledge-transcript-readable-status="error" className="text-[11px] text-amber-700">
                {readablePlanLimit !== null
                  // PATCH-188. A plan-limit refusal has its own message and the
                  // shared "See plans" link; every other failure is unchanged.
                  ? <PlanLimitNotice message={readablePlanLimit} />
                  : 'Could not make a readable version. Showing the original.'}
              </span>
            ) : null}
            {/*
              NEVER PRESENT A PARTIAL RESULT AS COMPLETE. A refused chunk renders
              raw, and this line names how many, so a half-punctuated view is
              not mistaken for a successful one.
            */}
            {readablePhase === 'ready' && refusedChunks > 0 ? (
              <span data-knowledge-transcript-readable-partial="true" className="text-[11px] text-amber-700">
                {refusedChunks} of {chunkResults!.length} passages kept their original wording.
              </span>
            ) : null}
          </div>
        ) : null}

        {/*
          `whitespace-pre-wrap` because the canonical text IS the document:
          its blank lines separate paragraphs and its indentation can be
          meaningful. Rendering Markdown to HTML would break the contract this
          view rests on -- offsets index the SOURCE text, and a renderer that
          reorders, drops or inserts characters makes every one of them wrong.
          Stage 1 shows Markdown as its source, and says so by doing it.

          PATCH-159. A TRANSCRIPT is the exception, and it is a different kind
          of document: speech, not source text. Its line breaks are caption
          timings rather than authored structure, and monospace is what makes it
          read like a log. So it renders as reading blocks cut at those line
          boundaries, with collapsed whitespace -- while the DOM text nodes, and
          therefore every offset, stay byte-identical. Group and restyle, never
          rewrite.

          PATCH-160. READABLE is a second transcript view, derived and
          display-only. A highlight forces the raw view (above), so the readable
          text's different offsets can never be mistaken for the canonical ones.
        */}
        {isTranscript && readable === 'readable' && readablePhase === 'ready' && readableText !== null
          ? (
            <div data-knowledge-transcript-readable="true" data-knowledge-transcript-text="true">
              {(readableParagraphs ?? []).map((paragraph, index) => (
                <p
                  key={`paragraph-${paragraph.charStart}`}
                  data-transcript-readable-paragraph=""
                  className={index === (readableParagraphs ?? []).length - 1
                    ? 'whitespace-normal break-words text-[15px] leading-7 text-gray-800'
                    : 'mb-4 whitespace-normal break-words text-[15px] leading-7 text-gray-800'}
                >
                  {readableText.slice(paragraph.charStart, paragraph.charEnd)}
                </p>
              ))}
            </div>
          )
          : blocks === null ? (
          <p className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-gray-800">
            {split === null ? text : (
              <>
                {split.before}
                <mark
                  ref={markRef}
                  data-knowledge-text-source-highlight="true"
                  className="rounded-sm bg-yellow-200 px-0.5 text-gray-900"
                >
                  {split.marked}
                </mark>
                {split.after}
              </>
            )}
          </p>
        ) : (
          <p
            data-knowledge-transcript-text="true"
            className="whitespace-normal break-words text-[15px] leading-7 text-gray-800"
          >
            {(() => {
              // The highlight range, clamped PER BLOCK below. Absolute always:
              // a rebased offset would mark the wrong characters.
              const markedStart = split === null ? null : highlight!.charStart;
              const markedEnd = split === null ? null : highlight!.charEnd;
              // The scroll anchor goes on the FIRST mark only -- the fragment
              // holding the highlight's true start -- so a citation scrolls to
              // the start of the quote, not to its second paragraph.
              let anchored = false;
              return blocks.map((block, blockIndex) => (
                <span
                  key={`block-${block.charStart}`}
                  data-transcript-reading-block=""
                  className={blockIndex === blocks.length - 1 ? 'block' : 'block mb-4'}
                >
                  {markedStart === null || markedEnd === null
                    || markedEnd <= block.charStart || markedStart >= block.charEnd
                    ? text.slice(block.charStart, block.charEnd)
                    : (() => {
                      const from = Math.max(markedStart, block.charStart);
                      const to = Math.min(markedEnd, block.charEnd);
                      const first = !anchored;
                      if (first) anchored = true;
                      return (
                        <>
                          {text.slice(block.charStart, from)}
                          <mark
                            ref={first ? markRef : undefined}
                            data-knowledge-text-source-highlight="true"
                            className="rounded-sm bg-yellow-200 px-0.5 text-gray-900"
                          >
                            {text.slice(from, to)}
                          </mark>
                          {text.slice(to, block.charEnd)}
                        </>
                      );
                    })()}
                </span>
              ));
            })()}
          </p>
        )}
      </article>
    </div>
  );
}
