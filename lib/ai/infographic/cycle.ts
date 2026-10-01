import type { VisualOutline } from '@/lib/ai/outline';
import { paletteAt } from '@/lib/ai/visualPalette';
import { labelBlock, sizeText, LABEL_FONT, DETAIL_FONT, type InfographicLayout } from './shared';

/**
 * PATCH-236 "cycle": items on a circle, the first at 12 o'clock, curved arrows
 * along the ring (never through the centre); title in the middle. Each node's
 * radius fits its widest whole-word label (min 34); the ring grows so nodes and
 * their outward detail blocks do not overlap. 3-8 items.
 */
export function layoutCycle(outline: VisualOutline): InfographicLayout {
  const items = outline.items.slice(0, 8);
  const shapes: InfographicLayout['shapes'] = [];
  const texts: InfographicLayout['texts'] = [];
  const icons: InfographicLayout['icons'] = [];
  const n = items.length;

  const blocks = items.map((item) => labelBlock(item.label, 96));
  const hasIcons = items.some((item) => item.icon);
  const nodeR = Math.max(
    34,
    ...blocks.map((b) => Math.max(sizeText(b.labelLines, LABEL_FONT, 600).width / 2, b.height / 2) + 12 + (hasIcons ? 12 : 0)),
  );

  // Ring radius: enough for node arcs plus a wide enough gap for neighbours.
  const arcNeed = n * (nodeR + 6);
  const radius = Math.max(150, Math.ceil(arcNeed / (2 * Math.PI)) + nodeR + 24);
  const pad = radius + 120;
  const cx = pad;
  const cy = radius + 80;

  items.forEach((item, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n;
    const nx = cx + radius * Math.cos(angle);
    const ny = cy + radius * Math.sin(angle);
    const color = paletteAt(index);
    shapes.push({
      id: `node${index}`,
      kind: 'circle',
      cx: nx,
      cy: ny,
      r: nodeR,
      fill: color.fill,
      stroke: color.stroke,
      strokeWidth: 1.5,
      colorIndex: index,
    });
    texts.push({
      id: `label${index}`,
      x: nx,
      y: hasIcons && item.icon ? ny + 8 : ny,
      lines: blocks[index].labelLines,
      color: color.text,
      fontSize: LABEL_FONT,
      fontWeight: 600,
      anchor: 'middle',
      insideShapeId: `node${index}`,
    });
    if (item.icon) {
      icons!.push({
        name: item.icon,
        x: nx - 9,
        y: ny - nodeR / 2 - 4,
        size: 18,
        color: color.text,
        insideShapeId: `node${index}`,
      });
    }

    if (item.detail) {
      const detail = labelBlock(item.detail, 110);
      const outward = { x: Math.cos(angle), y: Math.sin(angle) };
      const dx = nx + outward.x * (nodeR + 18);
      const dy = ny + outward.y * (nodeR + 18);
      // Right-half nodes are left-aligned to their right; left-half right-aligned.
      const anchor = outward.x > 0.2 ? 'start' : outward.x < -0.2 ? 'end' : 'middle';
      texts.push({
        id: `detail${index}`,
        x: dx,
        y: dy,
        lines: detail.labelLines,
        color: '#374151',
        fontSize: DETAIL_FONT,
        fontWeight: 400,
        anchor,
      });
    }
  });

  // Arrows along the ring, clockwise, between neighbours.
  for (let index = 0; index < n; index += 1) {
    const a0 = -Math.PI / 2 + (index * 2 * Math.PI) / n;
    const a1 = -Math.PI / 2 + (((index + 1) % n) * 2 * Math.PI) / n;
    const gapAngle = (nodeR + 6) / radius;
    const start = a0 + gapAngle;
    const end = a1 - gapAngle;
    const sx = cx + radius * Math.cos(start);
    const sy = cy + radius * Math.sin(start);
    const ex = cx + radius * Math.cos(end);
    const ey = cy + radius * Math.sin(end);
    // Sweep clockwise; the large-arc flag is 0 for a short ring hop.
    shapes.push({
      id: `arrow${index}`,
      kind: 'path',
      d: `M ${sx},${sy} A ${radius},${radius} 0 0 1 ${ex},${ey}`,
      fill: 'none',
      stroke: '#9CA3AF',
      strokeWidth: 2,
      colorIndex: index,
    });
    // Arrowhead at the end, tangent to the ring.
    const tangent = end + Math.PI / 2;
    const h = 7;
    const hx1 = ex - h * Math.cos(tangent - 0.4);
    const hy1 = ey - h * Math.sin(tangent - 0.4);
    const hx2 = ex - h * Math.cos(tangent + 0.4);
    const hy2 = ey - h * Math.sin(tangent + 0.4);
    shapes.push({
      id: `arrowHead${index}`,
      kind: 'polygon',
      points: `${ex},${ey} ${hx1},${hy1} ${hx2},${hy2}`,
      fill: '#9CA3AF',
      stroke: '#9CA3AF',
      colorIndex: index,
    });
  }

  texts.push({
    id: 'title',
    x: cx,
    y: cy,
    lines: labelBlock(outline.title, radius * 1.4).labelLines,
    color: '#1F2937',
    fontSize: 14,
    fontWeight: 700,
    anchor: 'middle',
  });

  return {
    width: cx * 2,
    height: cy + radius + 120,
    shapes,
    texts,
    icons: icons!.length ? icons : undefined,
  };
}
