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
export async function persistDurableImageContent(
  client: DurableImageContentClient,
  input: DurableImageContentInput,
): Promise<void> {
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

  const linkedLibraryItemId = input.libraryItemId ?? null;
  if (!linkedLibraryItemId) return;

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
}
