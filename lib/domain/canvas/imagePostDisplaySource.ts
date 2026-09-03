/**
 * R6D -- the ONE answer to "what does an Image post look like right now?".
 *
 * An Image post can carry two rasters:
 *
 *   metadata.imageUrl  the BASE image, which is what every EDITOR starts from
 *   metadata.drawing   a FLATTENED composite of that base plus the Draw-on-top
 *                      strokes, shapes and text, produced by ImageDrawingLayer
 *                      at the original image resolution
 *
 * DISPLAY must prefer the composite, because that is what the user drew and
 * expects to see. EDITING must keep using the base, because drawing on top of
 * an already-flattened composite would bake each pass in permanently -- which
 * is why this helper is deliberately NOT used by the crop/draw editors or by
 * CanvasClient's editor-facing resolveImageSrc.
 *
 * It exists because the board card and the image modal had drifted apart: the
 * card put `drawing` first and the modal put `imageUrl` first, so a saved
 * drawing was visible on the board and invisible in the modal that was meant
 * to preview it. Two orderings of the same list is exactly the kind of thing
 * that needs one home.
 *
 * Pure and browser-safe: no React, no DOM, no fetch.
 */

/** Only the fields display cares about; anything padlet-shaped satisfies it. */
export interface ImagePostDisplaySource {
  readonly metadata?: {
    readonly imageUrl?: unknown;
    readonly drawing?: unknown;
    readonly fileUrl?: unknown;
    readonly file_url?: unknown;
  } | null;
  readonly file_url?: unknown;
  readonly image_url?: unknown;
  readonly content?: unknown;
}

const usableUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** A bare `content` string counts only when it is actually a URL. */
const contentUrl = (value: unknown): string | null =>
  typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;

/**
 * What to paint for this Image post, or null when it has no raster at all.
 *
 * The composite wins. Everything after it is the pre-existing fallback chain,
 * unchanged in order, so posts with no drawing behave exactly as before.
 */
export function resolveImagePostDisplaySrc(padlet: ImagePostDisplaySource | null | undefined): string | null {
  if (!padlet) return null;
  const metadata = padlet.metadata ?? null;

  // The flattened Draw-on-top result, when one has been saved.
  if (usableUrl(metadata?.drawing)) return metadata.drawing;

  if (usableUrl(metadata?.imageUrl)) return metadata.imageUrl;
  if (usableUrl(metadata?.fileUrl)) return metadata.fileUrl;
  if (usableUrl(metadata?.file_url)) return metadata.file_url;
  if (usableUrl(padlet.image_url)) return padlet.image_url;
  if (usableUrl(padlet.file_url)) return padlet.file_url;
  return contentUrl(padlet.content);
}

/**
 * Whether this post currently has a saved Draw-on-top composite.
 *
 * Display-only: it says what to render, never whether editing is allowed.
 */
export function hasImagePostDrawingOverlay(padlet: ImagePostDisplaySource | null | undefined): boolean {
  return usableUrl(padlet?.metadata?.drawing);
}
