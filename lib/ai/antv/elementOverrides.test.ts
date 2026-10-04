// @vitest-environment jsdom
//
// PATCH-260. The pure stored overrides: sanitize, stable element keys, and the
// DOM apply that keeps AntV's own transform as a base.
import { describe, expect, it } from 'vitest';

import {
  applyElementOverrides,
  ELEMENT_ORPHANED_MAX_KEYS,
  ELEMENT_OVERRIDE_MAX_KEYS,
  elementAtPoint,
  elementBaseBox,
  effectiveElementKey,
  elementItemScope,
  elementKey,
  elementScreenBox,
  isSelectableElement,
  itemMemberKeys,
  outlineWithOverrides,
  resizeOverrides,
  sanitizeElementOverrides,
  unionScreenBoxes,
  type ElementOverride,
} from './elementOverrides';
import { withoutElementOverrides } from './templateOverrides';
import type { VisualOutline } from '@/lib/ai/outline';

const FIXTURE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <g data-element-type="background"><rect width="400" height="300"/></g>
  <g data-element-type="title"><text>Title</text></g>
  <g data-element-type="shape"><path d="M0 0"/></g>
  <g data-element-type="shape"><path d="M1 1"/></g>
  <g data-element-type="btns-group"><g data-element-type="btn-add" data-indexes="0"><rect/></g></g>
  <g data-element-type="btn-icon-defs"><path/></g>
  <g data-element-type="items-group">
    <g data-element-type="shape"><rect/></g>
    <g data-element-type="item-icon-group"><g data-element-type="shape"><path/></g><use data-element-type="item-icon" data-indexes="0" href="#i"/></g>
    <g data-element-type="item-label" data-indexes="0"><text/></g>
    <g data-element-type="item-value" data-indexes="0"><text/></g>
    <g data-element-type="item-value" data-indexes="0"><text/></g>
  </g>
  <g data-element-type="items-group">
    <g data-element-type="shape"><rect/></g>
    <g data-element-type="item-label" data-indexes="1"><text/></g>
  </g>
</svg>`;

function fixture(): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = FIXTURE;
  return host.querySelector('svg') as SVGSVGElement;
}

function keyFor(svg: SVGSVGElement, selector: string, index = 0): string | null {
  const el = svg.querySelectorAll(selector)[index];
  return el ? elementKey(el, svg) : null;
}

describe('PATCH-260 sanitizeElementOverrides', () => {
  it('keeps a valid override and strips unknown fields', () => {
    const out = sanitizeElementOverrides({
      template: 'list-grid-badge-card',
      items: {
        'item-label@0,1': { dx: 12, dy: -4, sx: 2, sy: 0.5, hidden: true, junk: 9 },
      },
    });
    expect(out).toEqual({
      template: 'list-grid-badge-card',
      items: { 'item-label@0,1': { dx: 12, dy: -4, sx: 2, sy: 0.5, hidden: true } },
    });
  });

  it('drops bad keys and out-of-range / non-finite numbers', () => {
    const items: Record<string, ElementOverride> = {
      'Bad Key': { dx: 1 },
      'title#': { dx: 1 },
      '@0': { dx: 1 },
      'shape#0': { dx: Number.NaN, dy: 6000, sx: 0.05, sy: 11 },
      'shape#1': { dx: 1.5 },
    };
    items['x'.repeat(41)] = { dx: 1 };
    const out = sanitizeElementOverrides({ template: 't', items });
    expect(out?.items).toEqual({ 'shape#1': { dx: 1.5 } });
  });

  it('caps at 300 keys and reports an empty set as undefined', () => {
    const items: Record<string, ElementOverride> = {};
    for (let i = 0; i < 301; i += 1) items[`shape#${i}`] = { dx: 1 };
    const out = sanitizeElementOverrides({ template: 't', items });
    expect(Object.keys(out!.items)).toHaveLength(ELEMENT_OVERRIDE_MAX_KEYS);
    expect(out!.items['shape#0']).toEqual({ dx: 1 });
    expect(out!.items['shape#299']).toEqual({ dx: 1 });
    expect(out!.items['shape#300']).toBeUndefined();

    expect(sanitizeElementOverrides({ template: 't', items: {} })).toBeUndefined();
    expect(sanitizeElementOverrides({ template: '', items: { 'shape#0': { dx: 1 } } })).toBeUndefined();
  });

  it('never throws on hostile stored data', () => {
    for (const raw of [null, 'nope', 42, [], { template: 5 }, { template: 't', items: [] }, { template: 't' }]) {
      expect(sanitizeElementOverrides(raw)).toBeUndefined();
    }
    expect(sanitizeElementOverrides({ template: 't', items: { 'shape#0': null, 'shape#1': 'x' } })).toBeUndefined();
  });
});

