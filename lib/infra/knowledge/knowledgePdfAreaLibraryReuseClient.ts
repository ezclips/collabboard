import { parseKnowledgePdfAreaProvenance } from '../../domain/knowledge/knowledgePdfAreaImagePolicy';

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE -- the ONE rule for "does this Library
 * placement have to go through the trusted server path?", and the ONE way to
 * ask for it.
 *
 * WHY A SHARED MODULE. A Library item can become a board card at several
 * boundaries: the canvas drop branch, the layout-aware drop branch, and the
 * shared adders every layout component calls up into. If each decided for
 * itself what a "PDF-area image" is, the paths would drift and one of them
 * would keep doing an ordinary browser INSERT -- which is exactly the defect
 * runtime found, and exactly what a second detection rule would reintroduce.
 * So detection is one pure predicate and placement is one request, and every
 * boundary uses both.
 *
 * WHAT IT IS NEVER ALLOWED TO GUESS. Not the title, not the file extension,
 * not the URL shape. A durable PDF-area Library Image is proved by three facts
 * and nothing else:
 *
 *   1. it carries a durable Library identity (the reuse reference);
 *   2. it is an Image;
 *   3. its metadata parses as genuine knowledge-pdf-area provenance, through
 *      the SAME parser the server and the SQL mirror use.
 *
 * Anything failing any of the three is an ordinary Library item and keeps the
 * path it has always had.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything the trusted endpoint needs, and nothing it must not be told. */
export interface KnowledgePdfAreaLibraryPlacementIntent {
  readonly boardId: string;
  readonly libraryItemId: string;
  readonly positionX: number;
  readonly positionY: number;
}

export type KnowledgePdfAreaLibraryPlacementResult =
  | { readonly ok: true; readonly padlet: Record<string, unknown> }
  | { readonly ok: false; readonly status: number | null };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asUuid = (...candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && UUID.test(candidate)) return candidate;
  }
  return null;
};

const asNumber = (...candidates: unknown[]): number => {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return 0;
};

/**
 * THE canonical classifier.
 *
 * Returns the placement intent when this row/draft/drag payload is a durable
 * PDF-area Library Image that must be placed by the server, or null when it is
 * anything else -- an ordinary Image, a Note, a fresh card with no Library
 * identity, or a snapshot whose provenance does not parse.
 *
 * It accepts every key style the existing boundaries already use (`board_id`
 * or `boardId`, `library_item_id` or `libraryItemId`, `position_x` or
 * `positionX`) because those boundaries are pre-existing and are not being
 * reshaped here -- only routed.
 *
 * Pure: no fetch, no DOM, no mutation of its argument.
 */
export function readKnowledgePdfAreaLibraryPlacement(
  row: unknown,
  fallbackBoardId?: string | null,
): KnowledgePdfAreaLibraryPlacementIntent | null {
  const record = asRecord(row);
  if (record === null) return null;

  // 2. an Image. A Note that happens to quote a PDF is not this.
  if (record.type !== 'image') return null;

  // 1. a durable Library identity. Without it there is nothing to reuse, and
  //    nothing the server could bind a mapping to.
  const libraryItemId = asUuid(record.library_item_id, record.libraryItemId);
  if (libraryItemId === null) return null;

  const boardId = asUuid(record.board_id, record.boardId, fallbackBoardId);
  if (boardId === null) return null;

  // 3. genuine provenance, judged by the shared parser. Never a title, an
  //    extension or a URL shape.
  if (parseKnowledgePdfAreaProvenance(record.metadata) === null) return null;

  return {
    boardId,
    libraryItemId,
    positionX: asNumber(record.position_x, record.positionX),
    positionY: asNumber(record.position_y, record.positionY),
  };
}

/**
 * What a surface must re-apply after the server has created the placement.
 *
 * The trusted endpoint takes a POSITION and nothing else -- it cannot be told
 * about containers, timeline events or scheduler slots, and it must not be:
 * every extra field would be another thing a browser could assert about a
 * private object. So a drop that asked for a container is completed in two
 * steps, and this is the second one.
 */
export interface KnowledgePdfAreaPlacementAttachment {
  /** The container the drop asked this card to live in. */
  readonly parentId: string;
  /** Placement-level metadata the surface requires (a scheduler slot). */
  readonly placementMetadata?: Record<string, unknown>;
  /**
   * Persists the container side of the relationship, given the id the SERVER
   * chose. Creating the container, or adding the child to an existing one --
   * whichever the surface's own drop semantics require.
   */
  attach(placementId: string): Promise<void>;
}

