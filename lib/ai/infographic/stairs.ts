import type { VisualOutline } from '@/lib/ai/outline';
import { paletteAt } from '@/lib/ai/visualPalette';
import { labelBlock, DETAIL_FONT, LABEL_FONT, type InfographicLayout } from './shared';

/**
 * PATCH-236 "stairs": rising steps left to right, one item per step (number
 * badge, label on the step, detail UNDER its own box). Each step's box is sized
 * to its wrapped label; steps rise by a fixed amount; the canvas height includes
 * the tallest label+detail column. 3-7 items.
 */
export function layoutStairs(outline: VisualOutline): InfographicLayout {
  const items = outline.items.slice(0, 7);
  const shapes: InfographicLayout['shapes'] = [];
  const texts: InfographicLayout['texts'] = [];

  const stepW = 170;
  const rise = 34;
  const labelMax = stepW - 48;
  const detailMax = stepW - 16;

  // Per-step label box height, and the tallest detail column overall.
  const boxes = items.map((item) => {
    const block = labelBlock(item.label, labelMax);
    const detail = item.detail ? labelBlock(item.detail, detailMax) : { labelLines: [], width: 0, height: 0 };
    return { block, detail };
  });
  const maxLabelH = Math.max(24, ...boxes.map((b) => b.block.height + 16));
  const baseY = 16 + items.length * rise + maxLabelH;
  let maxBottom = baseY;

  items.forEach((item, index) => {
    const { block, detail } = boxes[index];
    const color = paletteAt(index);
    const x = 16 + index * stepW;
    const boxH = block.height + 16;
    const y = baseY - (index + 1) * rise - (maxLabelH - boxH);
    shapes.push({
      id: `step${index}`,
      kind: 'rect',
      x,
      y,
      width: stepW,
      height: boxH,
      rx: 8,
      fill: color.fill,
      stroke: color.stroke,
      strokeWidth: 1.5,
      colorIndex: index,
    });
    shapes.push({
      id: `badge${index}`,
      kind: 'circle',
      cx: x + 16,
      cy: y + boxH / 2,
      r: 11,
      fill: color.stroke,
      stroke: color.stroke,
      colorIndex: index,
    });
    texts.push({
      id: `badgeText${index}`,
      x: x + 16,
      y: y + boxH / 2 + 4,
      lines: [String(index + 1)],
      color: '#ffffff',
      fontSize: 12,
      fontWeight: 700,
      anchor: 'middle'
    });
    texts.push({
      id: `label${index}`,
      x: x + 34,
      y: y + boxH / 2,
      lines: block.labelLines,
      color: color.text,
      fontSize: LABEL_FONT,
      fontWeight: 600,
      anchor: 'start',
      insideShapeId: `step${index}`,
    });

    if (detail.labelLines.length) {
      // PATCH-236 Addendum 4: the detail starts at THIS box's bottom + 8, not a
      // shared row, so it never overlaps the first step's own box.
      const detailTop = y + boxH + 8;
      texts.push({
        id: `detail${index}`,
        x,
        y: detailTop + detail.height / 2,
        lines: detail.labelLines,
        color: '#374151',
        fontSize: DETAIL_FONT,
        fontWeight: 400,
        anchor: 'start',
      });
      maxBottom = Math.max(maxBottom, detailTop + detail.height);
    }
  });

  return {
    width: 16 + items.length * stepW + 16,
    height: maxBottom + 16,
    shapes,
    texts,
  };
}