describe('PATCH-260 elementKey', () => {
  it('names indexed elements and appends #n for duplicates', () => {
    const svg = fixture();
    expect(keyFor(svg, '[data-element-type="item-label"]')).toBe('item-label@0');
    expect(keyFor(svg, '[data-element-type="item-label"]', 1)).toBe('item-label@1');
    expect(keyFor(svg, '[data-element-type="item-value"]')).toBe('item-value@0#0');
    expect(keyFor(svg, '[data-element-type="item-value"]', 1)).toBe('item-value@0#1');
  });

  it('scopes an unindexed element to its item group, else uses a global ordinal', () => {
    const svg = fixture();
    // The two top-level shapes sit beside many items: global ordinals.
    const topShapes = svg.querySelectorAll('svg > [data-element-type="shape"]');
    expect(elementKey(topShapes[0], svg)).toBe('shape#0');
    expect(elementKey(topShapes[1], svg)).toBe('shape#1');
    expect(keyFor(svg, '[data-element-type="title"]')).toBe('title#0');

    // A shape inside an item group borrows that item's indexes.
    const groups = svg.querySelectorAll('[data-element-type="items-group"]');
    const groupShape = groups[0].querySelector('[data-element-type="shape"]') as Element;
    expect(elementKey(groupShape, svg)).toBe('shape@0#0');
    const groupShape1 = groups[1].querySelector('[data-element-type="shape"]') as Element;
    expect(elementKey(groupShape1, svg)).toBe('shape@1#0');
  });

  it('never keys background/buttons, and keys an icon group and its icon', () => {
    const svg = fixture();
    expect(keyFor(svg, '[data-element-type="background"]')).toBeNull();
    expect(keyFor(svg, '[data-element-type="btns-group"]')).toBeNull();
    expect(keyFor(svg, '[data-element-type="btn-add"]')).toBeNull();
    expect(keyFor(svg, '[data-element-type="btn-icon-defs"]')).toBeNull();
    expect(keyFor(svg, '[data-element-type="item-icon-group"]')).toBe('item-icon-group@0#0');
    // Defect 2. A 0x0-client-rect icon is still selectable, by its own indexes.
    expect(keyFor(svg, '[data-element-type="item-icon"]')).toBe('item-icon@0');
  });
});

describe('PATCH-260 item scopes and members', () => {
  it('assigns each element to its item scope, or null outside one', () => {
    const svg = fixture();
    const label = svg.querySelector('[data-element-type="item-label"]') as Element;
    const icon = svg.querySelector('[data-element-type="item-icon"]') as Element;
    const title = svg.querySelector('[data-element-type="title"]') as Element;
    const topShape = svg.querySelector('svg > [data-element-type="shape"]') as Element;
    expect(elementItemScope(label, svg)).toBe('0');
    expect(elementItemScope(icon, svg)).toBe('0');
    expect(elementItemScope(title, svg)).toBeNull();
    expect(elementItemScope(topShape, svg)).toBeNull();
  });

  it('lists an item\u2019s outermost members once, never nested children', () => {
    const svg = fixture();
    const keys = itemMemberKeys('0', svg);
    expect(keys).toContain('item-label@0');
    expect(keys).toContain('item-icon-group@0#0');
    expect(keys).toContain('shape@0#0');
    // The icon group already carries the icon and the inner shape.
    expect(keys).not.toContain('item-icon@0');
    expect(keys).not.toContain('shape@0#1');
    expect(new Set(keys).size).toBe(keys.length);
    expect(itemMemberKeys('1', svg)).toContain('item-label@1');
  });
});

describe('PATCH-260 flat sibling items (live list-grid-badge-card)', () => {
  function flatFixture(): SVGSVGElement {
    const host = document.createElement('div');
    host.innerHTML = `
      <svg viewBox="0 0 400 300">
        <g data-element-type="background"><rect width="400" height="300"/></g>
        <g data-element-type="title"><text>T</text></g>
        <g data-element-type="items-group">
          <rect data-element-type="shape"/>
          <use data-element-type="item-icon" data-indexes="0" href="#i"/>
          <foreignObject data-element-type="item-label" data-indexes="0"></foreignObject>
          <foreignObject data-element-type="item-value" data-indexes="0"></foreignObject>
          <rect data-element-type="shape"/>
          <use data-element-type="item-icon" data-indexes="1" href="#i"/>
          <foreignObject data-element-type="item-label" data-indexes="1"></foreignObject>
          <foreignObject data-element-type="item-value" data-indexes="1"></foreignObject>
        </g>
        <g data-element-type="btns-group">
          <g data-element-type="btn-add" data-indexes="0"><rect/></g>
          <g data-element-type="btn-remove" data-indexes="0"><rect/></g>
        </g>
      </svg>`;
    return host.querySelector('svg') as SVGSVGElement;
  }

  it('lists all members of each item: its shape plus every indexed part', () => {
    const svg = flatFixture();
    expect(itemMemberKeys('0', svg)).toEqual(['shape@0#0', 'item-icon@0', 'item-label@0', 'item-value@0']);
    expect(itemMemberKeys('1', svg)).toEqual(['shape@1#0', 'item-icon@1', 'item-label@1', 'item-value@1']);
  });

  it('never includes btn-* or the shared items-group', () => {
    const svg = flatFixture();
    for (const scope of ['0', '1']) {
      for (const key of itemMemberKeys(scope, svg)) {
        expect(key).not.toContain('btn');
        expect(key).not.toContain('items-group');
      }
    }
  });

  it('assigns each unindexed card shape to the item whose parts follow it', () => {
    const svg = flatFixture();
    const shapes = svg.querySelectorAll('[data-element-type="shape"]');
    expect(elementItemScope(shapes[0], svg)).toBe('0');
    expect(elementItemScope(shapes[1], svg)).toBe('1');
    const title = svg.querySelector('[data-element-type="title"]') as Element;
    expect(elementItemScope(title, svg)).toBeNull();
  });
});

