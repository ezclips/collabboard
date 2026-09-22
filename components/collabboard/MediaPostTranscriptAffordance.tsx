"use client";

import React from 'react';

import {
  mediaPostTranscriptState,
  type BoardTranscriptIndexEntry,
} from '@/lib/domain/knowledge/boardTranscriptIndex';

/**
 * The transcript line on a media card.
 *
 * ============================================================================
 * NOT A MODAL, AND NEVER ON PASTE
 * ============================================================================
 *
 * The first proposal for this was a popup when media is added to the board.
 * It was rejected and this is why: dropping ten links would produce ten
 * interruptions, each one asking a question the person did not come here to
 * answer. An affordance ON THE CARD asks nothing. It sits there, it is visible
 * when the card is, and it waits -- which is also the only design that works
 * for the video somebody added last week.
 *
 * ============================================================================
 * FOUR STATES, AND THE ONE THAT USUALLY GETS FLATTENED
 * ============================================================================
 *
 *   nothing stored  -> offer the paste
 *   processing      -> say so; offer nothing, because there is nothing to do
 *   ready           -> say so; this is the dedupe answer (W1) as well, since a
 *                      second card of the same video lands here rather than
 *                      asking for the same words again
 *   FAILED          -> say THAT, and offer the action
 *
 * The fourth is the one that gets folded into the first, because "no usable
 * transcript" describes both. It must not be: a card that shows "Add
 * transcript" over a failed import invites the person to paste the same words
 * and get the same failure, with nothing on screen admitting the first attempt
 * exists. W3 asks for an actionable failure state, and this is what that means.
 */
export interface MediaPostTranscriptAffordanceProps {
  /** The URL this card points at. The question is asked fresh for it each render. */
  readonly url: string;
  readonly index: readonly BoardTranscriptIndexEntry[];
  /**
   * False until the index has actually been READ. A failed read must not be
   * rendered as "this video has no transcript" -- see useBoardTranscriptIndex.
   */
  readonly indexLoaded: boolean;
  /** Viewers see status but are never offered an action they cannot take. */
  readonly canEdit: boolean;
  readonly onAddTranscript: (url: string) => void;
}

export function MediaPostTranscriptAffordance({
  url,
  index,
  indexLoaded,
  canEdit,
  onAddTranscript,
}: MediaPostTranscriptAffordanceProps) {
  // SAY NOTHING UNTIL WE KNOW. Rendering during the read would flash "Add
  // transcript" onto a video that already has one.
  if (!indexLoaded) return null;

  const state = mediaPostTranscriptState(url, index);
  if (state.kind === 'unsupported') return null;

  const stop = (event: React.MouseEvent) => {
    // The card underneath opens the link and starts a drag. Neither is what
    // someone clicking this meant.
    event.preventDefault();
    event.stopPropagation();
  };

  if (state.kind === 'ready') {
    return (
      <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700" data-testid="transcript-affordance">
        <span aria-hidden="true">✓</span>
        <span>Transcript added</span>
      </div>
    );
  }

  if (state.kind === 'processing') {
    return (
      <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500" data-testid="transcript-affordance">
        <span>Transcript processing…</span>
      </div>
    );
  }

  if (state.kind === 'failed') {
    return (
      <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700" data-testid="transcript-affordance">
        {/* NAMES THE FAILURE rather than reverting to "Add transcript". The
            stored document is still there and the person needs to know that
            before they paste the same words again. */}
        <span>Transcript failed to process.</span>
        {canEdit ? (
          <button
            type="button"
            onClick={(event) => {
              stop(event);
              onAddTranscript(url);
            }}
            onPointerDown={stop}
            className="underline hover:no-underline"
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  if (!canEdit) return null;

  return (
    <div className="mt-1 flex items-center gap-1 text-[11px]" data-testid="transcript-affordance">
      <button
        type="button"
        onClick={(event) => {
          stop(event);
          onAddTranscript(url);
        }}
        onPointerDown={stop}
        className="text-blue-700 underline hover:no-underline"
      >
        Add transcript
      </button>
    </div>
  );
}

export default MediaPostTranscriptAffordance;
