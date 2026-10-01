import type { VisualOutline } from '@/lib/ai/outline';
import { themeById, themeColor, type VisualTheme } from '@/lib/ai/visualThemes';
import { labelBlock, sizeText, LABEL_FONT, DETAIL_FONT, type InfographicLayout } from './shared';

/**
 * PATCH-236 "pyramid": a triangle cut into horizontal bands, the FIRST item at
 * the narrow top. A label that fits sits inside its band; one that does not is
 * moved OUT as the bold first line of its detail block (the band keeps a number).
 * 3-7 items.
 */
export function layoutPyramid(outline: VisualOutline, theme: VisualTheme = themeById()): InfographicLayout {
  const items = outline.items.slice(0, 7);
  const shapes: InfographicLayout['shapes'] = [];
  const texts: InfographicLayout['texts'] = [];
  const icons: InfographicLayout['icons'] = [];

  const height = items.length * 60;
  const halfWidth = 220;
  const cx = halfWidth + 16;
  const top = 16;
  const detailX = cx + halfWidth + 40;
  let maxRight = cx + halfWidth + 16;

  items.forEach((item, index) => {
    const y0 = top + (index * height) / items.length;
    const y1 = top + ((index + 1) * height) / items.length;
    const halfTop = (halfWidth * (index + 0.15)) / items.length;
    const halfBottom = (halfWidth * (index + 1.15)) / items.length;
    const color = themeColor(theme, index);
    shapes.push({
      id: `band${index}`,
      kind: 'polygon',
      points: [
        `${cx - halfTop},${y0}`,
        `${cx + halfTop},${y0}`,
        `${cx + halfBottom},${y1}`,
        `${cx - halfBottom},${y1}`,
      ].join(' '),
      fill: color.fill,
      stroke: color.stroke,
      strokeWidth: 1.5,
      colorIndex: index,
    });

    // The band's usable width at its centre row (~ the mean of top/bottom).
    const rowHalf = Math.min(halfTop, halfBottom);
    const innerMax = Math.max(24, rowHalf * 1.7); // a usable slab inside the trapezoid
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
      // A number in the band, and the label moved OUT as the detail's first line.
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
        color: color.text,
        fontSize: 12,
        fontWeight: 700,
        anchor: 'middle',
        insideShapeId: `band${index}`,
      });
    }

    if (item.detail || !fitsInside) {
      // PATCH-236 Addendum 4: a label moved OUT is wrapped at the detail
      // column's width (the same width as its detail), so "Heading 1" stays on
      // one line instead of splitting.
      const outLines = fitsInside ? [] : labelBlock(item.label, 240).labelLines;
      const detailBlock = item.detail ? labelBlock(item.detail, 240) : { labelLines: [], width: 0, height: 0 };
      const allLines = [...outLines, ...detailBlock.labelLines];
      const detailTextX = item.icon ? detailX + 24 : detailX;
      texts.push({
        id: `detail${index}`,
        x: detailTextX,
        y: (y0 + y1) / 2,
        lines: allLines,
        color: theme.text,
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
      const widest = Math.max(
        outLines.length ? sizeText(outLines, LABEL_FONT, 600).width : 0,
        detailBlock.width,
      );
      maxRight = Math.max(maxRight, detailTextX + widest);
    }

    // Leader line inside -> detail.
    shapes.push({
      id: `leader${index}`,
      kind: 'path',
      d: `M ${cx + halfBottom},${(y0 + y1) / 2} L ${detailX - 8},${(y0 + y1) / 2}`,
      fill: 'none',
      stroke: color.stroke,
      strokeWidth: 1,
      colorIndex: index,
    });
  });

  return {
    width: maxRight + 16,
    height: top + height + 16,
    shapes,
    texts,
    icons: icons!.length ? icons : undefined,
  };
}