describe('PATCH-260 mind-map wrapper items', () => {
  function mindmapFixture(): SVGSVGElement {
    const host = document.createElement('div');
    host.innerHTML = `
      <svg viewBox="0 0 400 300">
        <g data-element-type="items-group">
          <g data-element-type="item-icon-group">
            <use data-element-type="item-icon" data-indexes="0,1" href="#i"/>
          </g>
          <g data-element-type="item-label" data-indexes="0,1"><text/></g>
        </g>
      </svg>`;
    return host.querySelector('svg') as SVGSVGElement;
  }

  it('counts the icon group once and does not move its children twice', () => {
    const svg = mindmapFixture();
    const keys = itemMemberKeys('0,1', svg);
    expect(keys).toContain('item-icon-group@0,1#0');
    expect(keys).toContain('item-label@0,1');
    expect(keys.some((key) => key.startsWith('item-icon@'))).toBe(false);
  });
});

describe('PATCH-260 elementScreenBox', () => {
  it('measures a <use> with a 0x0 client rect through getBBox + getScreenCTM', () => {
    const svg = fixture();
    const icon = svg.querySelector('[data-element-type="item-icon"]') as Element;
    (icon as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
    (icon as unknown as { getBBox: () => { x: number; y: number; width: number; height: number } }).getBBox = () =>
      ({ x: 10, y: 20, width: 24, height: 24 });
    (icon as unknown as { getScreenCTM: () => { a: number; b: number; c: number; d: number; e: number; f: number } }).getScreenCTM =
      () => ({ a: 2, b: 0, c: 0, d: 2, e: 100, f: 200 });

    expect(elementScreenBox(icon)).toEqual({ left: 120, top: 240, width: 48, height: 48 });
    expect(unionScreenBoxes([elementScreenBox(icon), null])).toEqual({ left: 120, top: 240, width: 48, height: 48 });
  });

  it('elementAtPoint picks the smallest box containing the point, not a big title', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <svg viewBox="0 0 400 300">
        <foreignObject data-element-type="title" id="t" x="0" y="0" width="400" height="300"></foreignObject>
        <g data-element-type="items-group">
          <use data-element-type="item-icon" data-indexes="0" id="i" x="190" y="140" width="20" height="20" href="#i"/>
          <foreignObject data-element-type="item-label" data-indexes="0" id="l" x="220" y="140" width="20" height="20"></foreignObject>
        </g>
      </svg>`;
    const svg = host.querySelector('svg') as SVGSVGElement;
    (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; },
    });

    expect(elementAtPoint(svg, 200, 150)).toBe(svg.querySelector('#i'));
    // A point only the big title contains falls back to the title.
    expect(elementAtPoint(svg, 5, 5)).toBe(svg.querySelector('#t'));
    // Nothing at all.
    expect(elementAtPoint(svg, 500, 500)).toBeNull();
  });

  it('elementAtPoint falls back to x/y/width/height when getBBox is an empty 0x0', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <svg viewBox="0 0 400 300">
        <g data-element-type="items-group">
          <rect data-element-type="shape" id="card" x="0" y="100" width="120" height="60"/>
          <use data-element-type="item-icon" data-indexes="1" id="ic" x="12" y="118" width="24" height="24" href="#i"/>
        </g>
      </svg>`;
    const svg = host.querySelector('svg') as SVGSVGElement;
    (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; },
    });
    const icon = svg.querySelector('#ic') as Element;
    // Chrome: getBBox() is a finite but empty 0x0 for a <use>.
    (icon as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });

    // The point (20,125) is inside both the card and the icon; the icon's
    // attribute box makes it the smallest, so it wins.
    expect(elementAtPoint(svg, 20, 125)).toBe(icon);
    // A point inside only the card picks the card.
    expect(elementAtPoint(svg, 110, 155)).toBe(svg.querySelector('#card'));
  });
});

