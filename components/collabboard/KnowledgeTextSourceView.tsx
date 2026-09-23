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
import { AI_ROLE_SOURCE } from '@/lib/ai/aiRoles';

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
  const readableAbortRef = useRef<AbortController | null>(null);
  const readableGenerationRef = useRef(0);

  useEffect(() => () => { readableAbortRef.current?.abort(); }, []);

  /**
   * THE INSTRUCTION IS A REQUEST, NOT THE GUARANTEE, and it says so here so a
   * later reader does not mistake the prompt for the safety property. The
   * guarantee is `projectTranscriptPunctuation`: the model's text is discarded
   * and the output rebuilt from the original words.
   */
  const PUNCTUATE_INSTRUCTION = 'Add only punctuation (periods, commas, question marks, exclamation '
    + 'marks, semicolons, colons, em dashes), capitalisation, and apostrophes or hyphens within words '
    + '(for example "kings" may become "king\'s" and "setup based" may become "setup-based"). Do not '
    + 'add, remove, reorder, merge or split any word. Return only the punctuated text, with no '
    + 'preamble, commentary or quotation.';

  /**
   * One chunk, punctuated and PROJECTED. Mirrors KnowledgeSourceAIPanel's
   * request shape exactly -- the same route, the same role, the same abort and
   * generation guard -- rather than inventing a second one.
   *
   * The four fields are the whole body: no document id, no board id, no cue
   * data and no offsets go with this request.
   *
   * THE THREE OUTCOMES ARE DISTINCT, deliberately: a REFUSED chunk (the model
   * changed the words) renders raw with a count, while a FAILED request (non-200,
   * network, timeout) is a different thing and is reported as one. Collapsing
   * them would present an outage as a partial result.
   */
  const punctuateChunk = async (
    chunk: string,
    signal: AbortSignal,
  ): Promise<{ status: 'projected'; text: string } | { status: 'refused' } | { status: 'failed' }> => {
    const timer = setTimeout(() => readableAbortRef.current?.abort(), 30_000);
    try {
      const res = await fetch('/api/ai/text-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          action: 'custom',
          selectedText: chunk,
          instruction: PUNCTUATE_INSTRUCTION,
          purpose: AI_ROLE_SOURCE,
        }),
      });
      if (!res.ok) return { status: 'failed' };
      const parsed = await res.json().catch(() => null);
      if (!parsed || typeof parsed.text !== 'string') return { status: 'failed' };
      const projected = projectTranscriptPunctuation(chunk, parsed.text);
      // A REFUSED chunk renders its RAW text -- visibly, with the count shown
      // by the caller. It never invalidates the rest.
      return projected.ok ? { status: 'projected', text: projected.value.text } : { status: 'refused' };
    } catch {
      return { status: 'failed' };
    } finally {
      clearTimeout(timer);
    }
  };

  const runPunctuation = async () => {
    if (typeof text !== 'string' || text.length === 0) return;
    readableAbortRef.current?.abort();
    const controller = new AbortController();
    readableAbortRef.current = controller;
    const generation = ++readableGenerationRef.current;
    setReadablePhase('loading');
    const chunks = transcriptPunctuationChunks(text);
    try {
      const outcomes = await Promise.all(
        chunks.map((chunk) => punctuateChunk(text.slice(chunk.charStart, chunk.charEnd), controller.signal)),
      );
      if (readableGenerationRef.current !== generation) return;
      // EVERY chunk failed the request itself: that is an outage, not a partial
      // result, so the raw text stays and the error is stated.
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
                Could not make a readable version. Showing the original.
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
