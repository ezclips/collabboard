// WHICH VIDEO IS THIS LINK POST POINTING AT?
//
// One question, asked in two places that must agree:
//
//   DEDUPE (W1). Before offering "Add transcript" on a card, ask whether this
//   board already has a transcript for this video. That only works if two
//   posts of the SAME video produce the SAME answer -- and people paste
//   youtu.be/ID, youtube.com/watch?v=ID and an embed URL interchangeably.
//
//   DETACH ON CHANGE (W7). A post whose URL is edited to a different video must
//   not keep the previous video's transcript. That only works if two DIFFERENT
//   videos produce DIFFERENT answers -- and a transcript silently describing
//   the wrong video is worse than no transcript, because the timestamps still
//   land and still look right.
//
// The two requirements pull in opposite directions, and the failure modes are
// asymmetric. Answering "same" when the videos differ MIS-ATTRIBUTES a
// transcript, which is the failure this whole stream exists to prevent.
// Answering "different" when they are the same merely offers a paste the person
// did not need. So where this module is unsure, it says SO -- `canonical:
// false` -- and the callers treat an uncertain identity as good enough to
// detach on (a change is a change) but NOT as grounds to reuse someone's
// transcript.
//
// ============================================================================
// WHY THE YOUTUBE ID IS NOT PARSED HERE
// ============================================================================
//
// `extractYouTubeId` already answers exactly this question for thumbnails, and
// it handles youtu.be, watch?v=, /embed/, /shorts/ and /live/ plus a regex
// fallback for unparseable input. A second YouTube parser in this file would
// start identical and drift, and the drift would show up as a dedupe that
// stops matching -- or, once, as two posts of one video disagreeing about
// which transcript is theirs. It is pure, framework-free TypeScript, so the
// domain may import it.

import { extractYouTubeId } from '../../media/youtubeThumb';

export type MediaPostProvider =
  | 'youtube'
  | 'vimeo'
  | 'tiktok'
  | 'twitter'
  | 'instagram'
  | 'facebook'
  | 'file';

export interface MediaPostVideoIdentity {
  readonly provider: MediaPostProvider;
  /**
   * The value stored as `videoIdentity` on an imported transcript, and the key
   * dedupe compares. Provider-prefixed so two providers can never collide on a
   * bare id -- Vimeo ids are short decimals and would otherwise be easy to
   * confuse with anything else numeric.
   */
  readonly identity: string;
  /**
   * TRUE only when a provider's own stable id was extracted.
   *
   * FALSE means the identity is a normalised URL standing in for an id we could
   * not find. It is stable enough to notice a CHANGE, and deliberately not
   * trusted enough to declare two posts the same video: a URL carries tracking
   * parameters, session tokens and redirects that vary without the video
   * varying, so a URL match is a hint and a URL mismatch is not proof.
   */
  readonly canonical: boolean;
}

const VIDEO_FILE_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.ogg',
  '.ogv',
  '.mov',
  '.m4v',
  '.mkv',
  '.avi',
] as const;

const AUDIO_FILE_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.aac', '.flac', '.oga'] as const;

/**
 * The same normalisation `LinkMediaEmbed` performs before classifying a URL.
 *
 * It matters here for one reason: a post's stored `linkUrl` is whatever was
 * pasted, so `youtu.be/abc` with no scheme is common. Without the scheme the
 * URL constructor throws and every such post would fall to the uncertain path.
 */
function normaliseUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function hostOf(parsed: URL): string {
  return parsed.hostname.replace(/^www\./, '').toLowerCase();
}

/**
 * A URL reduced to the parts that identify a thing rather than a visit.
 *
 * Query and fragment are DROPPED WHOLESALE. They carry `?si=`, `?t=`,
 * `utm_*`, share tokens and playback offsets -- none of which change which
 * video this is, and all of which would split one video into many identities
 * and defeat the dedupe they were never part of.
 *
 * The trailing slash goes too, because `/video/123` and `/video/123/` are one
 * page everywhere this module cares about.
 */
function normalisedLocation(parsed: URL): string {
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.protocol}//${hostOf(parsed)}${path}`.toLowerCase();
}

function uncertain(provider: MediaPostProvider, parsed: URL): MediaPostVideoIdentity {
  return { provider, identity: `url:${normalisedLocation(parsed)}`, canonical: false };
}

/**
 * The identity of the video a link post points at, or `null` when the URL is
 * not media this application can carry a transcript for.
 *
 * `null` is not a failure: most links are articles, and an article card must
 * not sprout an "Add transcript" affordance.
 */
