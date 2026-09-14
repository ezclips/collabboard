/**
 * IMAGE-LIBRARY: the one place that writes durable Image CONTENT.
 *
 * The product rule is that a Library Image owns the image, its drawing and its
 * text, while the board post owns only placement -- so a saved edit has to
 * reach BOTH the placement and the SAME linked `library_items` row. This module
 * exists because that rule was implemented once, inside the image editor's own
 * save, and the Freeform "Draw on image" arm reached none of it: runtime proved
 * a saved stroke wrote `padlets.metadata` alone, leaving the board annotated
 * and the durable Library object showing the original crop.
 *
 * Extracted rather than re-implemented. Two copies of an ownership rule is how
 * the second arm drifted from the first in the first place.
 */

import { parseKnowledgePdfAreaProvenance, knowledgePdfAreaImageUrl } from '../../domain/knowledge/knowledgePdfAreaImagePolicy';

export interface DurableImageContentClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: unknown }>;
    };
  };
}

export interface DurableImageContentInput {
  /** The placement being saved. */
  readonly padletId: string;
  /**
   * May this caller still write shared board content RIGHT NOW?
   *
   * Required, and read BETWEEN the two writes below. The placement update
   * and the Library update are one product rule but two requests, and the
   * authority can go away in the gap: this is what stops the second one
   * starting for a caller who has lost the right to make it.
   *
   * No allow-by-default -- a call site that forgets it must not compile.
   */
  readonly mayContinue: () => boolean;
  /**
   * The durable object the placement references, when it has one. A legacy or
   * reused post may legitimately have none, and that is not an error: the
   * placement still saves, and no Library object is invented for it.
   */
  readonly libraryItemId?: string | null;
  /** The authoritative saved representation -- what both surfaces render. */
  readonly imageUrl: string;
  /**
   * The post's full metadata AFTER the edit. Passed in whole and stored as
   * given: callers preserve their own unrelated keys, which is what keeps
   * `source` (PDF-area provenance) intact through a drawing save.
   */
  readonly metadata: Record<string, unknown>;
  readonly title?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  /**
   * CROP_ORIGINAL_PRESERVATION_1: whether this edit should also sync the
   * linked Library item. Defaults to true -- unchanged behavior for every
   * existing caller (Draw, the Image editor's save). Crop and Reset Crop
   * explicitly pass false: crop is placement-local, so it must never
   * rewrite a Library object another placement may also reference.
   */
  readonly syncLibrary?: boolean;
}

/**
 * Writes one Image edit to the placement and, when linked, to its durable
 * Library row.
 *
 * The Library snapshot mirrors what `create_image_post_with_library_item`
 * builds, so one object cannot end up with two snapshot layouts.
 *
 * Authority stays with RLS. `Users can update their own library items` is
 * `auth.uid() = user_id`, so annotating a placement that REUSES someone else's
 * Library image matches no row and changes nothing -- their durable object is
 * not ours to rewrite. No service-role client is involved, deliberately.
 *
 * Errors are NOT swallowed: a caller that reports success must have seen this
 * resolve.
 */
/**
 * Three distinguishable states, because a caller must be able to tell an
 * untouched board from a half-written one:
 *
 * `denied` -- the authority was already gone when this was called. NOTHING
 * was written: no placement, no Library row. The caller settles nothing and
 * keeps whatever retry identity it holds.
 *
 * `placement-only` -- the placement WAS saved and the authority went away
 * before the Library row could follow. The placement is not reversed; the
 * caller is told so it starts nothing further.
 *
 * `complete` -- both writes landed (or there was no linked Library row).
 *
 * These are expected outcomes, not errors: none of them throws.
 */
export type DurableImageContentOutcome = 'denied' | 'placement-only' | 'complete';

