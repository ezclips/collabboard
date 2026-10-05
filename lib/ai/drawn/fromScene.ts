/**
 * PATCH-283 G. PictureScene v1 -> DrawnPicture v1, used ONLY to turn AntV
 * template renders into prompt examples (the owner's "convert the AntV into
 * prompt examples"). Pure: rect/ellipse as is, a closed filled polyline becomes
 * a simplified polygon, an open one a line, an icon image an icon, text as text.
 */

import { isVisualIconName } from '@/lib/ai/visualIcons';
import type { PictureScene, SceneElement, ScenePoint } from '@/lib/ai/antv/toExcalidraw/scene';
import { rdp } from '@/lib/ai/antv/toExcalidraw/simplify';

import type { DrawnElement, DrawnLineElement, DrawnPicture } from './format';

export const FROM_SCENE_RDP_TOLERANCE = 2;
export const FROM_SCENE_MAX_POLYGON_POINTS = 24;
export const FROM_SCENE_MIN_SIZE = 2;

const round = (value: number): number => Math.round(value);

function itemFromGroups(groupIds: string[]): number | undefined {
  for (const group of groupIds) {
    const match = /^item:(\d+)$/.exec(group);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function polygonBox(points: ScenePoint[]): { w: number; h: number } {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function simplifyClosed(points: ScenePoint[]): ScenePoint[] {
  const cleaned = [...points];
  if (cleaned.length > 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) <= 0.25) cleaned.pop();
  }
  return rdp(cleaned, FROM_SCENE_RDP_TOLERANCE);
}

function iconColor(dataURL: string): string {
  try {
    if (dataURL.startsWith('data:image/svg+xml;base64,')) {
      const svg = atob(dataURL.split(',')[1]);
      const match = /stroke="(#[0-9a-fA-F]{6})"/.exec(svg);
      if (match) return match[1].toLowerCase();
    }
  } catch {
    // A malformed data URL just falls back to the neutral text colour.
  }
  return '#374151';
}

function fromElement(element: SceneElement): DrawnElement | null {
  const item = itemFromGroups(element.groupIds);

  if (element.kind === 'rect' || element.kind === 'ellipse') {
    if (element.box.width < FROM_SCENE_MIN_SIZE || element.box.height < FROM_SCENE_MIN_SIZE) return null;
    if (element.kind === 'rect') {
      return {
        id: element.id,
        type: 'rect',
        x: round(element.box.x),
        y: round(element.box.y),
        w: round(element.box.width),
        h: round(element.box.height),
        fill: element.paint.fill,
        stroke: element.paint.stroke,
        ...(element.radius > 0 ? { radius: round(element.radius) } : {}),
        ...(element.paint.strokeStyle !== 'solid' ? { dash: true } : {}),
        ...(item !== undefined ? { item } : {}),
      };
    }
    return {
      id: element.id,
      type: 'ellipse',
      x: round(element.box.x),
      y: round(element.box.y),
      w: round(element.box.width),
      h: round(element.box.height),
      fill: element.paint.fill,
      stroke: element.paint.stroke,
      ...(item !== undefined ? { item } : {}),
    };
  }

  if (element.kind === 'polyline') {
    if (element.closed && element.filled) {
      const reduced = simplifyClosed(element.points);
      const box = polygonBox(reduced);
      if (box.w < FROM_SCENE_MIN_SIZE && box.h < FROM_SCENE_MIN_SIZE) return null;
      if (reduced.length > FROM_SCENE_MAX_POLYGON_POINTS) return null;
      return {
        id: element.id,
        type: 'polygon',
        points: reduced.map(([x, y]) => [round(x), round(y)]),
        fill: element.paint.fill,
        stroke: element.paint.stroke,
        ...(item !== undefined ? { item } : {}),
      };
    }
    const box = polygonBox(element.points);
    if (box.w < FROM_SCENE_MIN_SIZE && box.h < FROM_SCENE_MIN_SIZE) return null;
    const arrow: DrawnLineElement['arrow'] =
      element.arrowStart && element.arrowEnd ? 'both' : element.arrowStart ? 'start' : element.arrowEnd ? 'end' : undefined;
    return {
      id: element.id,
      type: 'line',
      points: element.points.map(([x, y]) => [round(x), round(y)]),
      stroke: element.paint.stroke,
      ...(element.paint.strokeWidth > 0 ? { strokeWidth: element.paint.strokeWidth } : {}),
      ...(element.paint.strokeStyle !== 'solid' ? { dash: true } : {}),
      ...(arrow ? { arrow } : {}),
    };
  }

  if (element.kind === 'image') {
    if (!element.fromIcon || !isVisualIconName(element.iconName)) return null;
    if (element.box.width < FROM_SCENE_MIN_SIZE || element.box.height < FROM_SCENE_MIN_SIZE) return null;
    return {
      id: element.id,
      type: 'icon',
      name: element.iconName,
      x: round(element.box.x),
      y: round(element.box.y),
      size: round(element.box.width),
      color: iconColor(element.dataURL),
      ...(item !== undefined ? { item } : {}),
    };
  }

  if (element.box.width < FROM_SCENE_MIN_SIZE || element.box.height < FROM_SCENE_MIN_SIZE) return null;
  return {
    id: element.id,
    type: 'text',
    text: element.text,
    x: round(element.box.x),
    y: round(element.box.y),
    w: round(element.box.width),
    size: round(element.fontSize),
    color: element.color,
    ...(element.align !== 'left' ? { align: element.align } : {}),
    ...(item !== undefined ? { item } : {}),
  };
}

/** Converts a PictureScene into a DrawnPicture, dropping what it cannot express. */
export function sceneToDrawn(scene: PictureScene): DrawnPicture {
  const elements: DrawnElement[] = [];
  for (const element of scene.elements) {
    const drawn = fromElement(element);
    if (drawn) elements.push(drawn);
  }
  return {
    version: 1,
    width: round(scene.width),
    height: round(scene.height),
    background: scene.background,
    elements,
  };
}
