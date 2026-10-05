/**
 * PATCH-283 E. PictureScene v1 -> a self-contained SVG string. Safe by
 * construction: no `foreignObject`, no scripts, no external URLs, and image
 * hrefs only for inline `data:image/svg+xml` payloads. Every text run is
 * XML-escaped.
 */

import type { PictureScene, SceneElement, ScenePaint } from '@/lib/ai/antv/toExcalidraw/scene';

import { lineHeight, wrapText } from './textMetrics';

const FONT_FAMILY = 'Helvetica, Arial, sans-serif';

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * PATCH-285. Only id characters that survive an HTML attribute are emitted, so
 * a hostile stored id can never smuggle markup into the injected SVG. Normal
 * parser ids (`e3`, `item-2`) pass through unchanged.
 */
function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_.:-]/g, '_');
}

function paintAttrs(element: { paint: ScenePaint }): string {
  const dash = element.paint.strokeStyle !== 'solid' ? ` stroke-dasharray="${element.paint.strokeStyle === 'dotted' ? '2 3' : '6 4'}"` : '';
  return `fill="${element.paint.fill}" stroke="${element.paint.stroke}" stroke-width="${fmt(element.paint.strokeWidth)}"${dash}`;
}

function renderElement(element: SceneElement): string {
  // PATCH-285. The element's own id travels into the DOM so a click can name the
  // object it hit. The id is escaped like any other attribute: a hostile stored
  // id must stay inert.
  const drawnId = ` data-drawn-id="${escapeXml(safeId(element.id))}"`;
  if (element.kind === 'rect') {
    const radius = element.radius > 0 ? ` rx="${fmt(Math.min(element.radius, Math.min(element.box.width, element.box.height) / 2))}"` : '';
    return `<rect${drawnId} x="${fmt(element.box.x)}" y="${fmt(element.box.y)}" width="${fmt(element.box.width)}" height="${fmt(element.box.height)}"${radius} ${paintAttrs(element)} />`;
  }
  if (element.kind === 'ellipse') {
    const rx = element.box.width / 2;
    const ry = element.box.height / 2;
    return `<ellipse${drawnId} cx="${fmt(element.box.x + rx)}" cy="${fmt(element.box.y + ry)}" rx="${fmt(rx)}" ry="${fmt(ry)}" ${paintAttrs(element)} />`;
  }
  if (element.kind === 'polyline') {
    const tag = element.closed && element.filled ? 'polygon' : 'polyline';
    const points = element.points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');
    return `<${tag}${drawnId} points="${points}" ${paintAttrs(element)} />`;
  }
  if (element.kind === 'image') {
    if (!element.dataURL.startsWith('data:image/svg+xml')) return '';
    return `<image${drawnId} x="${fmt(element.box.x)}" y="${fmt(element.box.y)}" width="${fmt(element.box.width)}" height="${fmt(element.box.height)}" href="${element.dataURL}" />`;
  }
  const lines = wrapText(element.text, element.fontSize, element.box.width, false);
  const anchor = element.align === 'center' ? 'middle' : element.align === 'right' ? 'end' : 'start';
  const x =
    element.align === 'center'
      ? element.box.x + element.box.width / 2
      : element.align === 'right'
        ? element.box.x + element.box.width
        : element.box.x;
  const tspans = lines
    .map((line, index) => `<tspan x="${fmt(x)}" dy="${index === 0 ? 0 : fmt(lineHeight(element.fontSize))}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<text${drawnId} x="${fmt(x)}" y="${fmt(element.box.y + element.fontSize)}" font-family="${FONT_FAMILY}" font-size="${fmt(element.fontSize)}" fill="${element.color}" text-anchor="${anchor}">${tspans}</text>`;
}

/** Renders a PictureScene to a pure SVG string. */
export function sceneToSvg(scene: PictureScene): string {
  const background = `<rect x="0" y="0" width="${fmt(scene.width)}" height="${fmt(scene.height)}" fill="${scene.background}" />`;
  const body = scene.elements.map(renderElement).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(scene.width)} ${fmt(scene.height)}" width="${fmt(scene.width)}" height="${fmt(scene.height)}" role="img">${background}${body}</svg>`;
}
