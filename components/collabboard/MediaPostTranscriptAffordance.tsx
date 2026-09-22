"use client";

import React from 'react';

import {
  mediaPostTranscriptState,
  type BoardTranscriptIndexEntry,
} from '@/lib/domain/knowledge/boardTranscriptIndex';

/**
 * The transcript STATUS line on a media card. Information only — no action.
 *
 * ============================================================================
 * THE ACTION LIVES IN THE RIGHT-CLICK MENU, NOT HERE
 * ============================================================================
 *
 * Owner decision, 2026-09-22. The first build put an "Add transcript" button on
 * the card itself; it moved to the link post's context menu, beside Edit, Copy
 * link address and the rest, where every other thing you can DO to a post
 * already lives. A card carrying its own button is a card whose layout changes
 * depending on state, on a board where cards are dragged, resized and stacked.
 *
 * WHAT STAYED IS NOT AN OVERSIGHT. Status is a fact about the board, not an
 * action on it: whether this video has a transcript, is still processing, or
 * failed is something a viewer needs to see without opening a menu — and a
 * viewer cannot open an action menu at all. The distinction is the whole reason
 * this component still exists.
 *
 * THREE STATES, AND THE ONE THAT USUALLY GETS FLATTENED:
 *
 *   nothing stored -> say nothing. The menu offers the action; a card that
 *                     announced every video it lacks a transcript for would
 *                     shout on a board full of links.
 *   processing     -> say so.
 *   ready          -> say so. This is also the dedupe answer (W1): a second
 *                     card of the same video reports the transcript rather
 *                     than inviting the same paste again.
 *   FAILED         -> say THAT. It gets folded into "nothing stored" because
 *                     "no usable transcript" describes both, and it must not
 *                     be: silence over a failed import leaves the person
 *                     pasting the same words again with nothing on screen
 *                     admitting the first attempt is still sitting there.
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
}

export function MediaPostTranscriptAffordance({
  url,
  index,
  indexLoaded,
}: MediaPostTranscriptAffordanceProps) {
  // SAY NOTHING UNTIL WE KNOW. Rendering during the read would flash a claim
  // about a video whose transcript we had not looked for yet.
  if (!indexLoaded) return null;

  const state = mediaPostTranscriptState(url, index);

  if (state.kind === 'ready') {
    return (
      <div
        className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700"
        data-testid="transcript-status"
      >
        <span aria-hidden="true">✓</span>
        <span>Transcript added</span>
      </div>
    );
  }

  if (state.kind === 'processing') {
    return (
      <div
        className="mt-1 flex items-center gap-1 text-[11px] text-gray-500"
        data-testid="transcript-status"
      >
        <span>Transcript processing…</span>
      </div>
    );
  }

  if (state.kind === 'failed') {
    return (
      <div
        className="mt-1 flex items-center gap-1 text-[11px] text-amber-700"
        data-testid="transcript-status"
      >
        {/* Names the failure. The retry is in the right-click menu, which is
            where the person will look for it once they know to. */}
        <span>Transcript failed to process.</span>
      </div>
    );
  }

  // 'none' and 'unsupported' both render nothing.
  return null;
}

export default MediaPostTranscriptAffordance;