describe('PATCH-260 applyElementOverrides', () => {
  function one(transform?: string): { svg: SVGSVGElement; title: Element } {
    const svg = fixture();
    const title = svg.querySelector('[data-element-type="title"]') as Element;
    if (transform) title.setAttribute('transform', transform);
    (title as unknown as { getBBox: () => { x: number; y: number; width: number; height: number } }).getBBox = () =>
      ({ x: 5, y: 7, width: 20, height: 10 });
    return { svg, title };
  }

  const overrides = (override: ElementOverride) => ({
    template: 'list-grid-badge-card',
    items: { 'title#0': override },
  });

  it('sets a transform, keeps AntV base, hides, is idempotent and ignores another template', () => {
    const { svg, title } = one('translate(1 1)');
    applyElementOverrides(svg, overrides({ dx: 20, dy: 10, sx: 2, sy: 2 }), 'list-grid-badge-card');
    const first = title.getAttribute('transform')!;
    expect(first.startsWith('translate(1 1) ')).toBe(true);
    expect(first).toContain('translate(20 10)');
    expect(first).toContain('translate(5 7) scale(2 2) translate(-5 -7)');

    applyElementOverrides(svg, overrides({ dx: 20, dy: 10, sx: 2, sy: 2 }), 'list-grid-badge-card');
    expect(title.getAttribute('transform')).toBe(first);

    applyElementOverrides(svg, overrides({ hidden: true }), 'list-grid-badge-card');
    expect((title as SVGElement).style.display).toBe('none');

    const other = one('translate(1 1)');
    applyElementOverrides(other.svg, overrides({ dx: 999 }), 'some-other-template');
    expect(other.title.getAttribute('transform')).toBe('translate(1 1)');
  });

  it('restores the base transform when an override is removed', () => {
    const { svg, title } = one('translate(3 4)');
    applyElementOverrides(svg, overrides({ dx: 20 }), 'list-grid-badge-card');
    expect(title.getAttribute('transform')).toContain('translate(20 0)');
    applyElementOverrides(svg, { template: 'list-grid-badge-card', items: {} }, 'list-grid-badge-card');
    expect(title.getAttribute('transform')).toBe('translate(3 4)');
  });

  it('anchors a later scale on the base box, not the moved box (defect 6.2)', () => {
    const { svg, title } = one();
    // Model Chrome: getBBox() IGNORES the element's own transform.
    (title as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 5, y: 7, width: 20, height: 10 });
    // First move it, then scale it.
    applyElementOverrides(svg, overrides({ dx: 0, dy: -40 }), 'list-grid-badge-card');
    applyElementOverrides(svg, overrides({ dx: 0, dy: -40, sx: 2, sy: 2 }), 'list-grid-badge-card');
    const transform = title.getAttribute('transform')!;
    // The scale still pivots on the BASE top-left (5,7).
    expect(transform).toContain('translate(5 7) scale(2 2) translate(-5 -7)');
    // And the move is not added twice.
    expect(transform.match(/translate\(0 -40\)/g)).toHaveLength(1);
  });
});

describe('PATCH-260 defect 7.1: resize keeps the moved top-left (Chrome getBBox)', () => {
  /** Parse `translate(a b)` / `scale(a b)` ops and map a point through them. */
  function applyTransform(transform: string, px: number, py: number): { x: number; y: number } {
    let x = px;
    let y = py;
    // SVG applies left-to-right: the rightmost op acts first, but parsing the
    // string in order and composing gives the same point transform.
    const withMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const ops = transform.matchAll(/(translate|scale)\(([^)]+)\)/g);
    const chain: Array<{ kind: string; args: number[] }> = [];
    for (const op of ops) chain.push({ kind: op[1], args: op[2].trim().split(/[\s,]+/).map(Number) });
    // Apply in string order: each op is a function f_i; result = f_0(f_1(...f_n(p))).
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const { kind, args } = chain[i];
      if (kind === 'translate') {
        x += args[0];
        y += args[1];
      } else {
        x *= args[0];
        y *= args[1];
      }
    }
    void withMatrix;
    return { x, y };
  }

  it('a se-resize leaves the moved top-left exactly where it was', () => {
    // A flat-list card: a <rect> with AntV base geometry at (200, 100), 129x52.
    const svg = fixture();
    const rects = svg.querySelectorAll('[data-element-type="shape"]');
    const card = rects[rects.length - 1] as Element; // any shape; we key it by index later
    // Model Chrome: getBBox() returns x/y/width/height in the element's OWN
    // space and IGNORES the transform attribute.
    (card as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 200, y: 100, width: 129, height: 52 });
    (card as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
    (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; },
    });

    // Key the card, move it, then resize it (se) to 169x82.
    const key = elementKey(card, svg)!;
    // AntV often draws the card with its own base transform (the layout
    // position). Model that so the composition order is exercised.
    card.setAttribute('transform', 'translate(121 8)');
    const move = { template: 'list-grid-badge-card', items: { [key]: { dx: 0, dy: -40 } } };
    applyElementOverrides(svg, move, 'list-grid-badge-card');
    const resize = { template: 'list-grid-badge-card', items: { [key]: { dx: 0, dy: -40, sx: 169 / 129, sy: 82 / 52 } } };
    applyElementOverrides(svg, resize, 'list-grid-badge-card');

    const transform = card.getAttribute('transform')!;
    // The card's own top-left (200,100) through the full transform, PLUS AntV's
    // base translate (121, 8) which moves the whole card in the parent.
    const topLeft = applyTransform(transform, 200, 100);
    expect(topLeft.x).toBeCloseTo(121 + 200, 6);
    expect(topLeft.y).toBeCloseTo(8 + 60, 6); // 100 - 40, unchanged by the scale

    // The far corner grows by exactly the resize delta.
    const bottomRight = applyTransform(transform, 200 + 129, 100 + 52);
    expect(bottomRight.x).toBeCloseTo(121 + 200 + 169, 6);
    expect(bottomRight.y).toBeCloseTo(8 + 60 + 82, 6);
  });
});

