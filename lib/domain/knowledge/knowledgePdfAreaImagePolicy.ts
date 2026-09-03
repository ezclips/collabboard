import { normalizeStorableRegion, type NormalizedPageRegion } from './knowledgePageRegionGeometry';

/**
 * R6B -- the one place that decides where a PDF area crop lives, how it is
 * addressed, and how a card proves it is one.
 *
 * PRIVACY IS THE WHOLE POINT. A crop of a Knowledge PDF is exactly as private
 * as the PDF it came from, so it is stored in the SAME private bucket as the
 * document (`knowledge-documents`) and is never published to `padlet-files`,
 * `images`, `thumbnails` or any other public bucket. There is consequently no
 * public URL, no signed URL and no permanent token anywhere in this module:
 * the only address a crop has is a same-origin API route that re-authorises
 * the board on every single request, so revoking a collaborator revokes the
 * image with it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The crop is WebP because the page derivative it is cut from already is. */
export const KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE = 'image/webp';
export const KNOWLEDGE_PDF_AREA_IMAGE_EXTENSION = 'webp';

/** The discriminator stored on the card, and the only value the image route serves. */
export const KNOWLEDGE_PDF_AREA_SOURCE_KIND = 'knowledge-pdf-area';

/**
 * The deterministic object path, or null when it cannot be built.
 *
 * `board-derived/{boardId}/pdf-areas/{padletId}.webp` -- derived ENTIRELY from
 * two ids the server has already validated. Nothing user-supplied reaches it:
 * no filename, no client-sent path, no random suffix. Both ids must be UUIDs,
 * which is what makes `..` and `/` unrepresentable rather than escaped.
 *
 * Keying by padlet id (not document id) means the crop's lifetime is the
 * card's lifetime, and the serving route can re-derive the path from its own
 * route parameters instead of trusting a stored string.
 */
export function knowledgePdfAreaImagePath(boardId: string, padletId: string): string | null {
  if (typeof boardId !== 'string' || !UUID.test(boardId)) return null;
  if (typeof padletId !== 'string' || !UUID.test(padletId)) return null;
  return `board-derived/${boardId}/pdf-areas/${padletId}.${KNOWLEDGE_PDF_AREA_IMAGE_EXTENSION}`;
}

/**
 * The card's image address. Same-origin and relative on purpose: an absolute
 * URL would survive an export or a copy into another board and keep pointing
 * at bytes the new context may not be allowed to read.
 */
export function knowledgePdfAreaImageUrl(boardId: string, padletId: string): string | null {
  if (typeof boardId !== 'string' || !UUID.test(boardId)) return null;
  if (typeof padletId !== 'string' || !UUID.test(padletId)) return null;
  return `/api/boards/${boardId}/padlets/${padletId}/image`;
}

/**
 * Typed provenance, stored on the card so the crop always says what it is a
 * crop OF. This is the record a reviewer, an export and the "open source"
 * affordance all read -- and it is what the image route requires before it
 * will serve a single byte.
 */
export interface KnowledgePdfAreaProvenance {
  readonly kind: typeof KNOWLEDGE_PDF_AREA_SOURCE_KIND;
  readonly knowledgeDocumentId: string;
  readonly pageNumber: number;
  readonly region: NormalizedPageRegion;
}

export function buildKnowledgePdfAreaProvenance(
  knowledgeDocumentId: string,
  pageNumber: number,
  region: NormalizedPageRegion,
): KnowledgePdfAreaProvenance {
  return {
    kind: KNOWLEDGE_PDF_AREA_SOURCE_KIND,
    knowledgeDocumentId,
    pageNumber,
    region: { x: region.x, y: region.y, width: region.width, height: region.height },
  };
}

/**
 * Reads provenance back off a stored card, failing closed.
 *
 * The image route uses this as an authorisation gate, not as decoration: a
 * padlet whose metadata does not parse here is NOT an area image, and the
 * route refuses it rather than deriving a path for an arbitrary card id. That
 * is what stops the route from becoming a general reader of the private
 * bucket.
 */
export function parseKnowledgePdfAreaProvenance(metadata: unknown): KnowledgePdfAreaProvenance | null {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const source = (metadata as Record<string, unknown>).source;
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  if (record.kind !== KNOWLEDGE_PDF_AREA_SOURCE_KIND) return null;
  const { knowledgeDocumentId, pageNumber } = record;
  if (typeof knowledgeDocumentId !== 'string' || !UUID.test(knowledgeDocumentId)) return null;
  if (!Number.isInteger(pageNumber) || (pageNumber as number) < 1) return null;
  const region = normalizeStorableRegion(record.region);
  if (region === null) return null;
  return buildKnowledgePdfAreaProvenance(knowledgeDocumentId, pageNumber as number, region);
}