export async function persistDurableImageContent(
  client: DurableImageContentClient,
  input: DurableImageContentInput,
): Promise<DurableImageContentOutcome> {
  // Asked BEFORE the primary write, not only between the two. This helper is
  // the choke point every durable image edit goes through, so a caller whose
  // own entry guard passed and then lost the authority still writes nothing.
  if (!input.mayContinue()) return 'denied';

  const savedAt = new Date().toISOString();

  const placement = await client
    .from('padlets')
    .update({
      file_url: input.imageUrl,
      metadata: input.metadata,
      updated_at: savedAt,
    })
    .eq('id', input.padletId);
  if (placement?.error) throw placement.error;

  // The placement is committed from here on and is not ours to undo. What
  // must not happen is the SECOND write starting without authority.
  if (!input.mayContinue()) return 'placement-only';

  const linkedLibraryItemId = (input.syncLibrary ?? true) ? (input.libraryItemId ?? null) : null;
  if (!linkedLibraryItemId) return 'complete';

  const durable = await client
    .from('library_items')
    .update({
      content: {
        title: input.title ?? 'Image',
        content: '',
        type: 'image',
        width: input.width ?? 300,
        height: input.height ?? 200,
        file_url: input.imageUrl,
        metadata: input.metadata,
      },
      thumbnail_url: input.imageUrl,
      updated_at: savedAt,
    })
    .eq('id', linkedLibraryItemId);
  if (durable?.error) throw durable.error;
  return 'complete';
}

/**
 * CROP_ORIGINAL_PRESERVATION_1: the reset source for a crop about to
 * overwrite metadata.imageUrl. Whatever the placement already remembers (a
 * prior crop's own original) is preserved unchanged; a new one is derived
 * -- from the durable BASE image, never the current composite/drawing --
 * only when none exists yet. This is what makes repeated crops keep
 * resetting to the SAME first original rather than drifting to whatever
 * the previous crop produced.
 */
export function deriveCropOriginalImageUrl(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  const existing = metadata?.originalImageUrl;
  if (typeof existing === 'string' && existing) return existing;
  const base = metadata?.imageUrl;
  return typeof base === 'string' && base ? base : undefined;
}

/** Whether a placement's metadata carries a recoverable pre-crop original. */
export function hasRecoverableCropOriginal(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const original = metadata?.originalImageUrl;
  return typeof original === 'string' && original.length > 0;
}

/**
 * The metadata Reset Crop persists: imageUrl restored to the preserved
 * original, and every field that no longer describes it removed --
 * originalImageUrl itself (nothing left to reset to a second time) and the
 * baked crop/drawing composite (it was pixels of the image just discarded).
 * Everything else -- caption, card styling, PDF-area provenance, import
 * identity -- is carried through untouched.
 */
export function buildResetCropMetadata(
  metadata: Record<string, unknown> | null | undefined,
  originalImageUrl: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  delete next.originalImageUrl;
  delete next.drawing;
  delete next.drawingPaths;
  delete next.drawingText;
  next.imageUrl = originalImageUrl;
  return next;
}

// CROP_ORIGINAL_PRESERVATION_CORRECTION_1: the one recoverable-source decision both
// toolbars share -- metadata.originalImageUrl, else (pre-existing PDF-area crops) the
// canonical deterministic PDF-area URL its own provenance proves, no network/storage/DB
// read, only while the current image has drifted from it (so a reset re-hides Reset Crop).
export function resolveCropResetSource(
  metadata: Record<string, unknown> | null | undefined,
  boardId: string | null | undefined,
  padletId: string | null | undefined,
): string | null {
  const explicit = metadata?.originalImageUrl;
  if (typeof explicit === 'string' && explicit) return explicit;
  const provenance = parseKnowledgePdfAreaProvenance(metadata ?? null);
  const deterministic = provenance && typeof boardId === 'string' && typeof padletId === 'string'
    ? knowledgePdfAreaImageUrl(boardId, padletId) : null;
  const current = metadata?.imageUrl;
  return deterministic && typeof current === 'string' && current !== deterministic ? deterministic : null;
}