describe('PATCH-260 outlineWithOverrides', () => {
  const base: VisualOutline = { title: 'T', ordered: false, kind: 'list', items: [{ label: 'A' }, { label: 'B' }] };

  it('adds overrides without mutating, and drops the field when empty', () => {
    const next = outlineWithOverrides(base, { template: 't', items: { 'title#0': { dx: 1 } } });
    expect(next.elementOverrides).toEqual({ template: 't', items: { 'title#0': { dx: 1 } } });
    expect(base.elementOverrides).toBeUndefined();

    const empty = outlineWithOverrides(next, { template: 't', items: {} });
    expect(empty.elementOverrides).toBeUndefined();
    expect(withoutElementOverrides(next).elementOverrides).toBeUndefined();
  });
});

describe('PATCH-261 element colours', () => {
  it('sanitize keeps hex fill/stroke/text (normalised lower-case) and drops junk', () => {
    const out = sanitizeElementOverrides({
      template: 't',
      items: {
        'shape#0': { fill: '#AABBCC', stroke: 'red', text: '#123' },
        'shape#1': { fill: '#12', stroke: 'url(x)', text: '#1234567' },
        'shape#2': { text: '#ABC', junk: 1 },
      },
    });
    expect(out?.items['shape#0']).toEqual({ fill: '#aabbcc', text: '#112233' });
    expect(out?.items['shape#1']).toBeUndefined();
    expect(out?.items['shape#2']).toEqual({ text: '#aabbcc' });
    // A named colour can never survive the sanitizer (the mutation guard).
    expect(JSON.stringify(out)).not.toContain('red');
  });

  const COLOUR_FIXTURE = `
    <svg viewBox="0 0 100 100">
      <defs><symbol id="lucide"><path d="M0 0" stroke="currentColor" fill="none"/></symbol></defs>
      <g data-element-type="items-group">
        <rect data-element-type="shape" data-indexes="0" x="0" y="0" width="10" height="10" fill="#111111" stroke="#222222"/>
        <use data-element-type="item-icon" data-indexes="0" href="#lucide" fill="#333333"/>
        <foreignObject data-element-type="item-label" data-indexes="0"><div style="color: #101010">Label</div></foreignObject>
        <text data-element-type="item-value" data-indexes="0" fill="#444444">10</text>
      </g>
    </svg>`;

  function colourFixture(): SVGSVGElement {
    const host = document.createElement('div');
    host.innerHTML = COLOUR_FIXTURE;
    return host.querySelector('svg') as SVGSVGElement;
  }

  function apply(svg: SVGSVGElement, items: Record<string, ElementOverride>): void {
    applyElementOverrides(svg, { template: 't', items }, 't');
  }

  it('applies fill, stroke and text; is idempotent; removing them restores the base', () => {
    const svg = colourFixture();
    const shape = svg.querySelector('[data-element-type="shape"]') as Element;
    const icon = svg.querySelector('[data-element-type="item-icon"]') as SVGElement;
    const label = svg.querySelector('[data-element-type="item-label"]') as Element;
    const labelText = label.firstElementChild as HTMLElement;
    const value = svg.querySelector('[data-element-type="item-value"]') as Element;

    const input: Record<string, ElementOverride> = {
      'shape@0': { fill: '#aabbcc', stroke: '#001122' },
      'item-icon@0': { fill: '#ff0000' },
      'item-label@0': { text: '#00ff00' },
      'item-value@0': { text: '#0000ff' },
    };
    apply(svg, input);

    expect(shape.getAttribute('fill')).toBe('#aabbcc');
    expect(shape.getAttribute('stroke')).toBe('#001122');
    expect(icon.getAttribute('fill')).toBe('#ff0000');
    // The lucide symbol is stroke-drawn: the icon colour is also its line colour.
    expect(icon.getAttribute('stroke')).toBe('#ff0000');
    // `color` is set too, so the icon's `currentColor` resolves to it.
    expect(icon.style.color).toBe('rgb(255, 0, 0)');
    // A foreignObject's inner text node takes the CSS `color`...
    expect(labelText.style.color).toBe('rgb(0, 255, 0)');
    // ...while an SVG <text> takes the `fill` attribute.
    expect(value.getAttribute('fill')).toBe('#0000ff');

    const snapshot = [
      shape.getAttribute('fill'),
      shape.getAttribute('stroke'),
      icon.getAttribute('fill'),
      icon.getAttribute('stroke'),
      icon.style.color,
      labelText.style.color,
      value.getAttribute('fill'),
    ];
    apply(svg, input);
    expect([
      shape.getAttribute('fill'),
      shape.getAttribute('stroke'),
      icon.getAttribute('fill'),
      icon.getAttribute('stroke'),
      icon.style.color,
      labelText.style.color,
      value.getAttribute('fill'),
    ]).toEqual(snapshot);

    // Reset (an empty override map) restores AntV's own colours.
    apply(svg, {});
    expect(shape.getAttribute('fill')).toBe('#111111');
    expect(shape.getAttribute('stroke')).toBe('#222222');
    expect(icon.getAttribute('fill')).toBe('#333333');
    expect(icon.getAttribute('stroke')).toBeNull();
    expect(icon.style.color).toBe('');
    expect(labelText.style.color).toBe('rgb(16, 16, 16)');
    expect(value.getAttribute('fill')).toBe('#444444');
  });
});

