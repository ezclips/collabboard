import { sanitizeLibraryMetadata } from '@/components/collabboard/canvas/engine/utils';
import {
  knowledgePdfAreaImageUrl,
  parseKnowledgePdfAreaProvenance,
  type KnowledgePdfAreaProvenance,
} from './knowledgePdfAreaImagePolicy';

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE -- the ONE place that turns a durable
 * PDF-area Library Image into the metadata of a NEW placement.
 *
 * THE DEFECT THIS EXISTS FOR. A Library Image snapshot carries the metadata of
 * the card it was cut from, and `metadata.imageUrl` in it is that ORIGIN card's
 * board address. Reuse used to copy the snapshot verbatim, so the new card
 * inherited a URL belonging to a placement that may already be deleted --
 * `resolveImagePostDisplaySrc` reads `metadata.imageUrl` before every row-level
 * field, so the card rendered a dead address and painted nothing. Runtime
 * proved it: naturalWidth 0 on a card whose Library object was perfectly fine.
 *
 * THE CORRECTION IS LOCAL, NOT GLOBAL. The renderer's ordering is untouched --
 * it is right that a placement's own metadata outranks its row -- and instead
 * the placement-local aliases are rebound to the address of the placement they
 * now belong to. Nothing here points a board card at the owner-only Library
 * route: a collaborator may read a shared board's image without owning the
 * Library row behind it, and that stays true.
 *
 * WHICH FIELDS ARE PLACEMENT-LOCAL, from the trace of the two resolvers:
 *
 *   imageUrl   BASE image, read first by resolveImagePostDisplaySrc after the
 *              composite. Always rebound -- it is the field that broke.
 *   fileUrl    same chain, immediately after imageUrl. Rebound WHEN PRESENT.
 *   file_url   same chain, immediately after fileUrl. Rebound WHEN PRESENT.
 *
 * And which are deliberately NOT:
 *
 *   drawing    the FLATTENED composite, ranked above the base in both
 *              resolvers. It is durable content, not an address of this
 *              placement, and rebinding it would replace what the user drew
 *              with the un-annotated crop.
 *   previewUrl in this repository a DRAWING/SVG preview -- DrawingEditor writes
 *              it, PostCardContent renders it as "Drawing preview", and
 *              resolveLibraryImagePreviewSrc ranks it with the composite
 *              family, not the base image. The board renderer never reads it.
 *              Preserved untouched for the same reason as `drawing`.
 *   source     the PDF provenance. It says what the crop IS a crop of, and the
 *              serve route requires it to still match the Library object's own.
 *
 * Pure and browser-safe: no React, no DOM, no fetch, no mutation of its input.
 */

/** The placement being created: both ids are the SERVER's, never a browser's. */
export interface KnowledgePdfAreaPlacementTarget {
  readonly boardId: string;
  readonly padletId: string;
}

export interface KnowledgePdfAreaPlacementMetadata {
  /** The rebound metadata for the new placement. A fresh object every time. */
  readonly metadata: Record<string, unknown>;
  /** The target board address every rebound alias now holds. */
  readonly imageUrl: string;
  /** The provenance carried over, already parsed and canonical. */
  readonly provenance: KnowledgePdfAreaProvenance;
}

/**
 * The placement-local base-image aliases, in the order the board renderer
 * consults them. `imageUrl` is written unconditionally; the other two are
 * rebound only where the snapshot already had them, because inventing an alias
 * would be inventing a claim about a field the source never made.
 */
export const KNOWLEDGE_PDF_AREA_PLACEMENT_URL_ALIASES = ['imageUrl', 'fileUrl', 'file_url'] as const;

/**
 * Canonical SEMANTIC equality for two provenances.
 *
 * Never reference equality, and never JSON string equality: these arrive from
 * two different rows, parsed separately, and `1` and `1.0` are the same page.
 * Both sides are compared after `parseKnowledgePdfAreaProvenance` has already
 * normalised them, so this is a field-by-field float64 comparison of values
 * that are known finite.
 */
export function knowledgePdfAreaProvenanceMatches(
  a: KnowledgePdfAreaProvenance | null | undefined,
  b: KnowledgePdfAreaProvenance | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.knowledgeDocumentId !== b.knowledgeDocumentId) return false;
  if (a.pageNumber !== b.pageNumber) return false;
  return a.region.x === b.region.x
    && a.region.y === b.region.y
    && a.region.width === b.region.width
    && a.region.height === b.region.height;
}

/**
 * The metadata a reused PDF-area placement must carry, or null when the input
 * is not a durable PDF-area Image after all.
 *
 * Null is a REFUSAL, not a fallback: the caller must then leave the ordinary
 * reuse path alone rather than write a half-rebound card.
 */
export function buildKnowledgePdfAreaPlacementMetadata(
  libraryMetadata: unknown,
  target: KnowledgePdfAreaPlacementTarget,
): KnowledgePdfAreaPlacementMetadata | null {
  // The snapshot must prove it IS a PDF-area image before anything is derived
  // from it. This is the same gate the serve route and the SQL mirror apply.
  const provenance = parseKnowledgePdfAreaProvenance(libraryMetadata);
  if (provenance === null) return null;

  const imageUrl = knowledgePdfAreaImageUrl(target.boardId, target.padletId);
  // Both ids are validated as UUIDs there; a null means one of them is not, and
  // nothing may be written under it.
  if (imageUrl === null) return null;

  // The EXISTING sanitation contract, imported rather than restated: a second
  // copy of that field list is exactly how the two would drift apart.
  // sanitizeLibraryMetadata already returns a fresh shallow object, so the
  // caller's metadata is never written through.
  const metadata = sanitizeLibraryMetadata(
    libraryMetadata as Record<string, unknown>,
  ) as Record<string, unknown>;

  // Always. This is the field the runtime failure was.
  metadata.imageUrl = imageUrl;
  // Only where the snapshot already carried them.
  for (const alias of KNOWLEDGE_PDF_AREA_PLACEMENT_URL_ALIASES) {
    if (alias === 'imageUrl') continue;
    if (Object.prototype.hasOwnProperty.call(metadata, alias)) metadata[alias] = imageUrl;
  }

  return { metadata, imageUrl, provenance };
}
