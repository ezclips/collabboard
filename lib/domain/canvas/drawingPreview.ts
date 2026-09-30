/**
 * PATCH-222 -- a frameless drawing must not paint a white box.
 *
 * Excalidraw's `exportToSvg(...)` with `exportBackground: true` appends a
 * full-size background `<rect>` to the root `<svg>` (the vendored fork's
 * `scene/export.ts`, "render background rect": x=0, y=0, width/height equal to
 * the export size, `fill` = the view background colour). New previews are
 * exported transparent (see DrawingEditor), but previews already stored carry
 * that rect baked in, so it is removed from the stored data URL at render time
 * -- no migration, no re-save.
 *
 * Pure and total: it only ever transforms a `data:image/svg+xml;base64,` URL
 * whose first real child is that background rect, and returns the input
 * unchanged for anything else. It never throws, so a renderer can call it
 * safely on arbitrary stored data.
 */

const SVG_BASE64_PREFIX = 'data:image/svg+xml;base64,';

function decodeBase64Utf8(base64: string): string | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function readAttr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  if (!match) return null;
  return match[2] !== undefined ? match[2] : match[3];
}

function toNumber(value: string | null): number | null {
  if (value == null) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

/**
 * Removes Excalidraw's baked-in background `<rect>` from a base64 SVG preview.
 * Returns the input unchanged when it is not that shape (or cannot be parsed).
 */
export function stripDrawingPreviewBackground(previewUrl: string): string {
  try {
    if (typeof previewUrl !== 'string' || !previewUrl.startsWith(SVG_BASE64_PREFIX)) {
      return previewUrl;
    }
    const svg = decodeBase64Utf8(previewUrl.slice(SVG_BASE64_PREFIX.length));
    if (!svg) return previewUrl;

    const openMatch = /<svg\b[^>]*>/i.exec(svg);
    if (!openMatch) return previewUrl;
    const openTag = openMatch[0];
    const svgWidth = toNumber(readAttr(openTag, 'width'));
    const svgHeight = toNumber(readAttr(openTag, 'height'));

    let viewWidth: number | null = null;
    let viewHeight: number | null = null;
    const viewBox = readAttr(openTag, 'viewBox');
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        viewWidth = parts[2];
        viewHeight = parts[3];
      }
    }

    // Walk the root's direct children: skip whitespace, comments, the XML
    // preamble, and the three optional elements that may precede the rect.
    const skip = /^(?:\s+|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<metadata\b[^>]*>[\s\S]*?<\/metadata>|<metadata\b[^>]*\/>|<defs\b[^>]*>[\s\S]*?<\/defs>|<defs\b[^>]*\/>|<style\b[^>]*>[\s\S]*?<\/style>|<style\b[^>]*\/>)/i;
    let cursor = openMatch.index + openTag.length;
    for (;;) {
      const skipped = skip.exec(svg.slice(cursor));
      if (!skipped || skipped.index !== 0) break;
      cursor += skipped[0].length;
    }

    const rectMatch = /^<rect\b([^>]*?)\/?>/i.exec(svg.slice(cursor));
    if (!rectMatch) return previewUrl;
    const rectOpen = rectMatch[0];
    const rectAttrs = rectMatch[1];

    // SVG defaults x/y to 0; Excalidraw writes them explicitly.
    const x = toNumber(readAttr(rectAttrs, 'x'));
    const y = toNumber(readAttr(rectAttrs, 'y'));
    const w = toNumber(readAttr(rectAttrs, 'width'));
    const h = toNumber(readAttr(rectAttrs, 'height'));
    const fill = readAttr(rectAttrs, 'fill');
    if (fill == null) return previewUrl;
    if ((x != null && x !== 0) || (y != null && y !== 0)) return previewUrl;
    if (w == null || h == null) return previewUrl;

    const matchesRoot =
      (svgWidth != null && svgHeight != null && nearlyEqual(w, svgWidth) && nearlyEqual(h, svgHeight)) ||
      (viewWidth != null && viewHeight != null && nearlyEqual(w, viewWidth) && nearlyEqual(h, viewHeight));
    if (!matchesRoot) return previewUrl;

    let rectEnd = cursor + rectOpen.length;
    if (!/\/>\s*$/.test(rectOpen)) {
      const closeMatch = /^\s*<\/rect\s*>/i.exec(svg.slice(rectEnd));
      if (closeMatch) rectEnd += closeMatch[0].length;
    }

    const stripped = svg.slice(0, cursor) + svg.slice(rectEnd);
    return SVG_BASE64_PREFIX + encodeBase64Utf8(stripped);
  } catch {
    return previewUrl;
  }
}