describe('PATCH-274 orphaned overrides', () => {
  it('sanitizes an orphaned map: valid keys kept, junk dropped, capped', () => {
    const orphaned: Record<string, ElementOverride> = {
      'item-label@1': { fill: '#AABBCC' },
      'Bad Key': { dx: 1 },
      'shape#9': { dx: Number.NaN },
      'shape@2': { hidden: true },
    };
    for (let i = 0; i < 60; i += 1) orphaned[`item-value@${i}`] = { dx: 1 };
    const out = sanitizeElementOverrides({ template: 't', items: {}, orphaned });
    expect(out?.items).toEqual({});
    expect(out?.orphaned!['item-label@1']).toEqual({ fill: '#aabbcc' });
    expect(out?.orphaned!['Bad Key']).toBeUndefined();
    expect(out?.orphaned!['shape#9']).toBeUndefined();
    expect(Object.keys(out!.orphaned!)).toHaveLength(ELEMENT_ORPHANED_MAX_KEYS);
  });

  it('an orphaned-only map is still a real map, and never applied to the DOM', () => {
    const out = sanitizeElementOverrides({
      template: 't',
      items: {},
      orphaned: { 'item-label@0': { fill: '#ff0000' } },
    });
    expect(out?.orphaned).toEqual({ 'item-label@0': { fill: '#ff0000' } });
    expect(
      outlineWithOverrides({ title: 'T', ordered: false, kind: 'list', items: [{ label: 'A' }] }, out).elementOverrides,
    ).toEqual(out);

    const svg = fixture();
    const label = svg.querySelector('[data-element-type="item-label"]') as Element;
    applyElementOverrides(svg, out, 't');
    // The live item is untouched: orphaned edits are never applied.
    expect(label.getAttribute('fill')).toBeNull();
  });
});

