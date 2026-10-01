import type { VisualOutline } from '@/lib/ai/outline';
import { paletteAt } from '@/lib/ai/visualPalette';
import { labelBlock, LABEL_FONT, DETAIL_FONT, type InfographicLayout } from './shared';

/**
 * PATCH-236 "hub": the title in a centre circle, items around it on spokes,
 * alternating left/right. Each item is a card (label + detail) sized to whole
 * words; the label sits inside its card. 3-8 items.
 */
export function layoutHub(outline: VisualOutline): InfographicLayout {
  const items = outline.items.slice(0, 8);
  const shapes: InfographicLayout['shapes'] = [];
  const texts: InfographicLayout['texts'] = [];

  const cardW = 190;
  const gapX = 70;
  const centreR = 64;
  const columnX = centreR + gapX + cardW;
  const cx = columnX + 16;

  const rightItems = items.map((item, i) => ({ item, i })).filter(({ i }) => i % 2 === 0);
  const leftItems = items.map((item, i) => ({ item, i })).filter(({ i }) => i % 2 === 1);
  const rows = Math.max(rightItems.length, leftItems.length, 1);
  const maxCardH = Math.max(
    64,
    ...items.map((item) => labelBlock(item.label, cardW - 24).height + (item.detail ? labelBlock(item.detail, cardW - 24).height : 0) + 28),
  );
  const rowGap = maxCardH + 24;
  const cy = 16 + ((rows - 1) * rowGap) / 2 + maxCardH / 2;

  shapes.push({ id: 'hub', kind: 'circle', cx, cy, r: centreR, fill: '#1F2937', stroke: '#1F2937', colorIndex: -1 });
  texts.push({
    id: 'title',
    x: cx,
    y: cy,
    lines: labelBlock(outline.title, centreR * 1.4).labelLines,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 700,
    anchor: 'middle',
    insideShapeId: 'hub',
  });

  const place = (item: VisualOutline['items'][number], originalIndex: number, side: 'left' | 'right', row: number) => {
    const color = paletteAt(originalIndex);
    const cardX = side === 'right' ? cx + centreR + gapX : cx - centreR - gapX - cardW;
    const y = 16 + row * rowGap;
    const label = labelBlock(item.label, cardW - 24);
    const detail = item.detail ? labelBlock(item.detail, cardW - 24) : { labelLines: [], width: 0, height: 0 };
    const cardH = label.height + detail.height + 28;
    shapes.push({
      id: `card${originalIndex}`,
      kind: 'rect',
      x: cardX,
      y,
      width: cardW,
      height: cardH,
      rx: 10,
      fill: color.fill,
      stroke: color.stroke,
      strokeWidth: 1.5,
      colorIndex: originalIndex,
    });
    const spokeX = side === 'right' ? cardX : cardX + cardW;
    const edgeX = side === 'right' ? cx + centreR : cx - centreR;
    shapes.push({
      id: `spoke${originalIndex}`,
      kind: 'path',
      d: `M ${edgeX},${cy} L ${spokeX},${y + cardH / 2}`,
      fill: 'none',
      stroke: color.stroke,
      strokeWidth: 3,
      colorIndex: originalIndex,
    });
    const textX = side === 'right' ? cardX + 12 : cardX + cardW - 12;
    const anchor = side === 'right' ? 'start' : 'end';
    const labelY = y + 14 + label.height / 2;
    texts.push({
      id: `label${originalIndex}`,
      x: textX,
      y: labelY,
      lines: label.labelLines,
      color: color.text,
      fontSize: LABEL_FONT,
      fontWeight: 600,
      anchor,
      insideShapeId: `card${originalIndex}`,
    });
    if (detail.labelLines.length) {
      texts.push({
        id: `detail${originalIndex}`,
        x: textX,
        y: labelY + label.height / 2 + 10 + detail.height / 2,
        lines: detail.labelLines,
        color: '#374151',
        fontSize: DETAIL_FONT,
        fontWeight: 400,
        anchor,
        insideShapeId: `card${originalIndex}`,
      });
    }
  };

  let r = 0;
  let l = 0;
  items.forEach((item, index) => {
    if (index % 2 === 0) {
      place(item, index, 'right', r);
      r += 1;
    } else {
      place(item, index, 'left', l);
      l += 1;
    }
  });

  return {
    width: cx + centreR + gapX + cardW + 16,
    height: 16 + rows * rowGap,
    shapes,
    texts,
  };
}
