import type { VisualOutline } from '@/lib/ai/outline';
import { paletteAt } from '@/lib/ai/visualPalette';
import { labelBlock, sizeText, LABEL_FONT, DETAIL_FONT, type InfographicLayout } from './shared';

/**
 * PATCH-236 "funnel": bands narrowing downward, the FIRST item widest. A label
 * that fits sits inside its band; one that does not is moved OUT as the bold
 * first line of its detail block (the band keeps a number). 3-6 items.
 */
export function layoutFunnel(outline: VisualOutline): InfographicLayout {
  const items = outline.items.slice(0, 6);
  const shapes: InfographicLayout['shapes'] = [];
  const texts: InfographicLayout['texts'] = [];
  const icons: InfographicLayout['icons'] = [];

  const maxW = 360;
  const minW = 140;
  const cx = maxW / 2 + 16;
  const bandH = 62;
  const detailX = cx + maxW / 2 + 24;
  let maxRight = cx + maxW / 2 + 16;

  items.forEach((item, index) => {
    const y0 = 16 + index * bandH;
    const y1 = y0 + bandH - 6;
    const topW = maxW - ((maxW - minW) * index) / Math.max(1, items.length - 1);
    const botW = maxW - ((maxW - minW) * (index + 1)) / Math.max(1, items.length - 1);
    const color = paletteAt(index);
    shapes.push({
      id: `band${index}`,
      kind: 'polygon',
      points: [
        `${cx - topW / 2},${y0}`,
        `${cx + topW / 2},${y0}`,
        `${cx + botW / 2},${y1}`,
        `${cx - botW / 2},${y1}`,
      ].join(' '),
      fill: color.fill,
      stroke: color.stroke,
      strokeWidth: 1.5,
      colorIndex: index,
    });

    const rowHalf = Math.min(topW, botW) / 2;
    const innerMax = Math.max(24, rowHalf * 1.8);
    const block = labelBlock(item.label, innerMax);
    const fitsInside = block.labelLines.length === 1 && block.width <= innerMax;

    if (fitsInside) {
      texts.push({
        id: `label${index}`,
        x: cx,
        y: (y0 + y1) / 2,
        lines: block.labelLines,
        color: color.text,
        fontSize: LABEL_FONT,
        fontWeight: 600,
        anchor: 'middle',
        insideShapeId: `band${index}`,
      });
    } else {
      shapes.push({
        id: `badge${index}`,
        kind: 'circle',
        cx,
        cy: (y0 + y1) / 2,
        r: 13,
        fill: color.stroke,
        stroke: color.stroke,
        colorIndex: index,
      });
      texts.push({
        id: `badgeText${index}`,
        x: cx,
        y: (y0 + y1) / 2 + 4,
        lines: [String(index + 1)],
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 700,
        anchor: 'middle'
      });
    }

    if (item.detail || !fitsInside) {
      const lines = fitsInside ? [] : block.labelLines;
      const detailBlock = item.detail ? labelBlock(item.detail, 240) : { labelLines: [], width: 0, height: 0 };
      const allLines = [...lines, ...detailBlock.labelLines];
      const detailTextX = item.icon ? detailX + 24 : detailX;
      texts.push({
        id: `detail${index}`,
        x: detailTextX,
        y: (y0 + y1) / 2,
        lines: allLines,
        color: '#374151',
        fontSize: DETAIL_FONT,
        fontWeight: fitsInside ? 400 : 600,
        anchor: 'start',
      });
      if (item.icon) {
        icons!.push({
          name: item.icon,
          x: detailX,
          y: (y0 + y1) / 2 - 9,
          size: 18,
          color: color.stroke,
        });
      }
      const widest = Math.max(lines.length ? sizeText(lines, LABEL_FONT, 600).width : 0, detailBlock.width);
      maxRight = Math.max(maxRight, detailTextX + widest);
    }
  });

  return {
    width: maxRight + 16,
    height: 16 + items.length * bandH + 16,
    shapes,
    texts,
    icons: icons!.length ? icons : undefined,
  };
}
