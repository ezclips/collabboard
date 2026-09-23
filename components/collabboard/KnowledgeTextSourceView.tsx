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

import React, { useEffect, useMemo, useRef } from 'react';

import { knowledgeTranscriptReadingBlocks }
  from '@/lib/domain/knowledge/knowledgeTranscriptReadingLayout';
import type { KnowledgeTranscriptStoredRepresentation }
  from '@/lib/domain/knowledge/knowledgeTranscriptVersion';

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
        */}
        {blocks === null ? (
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
          <p className="whitespace-normal break-words text-[15px] leading-7 text-gray-800">
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
