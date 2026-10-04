/**
 * PATCH-278 A.2. The `<use>`/`<symbol>` icon reading, split out of
 * `readSvgScene.ts` to keep each file under the ceiling. An icon becomes a
 * data-URL image (its strokes are not editable), which the report counts.
 */

import { attr, symbolColor } from './readPaint';
import { groupIdsFor, nextId, recordSkip, sourceOf, type ReaderState } from './readText';

function encodeSvgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

const SYMBOL_PRESENTATION = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
];

function iconDataUrl(state: ReaderState, use: Element, style: CSSStyleDeclaration, alpha: number): string {
  const href = attr(use, 'href');
  const symbol = href ? state.geometry.symbol(href, state.root) : null;
  if (!symbol) return '';
  const color = symbolColor(state, use, style, alpha);
  const viewBox = symbol.getAttribute('viewBox') ?? '0 0 24 24';
  const width = attr(use, 'width') ?? viewBox.split(/\s+/)[2] ?? '24';
  const height = attr(use, 'height') ?? viewBox.split(/\s+/)[3] ?? '24';
  const attrs = SYMBOL_PRESENTATION.map((name) => {
    const value = symbol.getAttribute(name);
    return value ? ` ${name}="${value.replace(/"/g, '&quot;')}"` : '';
  }).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}"` +
    `${attrs}>${symbol.innerHTML}</svg>`;
  return encodeSvgDataUrl(svg.replace(/currentColor/gi, color));
}

export function emitIcon(state: ReaderState, el: Element, style: CSSStyleDeclaration, alphaBase: number): void {
  const href = attr(el, 'href');
  const symbol = href ? state.geometry.symbol(href, state.root) : null;
  if (!symbol) {
    recordSkip(state, el, 'icon-unresolved');
    return;
  }
  const box = state.geometry.box(el, state.root);
  if (!box || box.width <= 0 || box.height <= 0) {
    recordSkip(state, el, 'hidden');
    return;
  }
  const dataURL = iconDataUrl(state, el, style, alphaBase);
  if (!dataURL) {
    recordSkip(state, el, 'icon-unresolved');
    return;
  }
  state.elements.push({
    id: nextId(state),
    kind: 'image',
    box,
    dataURL,
    mimeType: 'image/svg+xml',
    fromIcon: true,
    groupIds: groupIdsFor(state, el),
    source: sourceOf(state, el),
  });
  state.resolvableIcons += 1;
  state.losses.iconsAsImage += 1;
}
