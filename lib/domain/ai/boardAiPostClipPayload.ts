/**
 * What a board post carries when it is dragged into the Board AI composer.
 *
 * Pure and browser-safe: no React, no fetch, no Supabase, no DOM, so the card,
 * the drawer and the tests share one shape. It mirrors
 * `knowledgeSourceClipPayload` deliberately -- same one-dedicated-MIME rule,
 * same fail-closed parse -- because a second drag contract with different
 * habits is how one of them ends up trusting `text/plain`.
 *
 * PARSING HERE IS CLIENT HYGIENE, NEVER AUTHORITY. The id below is not
 * evidence of anything. The drop resolves it against the board's OWN loaded
 * posts and produces nothing if it does not match one, and the server
 * re-authorizes every context item on every turn regardless. What this buys is
 * that a foreign or malformed transfer fails on the client before it can reach
 * a request at all.
 */

/**
 * One dedicated transfer type. Deliberately NOT `text/plain`: every drag from
 * every application carries text/plain, so honouring it would let arbitrary
 * dropped text impersonate a board post.
 */
export const BOARD_AI_POST_CLIP_MIME = 'application/collabboard-board-post';

export interface BoardAiPostClipPayload {
  /** The padlet the drag started from. Resolved by the receiver, never trusted. */
  readonly padletId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function boardAiPostClipPayload(padletId: string): string {
  return JSON.stringify({ padletId } satisfies BoardAiPostClipPayload);
}

/**
 * The parse, which refuses everything it is not certain of. A shape it does not
 * recognise is not a post, and an id that is not a uuid cannot be one of ours --
 * so neither reaches the resolver, and the drop reads as "nothing happened"
 * rather than as a silently wrong attachment.
 */
export function parseBoardAiPostClipPayload(raw: string | null | undefined): BoardAiPostClipPayload | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const padletId = (parsed as { padletId?: unknown }).padletId;
  if (typeof padletId !== 'string' || !UUID.test(padletId)) return null;
  return { padletId };
}
