import type { VisualOutline } from '@/lib/ai/outline';
import { paletteAt } from '@/lib/ai/visualPalette';
import { labelBlock, DETAIL_FONT, LABEL_FONT, type InfographicLayout } from './shared';

/**
 * PATCH-236 "stack": layered bands, the FIRST item on top, label inside its band
 * and detail to the right. Bands and the canvas grow to fit whole-word labels.
 */
export function layoutStack(outline: VisualOutline): InfographicLayout {
  const items = outline.items.slice(0, 8);
  const shapes: InfographicLayout['shapes'] = [];
  const texts: InfographicLayout['texts'] = [];

  const bandW = 360;
  const labelMax = bandW - 48;
  let y = 16;
  let maxRight = bandW + 32;

  items.forEach((item, index) => {
    const block = labelBlock(item.label, labelMax);
    const bandH = Math.max(40, block.height + 20);
    const color = paletteAt(index);
    shapes.push({
      id: `band${index}`,
      kind: 'rect',
      x: 16,
      y,
      width: bandW,
      height: bandH,
      rx: 10,
      fill: color.fill,
      stroke: color.stroke,
      strokeWidth: 1.5,
      colorIndex: index,
    });
    texts.push({
      id: `label${index}`,
      x: 16 + bandW / 2,
      y: y + bandH / 2,
      lines: block.labelLines,
      color: color.text,
      fontSize: LABEL_FONT,
      fontWeight: 600,
      anchor: 'middle',
      insideShapeId: `band${index}`,
    });

    if (item.detail) {
      const detailBlock = labelBlock(item.detail, 260);
      const dx = 16 + bandW + 24;
      const detailY = y + bandH / 2 + 8;
      texts.push({
        id: `detail${index}`,
        x: dx,
        y: detailY,
        lines: detailBlock.labelLines,
        color: '#374151',
        fontSize: DETAIL_FONT,
        fontWeight: 400,
        anchor: 'start',
      });
      maxRight = Math.max(maxRight, dx + detailBlock.width);
    }
    y += bandH + 6;
  });

  return {
    width: maxRight + 16,
    height: y + 8,
    shapes,
    texts,
  };
}
