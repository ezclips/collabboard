import type { NormalizedPageRegion } from '../../domain/knowledge/knowledgePageRegionGeometry';

/**
 * R6I -- the picture the Image creation modal shows BEFORE anything is saved.
 *
 * The drop no longer creates a card, so the modal has to show the chosen region
 * while no crop exists yet. The bytes come from the page image the Reader has
 * ALREADY loaded and the user is already authorised to see: it is same-origin,
 * so it can be drawn to a canvas without tainting it, and no new request is
 * made for it.
 *
 * This is DRAFT DISPLAY ONLY and is never an image authority:
 *
 *  - it is never sent to the server (Save posts identity + rectangle, exactly
 *    as the drop used to, and the server re-crops from its own derivative);
 *  - it is never written to a padlet, so it cannot reach the database;
 *  - it lives in memory for the life of one draft and is dropped on close.
 *
 * It is deliberately NOT put on the DataTransfer. A drag payload carrying crop
 * bytes would make a private PDF reconstructible from a drag, which is the one
 * thing R6B's transfer contract exists to prevent -- so the transfer keeps
 * carrying identity and a rectangle, and the preview travels here instead,
 * in the same tab, never serialised.
 */

/** The crop rectangle in source-image pixels. */
export interface AreaPreviewCropRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/**
 * Where a normalized DISPLAY region falls on an image of the given pixel size.
 *
 * The caller passes the region already mapped through
 * `sourceRegionToDisplayRegion`, so page rotation is accounted for before this
 * sees it -- the rectangle and the pixels are then in the same orientation and
 * this is pure scaling. Returns null rather than an empty crop when the image
 * has not laid out yet, or the rectangle rounds away to nothing.
 */
export function areaPreviewCropRect(
  region: NormalizedPageRegion,
  naturalWidth: number,
  naturalHeight: number,
): AreaPreviewCropRect | null {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight)) return null;
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;

  const sx = Math.round(region.x * naturalWidth);
  const sy = Math.round(region.y * naturalHeight);
  const sw = Math.round(region.width * naturalWidth);
  const sh = Math.round(region.height * naturalHeight);
  if (sw <= 0 || sh <= 0) return null;

  // Clamp rather than trust: a rectangle that rounds a pixel past the edge
  // would make drawImage read outside the source.
  const clampedX = Math.min(Math.max(sx, 0), naturalWidth - 1);
  const clampedY = Math.min(Math.max(sy, 0), naturalHeight - 1);
  return {
    sx: clampedX,
    sy: clampedY,
    sw: Math.min(sw, naturalWidth - clampedX),
    sh: Math.min(sh, naturalHeight - clampedY),
  };
}

/**
 * Cuts `region` out of an already-loaded, same-origin page image.
 *
 * Returns null when the image is not ready or the browser refuses the export --
 * a missing preview is a fallback, never a reason to block the draft.
 */
export function renderAreaPreviewFromImage(
  image: HTMLImageElement,
  region: NormalizedPageRegion,
): string | null {
  const rect = areaPreviewCropRect(region, image.naturalWidth, image.naturalHeight);
  if (rect === null) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = rect.sw;
    canvas.height = rect.sh;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
    return canvas.toDataURL('image/webp', 0.85);
  } catch {
    // A tainted canvas would throw here. It should not -- the page image is
    // same-origin -- but a preview is not worth an exception on the drag path.
    return null;
  }
}

/**
 * The one pending preview, handed from the drag that made it to the drop that
 * opens the modal.
 *
 * A module slot rather than a prop chain because the two ends are a Reader
 * panel and the canvas surface, with no existing channel between them, and
 * only one drag can be in flight at a time. It is cleared aggressively: a
 * preview that outlives its draft is just retained memory.
 */
let pendingPreview: string | null = null;

/** Records the preview for the drag now starting, discarding any stale one. */
export function stashKnowledgeAreaDraftPreview(preview: string | null): void {
  pendingPreview = preview;
}

/** Takes ownership of the pending preview, leaving the slot empty. */
export function takeKnowledgeAreaDraftPreview(): string | null {
  const preview = pendingPreview;
  pendingPreview = null;
  return preview;
}

/** Drops the pending preview -- a drag that never became a drop. */
export function clearKnowledgeAreaDraftPreview(): void {
  pendingPreview = null;
}
