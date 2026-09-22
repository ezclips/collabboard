"use client";

// WHICH VIDEO PLAYERS ARE ON SCREEN RIGHT NOW, and how to seek them.
//
// A citation into a transcript knows a video identity and a moment. A media
// card knows how to play that video. Neither knows about the other, and they
// sit on opposite sides of a 5,800-line component -- so this is the one small
// thing in between: a registry a card writes itself into while it is mounted,
// and a citation reads.
//
// ============================================================================
// A MODULE-LEVEL MAP RATHER THAN A CONTEXT, DELIBERATELY
// ============================================================================
//
// A React context would be the reflex, and it would force every media card and
// the chat drawer under one shared provider. They are not under one today: the
// drawer is mounted as a shell-level sibling of the canvas precisely so it does
// not inherit the canvas's stacking and transform, and moving either one to
// satisfy a context would undo a placement made for a harder reason.
//
// The cost of a module map is that it is global to the tab. That is bounded by
// keying on VIDEO IDENTITY, which is global too -- `yt:8IlJ3v8I4Z8` means the
// same video in every board -- and by every entry being removed on unmount, so
// a player from a board that is no longer open cannot be found.
//
// ============================================================================
// WHY SEEKING CAN FAIL, AND WHY THAT IS FINE
// ============================================================================
//
// The card may be unmounted, virtualised away, or on another board. The player
// may not have loaded yet. So `seekBoardVideo` returns a boolean and the caller
// has a real fallback -- opening the video on YouTube at the same second. It
// must never be read as "the timestamp was wrong".

export interface BoardVideoPlayerHandle {
  /** Jump to this many seconds and, where the player allows it, start playing. */
  seekTo(seconds: number): void;
  /** Bring the card into view, so the person sees what just moved. */
  reveal?(): void;
}

/**
 * Several cards can hold the SAME video, so each entry is a set.
 *
 * Keyed by the canonical identity (`yt:<id>`), which is what makes a citation
 * able to find a card at all: the citation knows the identity the importer
 * claimed, and the card knows the URL it renders. Only a canonical form brings
 * those together -- see mediaPostVideoIdentity.
 */
const players = new Map<string, Set<BoardVideoPlayerHandle>>();

/** Registers a mounted player. The returned function MUST run on unmount. */
export function registerBoardVideoPlayer(
  videoIdentity: string,
  handle: BoardVideoPlayerHandle,
): () => void {
  const existing = players.get(videoIdentity);
  if (existing) existing.add(handle);
  else players.set(videoIdentity, new Set([handle]));

  return () => {
    const set = players.get(videoIdentity);
    if (!set) return;
    set.delete(handle);
    // The empty set is removed rather than left behind, so `has` cannot report
    // a video whose last card is gone.
    if (set.size === 0) players.delete(videoIdentity);
  };
}

/** Is any player for this video on screen? Used to decide what a link offers. */
export function hasBoardVideoPlayer(videoIdentity: string): boolean {
  return (players.get(videoIdentity)?.size ?? 0) > 0;
}

/**
 * Seek every player of this video, and reveal the first.
 *
 * EVERY player, because two cards of one video should not disagree about where
 * the video is after a citation was clicked -- one showing 7:50 and the other
 * still at 0:00 is a board contradicting itself. Only the FIRST is scrolled
 * into view: revealing several is not possible, and choosing one is better than
 * fighting over the viewport.
 *
 * Returns false when nothing could be seeked, which is the caller's signal to
 * fall back rather than a report that the moment was wrong.
 */
export function seekBoardVideo(videoIdentity: string, startMs: number): boolean {
  const set = players.get(videoIdentity);
  if (!set || set.size === 0) return false;
  // WHOLE SECONDS, ROUNDED DOWN, matching knowledgeTranscriptVideoUrl exactly.
  // The click and the link must land on the same frame, or the same citation
  // means two different things depending on which way it was followed.
  const seconds = Math.max(0, Math.floor(startMs / 1000));
  let seeked = false;
  let revealed = false;
  for (const handle of set) {
    try {
      handle.seekTo(seconds);
      seeked = true;
      if (!revealed) {
        handle.reveal?.();
        revealed = true;
      }
    } catch {
      // One broken player must not stop the others. A player that throws is
      // typically one mid-unmount, and the next is usually fine.
    }
  }
  return seeked;
}

/** Test seam only: forget every registration. */
export function resetBoardVideoPlayers(): void {
  players.clear();
}
