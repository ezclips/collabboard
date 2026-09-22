// WHAT A MEDIA CARD SHOULD SAY ABOUT ITS TRANSCRIPT.
//
// One pure function answering one question -- given the board's transcripts and
// this post's URL, what goes on the card? -- so that the 5,800-line canvas
// component holds no policy, and so the policy can be tested without a DOM.
//
// ============================================================================
// WHY THIS IS KEYED ON THE VIDEO AND NOT ON THE POST
// ============================================================================
//
// A transcript belongs to a VIDEO, and a board can hold the same video on
// several cards -- someone links it in a column, someone else drops it in a
// group. Keying the transcript to a post id would make each of those cards ask
// for its own copy of the same words: the same paste three times, three
// documents, three sets of chunks, and Board AI quoting whichever it found
// first. Keying on the video is what makes W1 true without any extra
// mechanism -- the second card simply finds the transcript already there.
//
// ============================================================================
// THE STATE THIS MUST NEVER PRODUCE
// ============================================================================
//
// `attached` for a video that is not the one on the card. That is
// mis-attribution: the transcript renders, the timestamps resolve, the words
// are fluent and they belong to a different video. Nothing on screen looks
// wrong. So the match runs through `mediaPostTranscriptIsReusable`, which
// requires a provider-canonical id and refuses a merely-similar URL -- and
// every OTHER state here is a safe answer, because the worst an over-eager
// `none` can cost is one paste the person did not need to make.

import {
  mediaPostTranscriptIsReusable,
  mediaPostVideoIdentity,
  type MediaPostProvider,
} from './mediaPostVideoIdentity';
import type { KnowledgeDocumentProcessingStatus } from './knowledgePersistence';
import type { KnowledgeTranscriptFormat } from './knowledgeTranscriptCues';

/** One transcript the board holds, as the card needs to see it. */
export interface BoardTranscriptIndexEntry {
  readonly documentId: string;
  readonly title: string;
  /** The importer's claim about which video this describes. May be absent. */
  readonly videoIdentity: string | null;
  readonly format: KnowledgeTranscriptFormat;
  readonly processingStatus: KnowledgeDocumentProcessingStatus;
  readonly updatedAt: string;
}

export type MediaPostTranscriptState =
  /** Not media this application can transcribe. The card shows nothing. */
  | { readonly kind: 'unsupported' }
  /** Media, and this board has no transcript for it. Offer the paste. */
  | { readonly kind: 'none'; readonly provider: MediaPostProvider }
  /** Stored and usable. */
  | { readonly kind: 'ready'; readonly entry: BoardTranscriptIndexEntry }
  /** Stored, still being chunked and indexed. Not an error; not usable yet. */
  | { readonly kind: 'processing'; readonly entry: BoardTranscriptIndexEntry }
  /**
   * Stored and BROKEN, which is a different thing from absent and must look
   * different (W3). A card that falls back to "Add transcript" on a failure
   * invites the person to paste the same words again and get the same result,
   * with nothing telling them the first attempt is still sitting there.
   */
  | { readonly kind: 'failed'; readonly entry: BoardTranscriptIndexEntry };

/**
 * ORDERING IS DEFINED, because two transcripts can legitimately claim one
 * video: someone re-imported under a new document instead of replacing, or two
 * people pasted the same panel at once. The card shows ONE, so which one is a
 * decision rather than whatever the database returned first.
 *
 * A READY transcript wins over a processing one, and a processing one over a
 * failed one. The reason is what each state costs the reader: showing `failed`
 * while a working transcript sits beside it tells them the video has no usable
 * transcript, which is false and which they will act on. Showing `ready` while
 * a failed duplicate exists tells them they can cite it, which is true.
 *
 * Within one status the most recently updated wins.
 */
const STATUS_RANK: Record<KnowledgeDocumentProcessingStatus, number> = {
  ready: 3,
  processing: 2,
  uploaded: 2,
  failed: 1,
};

function preferred(
  a: BoardTranscriptIndexEntry,
  b: BoardTranscriptIndexEntry,
): BoardTranscriptIndexEntry {
  const rankA = STATUS_RANK[a.processingStatus];
  const rankB = STATUS_RANK[b.processingStatus];
  if (rankA !== rankB) return rankA > rankB ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}

/**
 * What the card for `url` should show, given every transcript on this board.
 *
 * The index is passed in whole rather than queried per card: a board renders
 * many cards at once, and one list read shared between them is the difference
 * between one request and one request per link post.
 */
export function mediaPostTranscriptState(
  url: string,
  index: readonly BoardTranscriptIndexEntry[],
): MediaPostTranscriptState {
  const identity = mediaPostVideoIdentity(url);
  if (identity === null) return { kind: 'unsupported' };

  let match: BoardTranscriptIndexEntry | null = null;
  for (const entry of index) {
    if (!mediaPostTranscriptIsReusable(entry.videoIdentity, url)) continue;
    match = match === null ? entry : preferred(match, entry);
  }

  if (match === null) return { kind: 'none', provider: identity.provider };
  if (match.processingStatus === 'failed') return { kind: 'failed', entry: match };
  if (match.processingStatus === 'ready') return { kind: 'ready', entry: match };
  return { kind: 'processing', entry: match };
}

/**
 * Whether a card in this state should offer "Add transcript".
 *
 * A SEPARATE FUNCTION RATHER THAN A `kind === 'none'` TEST AT THE CALL SITE,
 * because `failed` also offers an action and the two must not be written out
 * by hand in a component where the distinction is easy to flatten back into
 * "no usable transcript -> offer paste".
 */
export function mediaPostOffersTranscriptPaste(state: MediaPostTranscriptState): boolean {
  return state.kind === 'none' || state.kind === 'failed';
}

/**
 * The `videoIdentity` to send with an import started from this card.
 *
 * NULL FOR AN UNCERTAIN IDENTITY, DELIBERATELY. Storing a URL-shaped identity
 * would make the next card with a similar URL believe it had found a match,
 * turning a guess made once into an attribution relied on afterwards. A
 * transcript with no claimed video is honest and still cites its character
 * range; it simply offers no moment to open.
 */
export function transcriptImportVideoIdentity(url: string): string | null {
  const identity = mediaPostVideoIdentity(url);
  if (identity === null || !identity.canonical) return null;
  return identity.identity;
}
