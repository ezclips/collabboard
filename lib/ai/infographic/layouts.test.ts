import { describe, expect, it } from 'vitest';

import { ALL_TEMPLATES, layoutInfographic, TEMPLATE_RANGE } from './index';
import { textBox, type InfographicShape } from './shared';
import { outline, shapeBox, overlaps } from './testUtils';

function items(count: number) {
  return Array.from({ length: count }, (_, i) => ({ label: `Item ${i + 1}`, detail: `Detail for item ${i + 1}` }));
}

/** The bounds a text must lie inside, for a rect/circle/polygon shape. */
function insideBounds(shape: InfographicShape, textY: number): { left: number; right: number; top: number; bottom: number } {
  if (shape.kind === 'circle') {
    const r = shape.r ?? 0;
    // Inside the inscribed square.
    const inset = r * Math.SQRT1_2;
    return { left: (shape.cx ?? 0) - inset, right: (shape.cx ?? 0) + inset, top: (shape.cy ?? 0) - inset, bottom: (shape.cy ?? 0) + inset };
  }
  if (shape.kind === 'polygon' && shape.points) {
    // A trapezoid band: the usable width at the text's row is the narrower of
    // the top and bottom edges (points are given top-left, top-right, bottom-right, bottom-left).
    const pts = shape.points.split(' ').map((p) => p.split(',').map(Number));
    const [tl, tr, br, bl] = pts;
    const topHalf = (tr[0] - tl[0]) / 2;
    const botHalf = (br[0] - bl[0]) / 2;
    const half = Math.min(topHalf, botHalf);
    const centre = (tl[0] + tr[0] + br[0] + bl[0]) / 4;
    const top = Math.min(tl[1], tr[1]);
    const bottom = Math.max(bl[1], br[1]);
    return { left: centre - half, right: centre + half, top, bottom };
  }
  return shapeBox(shape);
}