export function mediaPostVideoIdentity(url: string): MediaPostVideoIdentity | null {
  if (typeof url !== 'string') return null;
  const normalised = normaliseUrl(url);
  if (normalised.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalised);
  } catch {
    // UNPARSEABLE INPUT IS NOT SILENTLY GUESSED AT. The one exception is
    // YouTube, because `extractYouTubeId` has its own regex fallback for
    // exactly this case and a YouTube id found that way is still a real id.
    const fallbackId = extractYouTubeId(normalised);
    if (fallbackId !== null) {
      return { provider: 'youtube', identity: `yt:${fallbackId}`, canonical: true };
    }
    return null;
  }

  // Only http(s). A `data:` or `file:` URL has no stable public identity, and
  // a `javascript:` one has no business reaching a canonicaliser at all.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = hostOf(parsed);
  const path = parsed.pathname;

  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const id = extractYouTubeId(normalised);
    // A YouTube URL with no video id is a channel, a playlist or the home
    // page. There is no video to transcribe, so there is no identity.
    if (id === null) return null;
    return { provider: 'youtube', identity: `yt:${id}`, canonical: true };
  }

  if (host.endsWith('vimeo.com')) {
    // Vimeo's id is the first all-digit path segment: /123456789 and
    // /channels/staff/123456789 are the same video.
    const numeric = path.split('/').find((segment) => /^\d+$/.test(segment));
    if (numeric !== undefined) {
      return { provider: 'vimeo', identity: `vimeo:${numeric}`, canonical: true };
    }
    return uncertain('vimeo', parsed);
  }

  if (host.endsWith('tiktok.com')) {
    const match = /\/video\/(\d+)/.exec(path);
    if (match !== null) {
      return { provider: 'tiktok', identity: `tiktok:${match[1]}`, canonical: true };
    }
    // A `vm.tiktok.com` short link resolves to the real one only by following
    // a redirect, which this module cannot do and must not pretend to.
    return uncertain('tiktok', parsed);
  }

  if (host === 'x.com' || host.endsWith('twitter.com')) {
    const match = /\/status\/(\d+)/.exec(path);
    if (match !== null) {
      // The status id alone, deliberately: x.com and twitter.com serve one
      // post, and the author handle in the path can change without the post
      // changing.
      return { provider: 'twitter', identity: `x:${match[1]}`, canonical: true };
    }
    return uncertain('twitter', parsed);
  }

  if (host.endsWith('instagram.com')) {
    const match = /\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(path);
    if (match !== null) {
      return { provider: 'instagram', identity: `ig:${match[1]}`, canonical: true };
    }
    return uncertain('instagram', parsed);
  }

  if (host.endsWith('facebook.com') || host.endsWith('fb.watch')) {
    // Facebook video URLs come in too many shapes to claim a canonical id.
    return uncertain('facebook', parsed);
  }

  const lowerPath = path.toLowerCase();
  const isMediaFile =
    VIDEO_FILE_EXTENSIONS.some((ext) => lowerPath.endsWith(ext)) ||
    AUDIO_FILE_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
  if (isMediaFile) {
    // A direct file has no id but its location IS its identity -- with the
    // query dropped, which for a signed URL is the difference between one
    // identity and a new one every time the signature is refreshed.
    return { provider: 'file', identity: `url:${normalisedLocation(parsed)}`, canonical: false };
  }

  return null;
}

/**
 * Whether a card for this URL should offer a transcript at all.
 *
 * This is the affordance gate: videos, audio and the social platforms that
 * carry spoken media. An article link returns false and shows nothing, which
 * is the requirement that the affordance appear only on content-related posts.
 */
export function mediaPostCarriesSpokenContent(url: string): boolean {
  return mediaPostVideoIdentity(url) !== null;
}

/**
 * Has the video changed between two URLs? (W7)
 *
 * ANY DOUBT COUNTS AS CHANGED. The two sides of this question are not
 * symmetric: answering "unchanged" wrongly leaves a transcript attached to a
 * video it does not describe, while answering "changed" wrongly costs one
 * re-paste. So this returns false -- unchanged -- only when both sides yield
 * the SAME identity, and an identity that is `canonical: false` on either side
 * still compares, because a normalised URL that differs is enough to act on
 * even when a normalised URL that matches would not be enough to reuse.
 */
export function mediaPostVideoChanged(previousUrl: string, nextUrl: string): boolean {
  const previous = mediaPostVideoIdentity(previousUrl);
  const next = mediaPostVideoIdentity(nextUrl);
  // Media replaced by a non-media link is a change; so is the reverse.
  if (previous === null || next === null) return previous !== next;
  return previous.identity !== next.identity;
}

/**
 * May a transcript stored against `storedIdentity` be REUSED for this URL? (W1)
 *
 * STRICTER THAN `mediaPostVideoChanged`, and the asymmetry is the point. Reuse
 * attributes one person's transcript to another person's post, so it demands a
 * provider-canonical id on the live side: a normalised-URL match is a
 * coincidence this module is not willing to spend someone's trust on.
 */
export function mediaPostTranscriptIsReusable(
  storedIdentity: string | null,
  url: string,
): boolean {
  if (storedIdentity === null) return false;
  const identity = mediaPostVideoIdentity(url);
  if (identity === null || !identity.canonical) return false;
  return identity.identity === storedIdentity;
}