describe('PATCH-260 resizeOverrides', () => {
  it('makes a corner box exactly old + pointer delta at a non-1 screen CTM', () => {
    // 64.5x26 in local units at CTM scale 2 => 129x52 on screen.
    const result = resizeOverrides({
      handle: 'se',
      startScreenBox: { width: 129, height: 52 },
      delta: { dx: 40, dy: 30 },
      members: [{ key: 'shape@0#0', baseBox: { x: 0, y: 0, w: 64.5, h: 26 }, override: {} }],
      minScreenSize: 8,
    });
    const override = result['shape@0#0'];
    expect(129 * override.sx!).toBeCloseTo(169, 6);
    expect(52 * override.sy!).toBeCloseTo(82, 6);
    expect(override.dx).toBeCloseTo(0, 6);
    expect(override.dy).toBeCloseTo(0, 6);
  });

  it('scales one axis on an edge, leaving the other and the anchor alone', () => {
    const result = resizeOverrides({
      handle: 'e',
      startScreenBox: { width: 100, height: 50 },
      delta: { dx: 40, dy: 30 },
      members: [{ key: 'shape@0#0', baseBox: { x: 0, y: 0, w: 100, h: 50 }, override: {} }],
      minScreenSize: 8,
    });
    expect(result['shape@0#0'].sx).toBeCloseTo(1.4, 6);
    expect(result['shape@0#0'].sy).toBe(1);
  });

  it('moves the opposite edge for a west handle', () => {
    const result = resizeOverrides({
      handle: 'w',
      startScreenBox: { width: 100, height: 50 },
      delta: { dx: 40, dy: 0 },
      members: [{ key: 'shape@0#0', baseBox: { x: 0, y: 0, w: 100, h: 50 }, override: {} }],
      minScreenSize: 8,
    });
    // Right edge fixed at 100: the left moves right to 40, so sx 0.6 and
    // dx = w*(sx_old - sx_new) = 100*(1 - 0.6) = 40.
    expect(result['shape@0#0'].sx).toBeCloseTo(0.6, 6);
    expect(result['shape@0#0'].dx).toBeCloseTo(40, 6);
  });

  it('moves the opposite corner for nw, derived in user space', () => {
    const result = resizeOverrides({
      handle: 'nw',
      startScreenBox: { width: 100, height: 50 },
      delta: { dx: 40, dy: 30 },
      members: [{ key: 'shape@0#0', baseBox: { x: 0, y: 0, w: 100, h: 50 }, override: {} }],
      minScreenSize: 8,
    });
    const next = result['shape@0#0'];
    expect(next.sx).toBeCloseTo(0.6, 6);
    expect(next.sy).toBeCloseTo(0.4, 6);
    expect(next.dx).toBeCloseTo(100 * (1 - 0.6), 6);
    expect(next.dy).toBeCloseTo(50 * (1 - 0.4), 6);
  });

  it('scales every item member by the same factor, moving dx/dy only for left/top handles', () => {
    const result = resizeOverrides({
      handle: 'e',
      startScreenBox: { width: 150, height: 20 },
      delta: { dx: 150, dy: 0 },
      members: [
        { key: 'item-icon-group@0#0', baseBox: { x: 0, y: 0, w: 100, h: 20 }, override: {} },
        { key: 'item-label@0', baseBox: { x: 100, y: 0, w: 50, h: 20 }, override: {} },
      ],
      minScreenSize: 8,
    });
    expect(result['item-icon-group@0#0'].sx).toBeCloseTo(2, 6);
    expect(result['item-label@0'].sx).toBeCloseTo(2, 6);
    // An east handle fixes the left edge, so NO member's dx changes.
    expect(result['item-icon-group@0#0'].dx ?? 0).toBeCloseTo(0, 6);
    expect(result['item-label@0'].dx ?? 0).toBeCloseTo(0, 6);
  });

  it('defect 8: se-resize keeps dx/dy EXACTLY (live numbers)', () => {
    // rect x=0 y=0 200x80, moved dy -61.78449088696493, screen scale 0.6474.
    const result = resizeOverrides({
      handle: 'se',
      startScreenBox: { width: 129.48, height: 51.79 },
      delta: { dx: 40, dy: 30 },
      members: [{ key: 'shape@0#0', baseBox: { x: 0, y: 0, w: 200, h: 80 }, override: { dy: -61.78449088696493 } }],
      minScreenSize: 8,
    });
    const next = result['shape@0#0'];
    expect(next.dx ?? 0).toBe(0);
    expect(next.dy).toBeCloseTo(-61.78449088696493, 9);
    // old + delta on each axis: 129.48+40 / 200 = 0.8474... wait, it grows by
    // +40 screen over the 129.48 screen width.
    expect(next.sx).toBeCloseTo((129.48 + 40) / 129.48, 6);
    expect(next.sy).toBeCloseTo((51.79 + 30) / 51.79, 6);

    // And the composed transform pivots on (0,0) with the unchanged move.
    const svg = fixture();
    const rects = svg.querySelectorAll('[data-element-type="shape"]');
    const card = rects[rects.length - 1] as Element;
    (card as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 200, height: 80 });
    applyElementOverrides(
      svg,
      { template: 'list-grid-badge-card', items: { [elementKey(card, svg)!]: next } },
      'list-grid-badge-card',
    );
    expect(card.getAttribute('transform')).toContain('translate(0 -61.78449088696493) translate(0 0)');
  });

  it('keeps the top-left exact when the element already carries a move (defect 6.2)', () => {
    // shape@0#0 base at (50, 80), 100x40, already moved by (0, -40). Chrome's
    // getBBox ignores the transform, so elementBaseBox returns the base box.
    const el = {
      getAttribute: () => null,
      getBBox: () => ({ x: 50, y: 80, width: 100, height: 40 }),
    } as unknown as Element;
    const baseBox = elementBaseBox(el);
    expect(baseBox).toEqual({ x: 50, y: 80, w: 100, h: 40 });

    const result = resizeOverrides({
      handle: 'se',
      startScreenBox: { width: 200, height: 80 },
      delta: { dx: 40, dy: 30 },
      members: [{ key: 'shape@0#0', baseBox: { x: 50, y: 80, w: 100, h: 40 }, override: { dx: 0, dy: -40 } }],
      minScreenSize: 8,
    });
    const next = result['shape@0#0'];
    // A se-resize never changes the move.
    expect(next.dx ?? 0).toBe(0);
    expect(next.dy).toBe(-40);
    // Size: 1.2x and 1.375x of the base (screen 200+40 over 200, 80+30 over 80).
    expect(next.sx).toBeCloseTo(1.2, 6);
    expect(next.sy).toBeCloseTo(1.375, 6);
  });
});