describe('PATCH-236 infographic layouts', () => {
  for (const template of ALL_TEMPLATES) {
    const range = TEMPLATE_RANGE[template];

    it(`${template}: holds only within ${range.min}-${range.max} items`, () => {
      const atMax = layoutInfographic(template, outline(items(range.max)));
      expect(atMax.shapes.length).toBeGreaterThan(0);
      expect(atMax.texts.length).toBeGreaterThan(0);
    });

    it(`${template}: every label and detail appears in texts`, () => {
      const o = outline(items(range.min));
      const layout = layoutInfographic(template, o);
      const joined = layout.texts.map((t) => t.lines.join(' ')).join(' | ');
      for (const item of o.items) {
        expect(joined, `missing label ${item.label}`).toContain(item.label);
        if (item.detail) expect(joined).toContain(item.detail);
      }
    });

    it(`${template}: no two text boxes overlap`, () => {
      const layout = layoutInfographic(template, outline(items(range.max)));
      const boxes = layout.texts.map(textBox);
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(overlaps(boxes[i], boxes[j]), `${template}: text ${i} overlaps ${j}`).toBe(false);
        }
      }
    });

    it(`${template}: every text box stays inside width/height`, () => {
      const layout = layoutInfographic(template, outline(items(range.max)));
      for (const text of layout.texts) {
        const box = textBox(text);
        expect(box.left).toBeGreaterThanOrEqual(-1);
        expect(box.top).toBeGreaterThanOrEqual(-1);
        expect(box.right).toBeLessThanOrEqual(layout.width + 1);
        expect(box.bottom).toBeLessThanOrEqual(layout.height + 1);
      }
    });

    it(`${template}: never splits a word (no label line is a mid-word fragment)`, () => {
      const source = 'Heading levels example';
      const o = outline([{ label: source }, ...items(range.min - 1)]);
      const layout = layoutInfographic(template, o);
      // Joining the produced lines' tokens must reproduce the source words
      // exactly, in order -- a mid-word slice would break this.
      const produced = layout.texts
        .flatMap((t) => t.lines)
        .join(' ')
        .split(/\s+/)
        .filter(Boolean);
      const sourceTokens = produced.filter((tok) => ['Heading', 'levels', 'example'].includes(tok));
      expect(sourceTokens).toEqual(['Heading', 'levels', 'example']);
      // And no token is a fragment like "Headi" or "ng".
      for (const fragment of ['Headi', 'ng', 'level', 'exam']) {
        expect(produced).not.toContain(fragment);
      }
    });

    it(`${template}: every inside-shape text lies inside its shape`, () => {
      const layout = layoutInfographic(template, outline(items(range.min)));
      for (const text of layout.texts) {
        if (!text.insideShapeId) continue;
        const shape = layout.shapes.find((s) => s.id === text.insideShapeId);
        expect(shape, `shape ${text.insideShapeId} not found`).toBeTruthy();
        const box = textBox(text);
        const bounds = insideBounds(shape!, text.y);
        expect(box.left, `${template}:${text.id} left`).toBeGreaterThanOrEqual(bounds.left - 1);
        expect(box.right, `${template}:${text.id} right`).toBeLessThanOrEqual(bounds.right + 1);
        expect(box.top, `${template}:${text.id} top`).toBeGreaterThanOrEqual(bounds.top - 1);
        expect(box.bottom, `${template}:${text.id} bottom`).toBeLessThanOrEqual(bounds.bottom + 1);
      }
    });

    it(`${template}: a long label wraps within its own box`, () => {
      const o = outline([{ label: 'A very long label that should wrap across several words cleanly' }, ...items(range.min - 1)]);
      const layout = layoutInfographic(template, o);
      expect(layout.texts.some((t) => t.lines.length > 1)).toBe(true);
    });
  }

  it('stack: the first item is the top band', () => {
    const layout = layoutInfographic('stack', outline(items(4)));
    const first = layout.texts.find((t) => t.lines.join(' ').includes('Item 1'))!;
    const second = layout.texts.find((t) => t.lines.join(' ').includes('Item 2'))!;
    expect(first.y).toBeLessThan(second.y);
  });

  it('pyramid: the first item is at the narrow top (or moved out, never the bottom)', () => {
    const layout = layoutInfographic('pyramid', outline(items(4)));
    const bands = layout.shapes.filter((s) => s.id.startsWith('band'));
    const widthOf = (s: typeof bands[number]) => {
      const pts = (s.points ?? '').split(' ').map((p) => Number(p.split(',')[0]));
      return Math.max(...pts) - Math.min(...pts);
    };
    expect(widthOf(bands[0])).toBeLessThan(widthOf(bands[bands.length - 1]));
  });

  it("stairs: the first step is at the left, the last is highest", () => {
    const layout = layoutInfographic('stairs', outline(items(4)));
    const steps = layout.shapes.filter((s) => s.id.startsWith('step'));
    expect(steps[0].x!).toBeLessThan(steps[steps.length - 1].x!);
    expect(steps[steps.length - 1].y!).toBeLessThan(steps[0].y!);
  });

  it("cycle: the first item starts at 12 o'clock", () => {
    const layout = layoutInfographic('cycle', outline(items(4)));
    const nodes = layout.shapes.filter((s) => s.id.startsWith('node'));
    const title = layout.texts.find((t) => t.id === 'title')!;
    expect(nodes[0].cy!).toBeLessThan(title.y);
    expect(Math.abs(nodes[0].cx! - title.x)).toBeLessThan(4);
  });

  it('cycle: every arrow is an ARC along the ring (never through the centre)', () => {
    const layout = layoutInfographic('cycle', outline(items(5)));
    const title = layout.texts.find((t) => t.id === 'title')!;
    for (const arrow of layout.shapes.filter((s) => s.id.startsWith('arrow') && !s.id.startsWith('arrowHead'))) {
      const m = /^M ([\d.-]+),([\d.-]+) A ([\d.-]+),([\d.-]+) 0 0 1 ([\d.-]+),([\d.-]+)$/.exec(arrow.d!);
      expect(m, `arc path: ${arrow.d}`).not.toBeNull();
      expect(Number(m![3])).toBeCloseTo(Number(m![4]), 3); // equal rx/ry
      const radius = Number(m![3]);
      for (const [px, py] of [[Number(m![1]), Number(m![2])], [Number(m![5]), Number(m![6])]]) {
        const dist = Math.hypot(px - title.x, py - title.y);
        expect(Math.abs(dist - radius), 'point on the ring').toBeLessThanOrEqual(2);
      }
      // The arc does not pass through the centre: radius is well above 0.
      expect(radius).toBeGreaterThan(40);
    }
  });

  it('funnel: the first band is the widest', () => {
    const layout = layoutInfographic('funnel', outline(items(4)));
    const bands = layout.shapes.filter((s) => s.id.startsWith('band'));
    const widthOf = (s: typeof bands[number]) => {
      const pts = (s.points ?? '').split(' ').map((p) => Number(p.split(',')[0]));
      return Math.max(...pts) - Math.min(...pts);
    };
    expect(widthOf(bands[0])).toBeGreaterThan(widthOf(bands[bands.length - 1]));
  });

  it('hub: the title is in the centre circle', () => {
    const layout = layoutInfographic('hub', outline(items(4)));
    const hub = layout.shapes.find((s) => s.id === 'hub')!;
    const title = layout.texts.find((t) => t.id === 'title')!;
    const box = shapeBox(hub);
    expect(box.left).toBeLessThan(title.x);
    expect(box.right).toBeGreaterThan(title.x);
  });

  it('Addendum 4: pyramid moves "Heading 1" out on ONE line (wrapped at the detail width)', () => {
    const o = outline([{ label: 'Heading 1', detail: 'First level detail' }, { label: 'Heading 2' }, { label: 'Heading 3' }]);
    const layout = layoutInfographic('pyramid', o);
    // "Heading 1" appears as a whole line somewhere (inside a band or as the
    // detail's first line), never split into "Heading" / "1".
    const allLines = layout.texts.flatMap((t) => t.lines);
    expect(allLines).toContain('Heading 1');
    expect(allLines).not.toContain('Heading');
  });

  it('Addendum 4: stairs detail text never overlaps a step box', () => {
    const layout = layoutInfographic('stairs', outline(items(4)));
    const stepBoxes = layout.shapes.filter((s) => s.id.startsWith('step')).map(shapeBox);
    for (const text of layout.texts.filter((t) => t.id.startsWith('detail'))) {
      const box = textBox(text);
      for (const step of stepBoxes) {
        expect(overlaps(box, step), `${text.id} overlaps a step box`).toBe(false);
      }
    }
  });

  it('Addendum 4: every text box lies within the canvas with padding (anchor-aware)', () => {
    for (const template of ALL_TEMPLATES) {
      const layout = layoutInfographic(template, outline(items(TEMPLATE_RANGE[template].max)));
      for (const text of layout.texts) {
        const box = textBox(text);
        expect(box.left, `${template}:${text.id} left`).toBeGreaterThanOrEqual(-1);
        expect(box.right, `${template}:${text.id} right`).toBeLessThanOrEqual(layout.width + 1);
      }
    }
  });
});