export type KnowledgePdfAreaPlacementOutcome =
  /** Not a durable PDF-area image: the caller keeps its own path, unchanged. */
  | { readonly kind: 'not-applicable' }
  | { readonly kind: 'placed'; readonly padlet: Record<string, unknown> }
  /** It WAS one, and it could not be placed as asked. Never insert instead. */
  | { readonly kind: 'refused'; readonly status: number | null };

export interface KnowledgePdfAreaPlacementDependencies {
  readonly boardId?: string | null;
  readonly attachment?: KnowledgePdfAreaPlacementAttachment | null;
  /** Injected so the whole sequence is executable under test. */
  readonly request?: typeof requestKnowledgePdfAreaLibraryPlacement;
  updatePlacementFields(placementId: string, fields: Record<string, unknown>): Promise<void>;
  deletePlacement(placementId: string): Promise<void>;
}

const UUID_OR_ID = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Place a durable PDF-area Library Image, and put it where the drop asked.
 *
 * THE WHOLE POINT IS THAT THE TWO HALVES CANNOT COME APART. The server creates
 * a standalone placement, because that is all a position can express. If the
 * drop wanted it inside a timeline event or a scheduler slot, the relationship
 * is written immediately afterwards with the SAME update authority the ordinary
 * path uses -- and if any part of that fails, the placement is REMOVED again.
 *
 * A card sitting outside the container the user dropped it into is not a
 * smaller failure than no card at all: it is a silently wrong board. So this
 * fails closed rather than leaving one behind, and the caller must not fall
 * back to an ordinary browser INSERT, which is the defect the trusted path
 * exists to prevent.
 */
export async function placeDurablePdfAreaLibraryImage(
  draft: unknown,
  deps: KnowledgePdfAreaPlacementDependencies,
): Promise<KnowledgePdfAreaPlacementOutcome> {
  const intent = readKnowledgePdfAreaLibraryPlacement(draft, deps.boardId ?? null);
  if (intent === null) return { kind: 'not-applicable' };

  const request = deps.request ?? requestKnowledgePdfAreaLibraryPlacement;
  const placed = await request(intent);
  if (!placed.ok) return { kind: 'refused', status: placed.status };

  const attachment = deps.attachment ?? null;
  if (attachment === null) return { kind: 'placed', padlet: placed.padlet };

  const placementId = UUID_OR_ID(placed.padlet.id);
  if (placementId === null) {
    // No id means nothing can be attached and nothing can be cleaned up. Refuse
    // rather than report a placement whose relationship was never written.
    return { kind: 'refused', status: null };
  }

  const metadata = {
    ...(placed.padlet.metadata as Record<string, unknown> | null ?? {}),
    ...(attachment.placementMetadata ?? {}),
    parentId: attachment.parentId,
  };

  try {
    await deps.updatePlacementFields(placementId, { metadata });
    await attachment.attach(placementId);
  } catch {
    // Fail closed: take the orphan back out rather than leave a card outside
    // the container it was dropped into. Deleting the padlet also cascades the
    // trusted mapping away, so no entitlement is left behind either.
    try {
      await deps.deletePlacement(placementId);
    } catch {
      // Nothing more can be done here; the caller refetches and reports.
    }
    return { kind: 'refused', status: null };
  }

  return { kind: 'placed', padlet: { ...placed.padlet, metadata } };
}

export function knowledgePdfAreaLibraryPlacementEndpoint(
  boardId: string,
  libraryItemId: string,
): string {
  return `/api/boards/${encodeURIComponent(boardId)}/library-items/${encodeURIComponent(libraryItemId)}/image-placement`;
}

/**
 * Asks the server to place the durable image.
 *
 * The body is a POSITION and nothing else: the storage path, the provenance,
 * the size, the title and the ownership claim are all read server-side from
 * rows it already trusts, so a tampered client can move the card and nothing
 * more. Field by field, never a spread of the drag payload -- the request is a
 * contract, not a passthrough.
 */
export async function requestKnowledgePdfAreaLibraryPlacement(
  intent: KnowledgePdfAreaLibraryPlacementIntent,
  fetchImpl: typeof fetch = fetch,
): Promise<KnowledgePdfAreaLibraryPlacementResult> {
  let response: Response;
  try {
    response = await fetchImpl(
      knowledgePdfAreaLibraryPlacementEndpoint(intent.boardId, intent.libraryItemId),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionX: intent.positionX, positionY: intent.positionY }),
      },
    );
  } catch {
    // A network failure is not a partial placement: nothing was created.
    return { ok: false, status: null };
  }
  if (!response.ok) return { ok: false, status: response.status };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status };
  }
  const padlet = asRecord(asRecord(body)?.padlet);
  if (padlet === null) return { ok: false, status: response.status };
  return { ok: true, padlet };
}
