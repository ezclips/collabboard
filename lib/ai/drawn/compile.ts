/**
 * PATCH-283 D. DrawnPicture v1 -> PictureScene v1. This is the bridge that lets
 * one AI picture render as SVG in the AI post and convert to Excalidraw (via the
 * existing `toSkeleton`) for "Edit as drawing". Pure: no DOM, no Excalidraw.
 */

import { iconSymbolSvg } from '@/lib/ai/antv/icons';
import {
  PICTURE_GROUP_ID,
  PICTURE_SCENE_VERSION,
  type PictureScene,
  type SceneElement,
  type ScenePaint,
  type ScenePoint,
  type SceneRect,
  type SceneTextAlign,
} from '@/lib/ai/antv/toExcalidraw/scene';

import type { DrawnBarElement, DrawnElement, DrawnPicture, DrawnTextElement } from './format';
import { lineHeight, wrapText } from './textMetrics';

const WEDGE_STEP = Math.PI / 60;
const ICON_VIEW_BOX = '0 0 24 24';

function groupsFor(element: { id: string; item?: number }): string[] {
  return element.item !== undefined ? [`item:${element.item}`, PICTURE_GROUP_ID] : [PICTURE_GROUP_ID];
}

function paint(fill: string, stroke: string, strokeWidth: number | undefined, dash: boolean): ScenePaint {
  const resolvedWidth = strokeWidth ?? (stroke === 'none' ? 0 : 1);
  return {
    fill,
    stroke,
    strokeWidth: resolvedWidth,
    strokeStyle: dash ? 'dashed' : 'solid',
    opacity: 100,
    blended: false,
  };
}

function rectElement(element: DrawnBarElement | Extract<DrawnElement, { type: 'rect' }>): SceneElement {
  const radius = element.type === 'rect' ? element.radius ?? 0 : 0;
  const box: SceneRect = { x: element.x, y: element.y, width: element.w, height: element.h };
  const strokeWidth = element.type === 'rect' ? element.strokeWidth : undefined;
  const stroke = element.type === 'rect' ? element.stroke : 'none';
  return {
    id: element.id,
    kind: 'rect',
    box,
    radius,
    pill: radius > 0 && radius >= Math.min(box.width, box.height) / 2 - 0.5,
    paint: paint(element.fill, stroke, strokeWidth, element.type === 'rect' ? !!element.dash : false),
    clipIgnored: false,
    groupIds: groupsFor(element),
    source: { tag: 'rect' },
  };
}

function wedgePoints(element: Extract<DrawnElement, { type: 'wedge' }>): ScenePoint[] {
  const start = element.startAngle ?? 0;
  const end = element.endAngle ?? 0;
  const span = end - start;
  const count = Math.max(1, Math.ceil(Math.abs(span) / WEDGE_STEP));
  const point = (angle: number, radius: number): ScenePoint => [
    element.cx + radius * Math.cos(angle - Math.PI / 2),
    element.cy + radius * Math.sin(angle - Math.PI / 2),
  ];
  const points: ScenePoint[] = [];
  for (let i = 0; i <= count; i += 1) points.push(point(start + (span * i) / count, element.r));
  if (element.inner !== undefined) {
    for (let i = count; i >= 0; i -= 1) points.push(point(start + (span * i) / count, element.inner));
  } else {
    points.push([element.cx, element.cy]);
  }
  return points;
}

function iconDataUrl(name: string, color: string): string {
  const body = iconSymbolSvg(name).replace(/^<symbol[^>]*>/, '').replace(/<\/symbol>$/, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEW_BOX}" fill="none" ` +
    `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function textLines(element: DrawnTextElement): string[] {
  if (element.lines && element.lines.length > 0) return element.lines;
  return wrapText(element.text, element.size, element.w, !!element.bold);
}

function compileElement(element: DrawnElement): SceneElement {
  if (element.type === 'rect' || element.type === 'bar') return rectElement(element);

  if (element.type === 'ellipse') {
    return {
      id: element.id,
      kind: 'ellipse',
      box: { x: element.x, y: element.y, width: element.w, height: element.h },
      paint: paint(element.fill, element.stroke, element.strokeWidth, false),
      clipIgnored: false,
      groupIds: groupsFor(element),
      source: { tag: 'ellipse' },
    };
  }

  if (element.type === 'polygon' || element.type === 'line') {
    const closed = element.type === 'polygon';
    const filled = element.type === 'polygon' ? element.fill !== 'none' : false;
    return {
      id: element.id,
      kind: 'polyline',
      points: element.points.map(([x, y]) => [x, y] as ScenePoint),
      closed,
      filled,
      arrowStart: element.type === 'line' && (element.arrow === 'start' || element.arrow === 'both'),
      arrowEnd: element.type === 'line' && (element.arrow === 'end' || element.arrow === 'both'),
      paint:
        element.type === 'polygon'
          ? paint(element.fill, element.stroke, undefined, false)
          : paint('none', element.stroke, element.strokeWidth, !!element.dash),
      clipIgnored: false,
      groupIds: groupsFor(element),
      source: { tag: closed ? 'polygon' : 'line' },
    };
  }

  if (element.type === 'wedge') {
    return {
      id: element.id,
      kind: 'polyline',
      points: wedgePoints(element),
      closed: true,
      filled: true,
      arrowStart: false,
      arrowEnd: false,
      paint: paint(element.fill, element.stroke ?? 'none', undefined, false),
      clipIgnored: false,
      groupIds: groupsFor(element),
      source: { tag: 'polygon' },
    };
  }

  if (element.type === 'icon') {
    return {
      id: element.id,
      kind: 'image',
      box: { x: element.x, y: element.y, width: element.size, height: element.size },
      dataURL: iconDataUrl(element.name, element.color),
      mimeType: 'image/svg+xml',
      fromIcon: true,
      groupIds: groupsFor(element),
      source: { tag: 'image' },
    };
  }

  const lines = textLines(element);
  const height = element.boxHeight ?? lines.length * lineHeight(element.size);
  const align: SceneTextAlign = element.align ?? 'left';
  return {
    id: element.id,
    kind: 'text',
    text: element.text,
    box: { x: element.x, y: element.y, width: element.w, height },
    fontSize: element.size,
    color: element.color,
    align,
    monospace: false,
    mayDownload: false,
    lost: { fontWeight: false, fontStyle: false },
    svgText: true,
    mixedTextStyle: false,
    lineCount: lines.length,
    groupIds: groupsFor(element),
    source: { tag: 'text' },
  };
}

/** Compiles a repaired DrawnPicture into the shared PictureScene v1. */
export function drawnToScene(picture: DrawnPicture): PictureScene {
  const elements = picture.elements.map(compileElement);
  const shapes = elements.filter(
    (element) => element.kind === 'rect' || element.kind === 'ellipse' || element.kind === 'polyline',
  );
  const icons = elements.filter((element) => element.kind === 'image' && element.fromIcon);
  return {
    version: PICTURE_SCENE_VERSION,
    width: picture.width,
    height: picture.height,
    background: picture.background,
    elements,
    skips: [],
    visibleShapes: shapes.length,
    resolvableIcons: icons.length,
    losses: {
      blended: 0,
      gradientFlattened: 0,
      clipIgnored: 0,
      lostFontWeight: 0,
      lostFontStyle: 0,
      iconsAsImage: icons.length,
      iconsAsStrokes: 0,
      mixedTextStyle: 0,
      shadowIgnored: 0,
      pathFallback: 0,
      patternIgnored: 0,
    },
  };
}