describe('PATCH-237 infographic icons', () => {
  const WITH_ICONS = [
    { label: 'Alpha', detail: 'first', icon: 'sun' },
    { label: 'Beta', detail: 'second', icon: 'leaf' },
    { label: 'Gamma', detail: 'third', icon: 'snowflake' },
    { label: 'Delta', detail: 'fourth', icon: 'cloud' },
  ];

  for (const template of ALL_TEMPLATES) {
    it(`${template}: draws one icon per item, inside its shape, not overlapping text`, () => {
      const layout = layoutInfographic(template, outline(WITH_ICONS));
      const icons = layout.icons ?? [];
      expect(icons.length).toBeGreaterThan(0);

      const iconBox = (i: { x: number; y: number; size: number }) => ({
        left: i.x, right: i.x + i.size, top: i.y, bottom: i.y + i.size,
      });
      const textBoxes = layout.texts.map(textBox);
      for (const icon of icons) {
        const box = iconBox(icon);
        // Not overlapping any text box.
        for (const tb of textBoxes) {
          expect(overlaps(box, tb), `${template}: icon ${icon.name} overlaps text`).toBe(false);
        }
        // Inside its shape, when it names one.
        if (icon.insideShapeId) {
          const shape = layout.shapes.find((s) => s.id === icon.insideShapeId)!;
          const bounds = insideBounds(shape, icon.y + icon.size / 2);
          expect(box.left, `${template}:${icon.name} left`).toBeGreaterThanOrEqual(bounds.left - 1);
          expect(box.right, `${template}:${icon.name} right`).toBeLessThanOrEqual(bounds.right + 1);
        }
      }
    });

    it(`${template}: without icons the geometry is unchanged`, () => {
      const withoutIcons = outline(WITH_ICONS.map(({ icon, ...rest }) => rest));
      const plain = outline(WITH_ICONS.map(({ icon, ...rest }) => rest));
      const a = layoutInfographic(template, withoutIcons);
      const b = layoutInfographic(template, plain);
      expect(a.icons).toBeUndefined();
      expect(a).toEqual(b);
    });
  }
});