describe('PATCH-261 fix: AntV transient-container overlay', () => {
  it('a transient-container and its subtree are never selectable or keyed', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <svg viewBox="0 0 400 300">
        <g data-element-type="items-group">
          <rect data-element-type="shape" data-indexes="0" x="0" y="100" width="120" height="60"/>
          <g data-element-type="item-label" data-indexes="0"><text/></g>
        </g>
        <g data-element-type="transient-container">
          <rect data-element-type="shape" data-indexes="0" x="0" y="100" width="120" height="60"/>
          <g data-element-type="item-label" data-indexes="0"><text/></g>
        </g>
      </svg>`;
    const svg = host.querySelector('svg') as SVGSVGElement;
    const transient = svg.querySelector('[data-element-type="transient-container"]') as Element;
    const transientShape = transient.querySelector('[data-element-type="shape"]') as Element;
    const transientLabel = transient.querySelector('[data-element-type="item-label"]') as Element;
    const realShape = svg.querySelector('svg > [data-element-type="items-group"] [data-element-type="shape"]') as Element;

    expect(elementKey(transient, svg)).toBeNull();
    expect(elementKey(transientShape, svg)).toBeNull();
    expect(elementKey(transientLabel, svg)).toBeNull();
    expect(isSelectableElement(transient)).toBe(false);
    expect(isSelectableElement(transientShape)).toBe(false);
    // The real card keeps the SAME key with the overlay present (the transient
    // duplicate must not shift its `#n`).
    expect(elementKey(realShape, svg)).toBe('shape@0');
  });

  it('elementAtPoint ignores the transient container and picks the real element', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <svg viewBox="0 0 400 300">
        <g data-element-type="items-group">
          <rect data-element-type="shape" data-indexes="0" id="real" x="0" y="0" width="100" height="100"/>
        </g>
        <g data-element-type="transient-container">
          <rect id="highlight" x="0" y="0" width="100" height="100"/>
        </g>
      </svg>`;
    const svg = host.querySelector('svg') as SVGSVGElement;
    (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; },
    });
    const real = svg.querySelector('#real') as Element;
    const transient = svg.querySelector('[data-element-type="transient-container"]') as Element;
    (real as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 100, height: 100 });
    (transient as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 100, height: 100 });

    // The transient group is LAST, so before the fix its (equal) box won the tie.
    expect(elementAtPoint(svg, 10, 10)).toBe(real);
  });
});

describe('PATCH-276 badge key (`item-icon-group@<path>#badge`)', () => {
  const BADGE_FIXTURE = `
    <svg viewBox="0 0 100 100">
      <g data-element-type="items-group">
        <g data-element-type="item-icon-group">
          <ellipse data-element-type="shape" fill="#ffffff"/>
          <use data-element-type="item-icon" data-indexes="0" href="#i" fill="#4f9d8f"/>
        </g>
        <g data-element-type="item-label" data-indexes="0"><text/></g>
      </g>
    </svg>`;

  function badgeFixture(): { svg: SVGSVGElement; group: Element; badge: Element; icon: Element } {
    const host = document.createElement('div');
    host.innerHTML = BADGE_FIXTURE;
    const svg = host.querySelector('svg') as SVGSVGElement;
    const group = svg.querySelector('[data-element-type="item-icon-group"]') as Element;
    return {
      svg,
      group,
      badge: group.querySelector('[data-element-type="shape"]') as Element,
      icon: group.querySelector('[data-element-type="item-icon"]') as Element,
    };
  }

  it('sanitize keeps a badge key with its fill', () => {
    const out = sanitizeElementOverrides({
      template: 't',
      items: { 'item-icon-group@0#0#badge': { fill: '#AABBCC' } },
    });
    expect(out?.items['item-icon-group@0#0#badge']).toEqual({ fill: '#aabbcc' });
  });

  it('effectiveElementKey names the badge child, distinct from the group and icon', () => {
    const { svg, group, badge, icon } = badgeFixture();
    expect(elementKey(group, svg)).toBe('item-icon-group@0#0');
    expect(elementKey(icon, svg)).toBe('item-icon@0');
    expect(effectiveElementKey(badge, svg)).toBe('item-icon-group@0#0#badge');
    // The badge element itself is not a keyed shape any more.
    expect(elementKey(badge, svg)).toBe('shape@0#0');
  });

  it('applies the badge fill and restores AntV base on reset', () => {
    const { svg, badge } = badgeFixture();
    applyElementOverrides(svg, { template: 't', items: { 'item-icon-group@0#0#badge': { fill: '#ff0000' } } }, 't');
    expect(badge.getAttribute('fill')).toBe('#ff0000');
    expect(badge.getAttribute('data-ai-base-fill')).toBe('#ffffff');

    applyElementOverrides(svg, { template: 't', items: {} }, 't');
    expect(badge.getAttribute('fill')).toBe('#ffffff');
    expect(badge.getAttribute('data-ai-base-fill')).toBeNull();
  });
});
