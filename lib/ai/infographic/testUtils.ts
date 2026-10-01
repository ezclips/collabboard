import type { VisualOutline } from '@/lib/ai/outline';
import { layoutInfographic } from './index';
import type { InfographicShape } from './shared';
import { charWidthFor } from './text';

export function outline(items: Array<{ label: string; detail?: string }>, title = 'Title'): VisualOutline {
  return { title, ordered: false, kind: 'list', items };
}

export function layoutOf(template: Parameters<typeof layoutInfographic>[0], o: VisualOutline) {
  return layoutInfographic(template, o);
}

export function shapeBox(shape: InfographicShape) {
  if (shape.kind === 'circle') {
    return {
      left: (shape.cx ?? 0) - (shape.r ?? 0),
      right: (shape.cx ?? 0) + (shape.r ?? 0),
      top: (shape.cy ?? 0) - (shape.r ?? 0),
      bottom: (shape.cy ?? 0) + (shape.r ?? 0),
      width: (shape.r ?? 0) * 2,
      height: (shape.r ?? 0) * 2,
    };
  }
  return {
    left: shape.x ?? 0,
    right: (shape.x ?? 0) + (shape.width ?? 0),
    top: shape.y ?? 0,
    bottom: (shape.y ?? 0) + (shape.height ?? 0),
    width: shape.width ?? 0,
    height: shape.height ?? 0,
  };
}

export function overlaps(a: { left: number; right: number; top: number; bottom: number }, b: typeof a) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export { charWidthFor };
