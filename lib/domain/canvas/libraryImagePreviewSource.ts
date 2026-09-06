/**
 * What a Library Image tile looks like RIGHT NOW.
 *
 * The sibling of resolveImagePostDisplaySrc, for the one surface that owns a
 * field the board does not: `library_items.thumbnail_url`. Both answer the same
 * question -- "what is the current raster?" -- and both exist because the
 * alternative is two orderings of the same list drifting apart, which is
 * exactly the defect this fixes.
 *
 * Runtime proved it. After a Draw save, the Library row was correct in three
 * places at once -- `thumbnail_url`, `content.file_url` and
 * `content.metadata.drawing` all held the annotated composite -- and the panel
 * still painted the original crop, because its chain asked
 * `content.metadata.imageUrl` first and that field is always present.
 *
 * The ordering below is the product rule, not a preference:
 *
 *   thumbnail_url            the Library object's OWN current thumbnail, the
 *                            field persistDurableImageContent writes on save
 *   content.file_url         the durable current raster of the same row
 *   content.metadata.drawing the flattened composite, for rows saved before
 *                            the durable fields carried it
 *   ...then the legacy base fallbacks, in their original order
 *
 * `metadata.imageUrl` is the BASE image an editor starts from, so it ranks
 * BELOW every field that can hold a newer composite -- and it is deliberately
 * still reachable, so an Image that was never annotated renders exactly as it
 * always did.
 *
 * Display only. Nothing here tells an editor what to load, and nothing here
 * writes: a stale tile is a rendering bug, never a reason to repair data.
 *
 * Pure and browser-safe: no React, no DOM, no fetch.
 */

export interface LibraryImagePreviewSource {
  readonly thumbnail_url?: unknown;
  readonly content?: {
    readonly file_url?: unknown;
    readonly metadata?: {
      readonly drawing?: unknown;
      readonly previewUrl?: unknown;
      readonly imageUrl?: unknown;
      readonly file_url?: unknown;
      readonly linkImage?: unknown;
    } | null;
  } | null;
}

/** Accepts a data: URL as readily as an http one -- a saved composite is both. */
const usableUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * The current raster for a Library IMAGE item, or null when it has none.
 *
 * Callers apply this to image-type items only; every other Library type keeps
 * its own preview chain untouched.
 */
export function resolveLibraryImagePreviewSrc(
  item: LibraryImagePreviewSource | null | undefined,
): string | null {
  if (!item) return null;
  const content = item.content ?? null;
  const metadata = content?.metadata ?? null;

  // Current durable representation, strongest first.
  if (usableUrl(item.thumbnail_url)) return item.thumbnail_url;
  if (usableUrl(content?.file_url)) return content.file_url;
  if (usableUrl(metadata?.drawing)) return metadata.drawing;

  // Legacy fallbacks, in the order the panel already used them.
  if (usableUrl(metadata?.previewUrl)) return metadata.previewUrl;
  if (usableUrl(metadata?.imageUrl)) return metadata.imageUrl;
  if (usableUrl(metadata?.file_url)) return metadata.file_url;
  if (usableUrl(metadata?.linkImage)) return metadata.linkImage;
  return null;
}
