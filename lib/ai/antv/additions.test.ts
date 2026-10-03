// @vitest-environment jsdom
//
// PATCH-262. Additions: the shapes/icons/text a user draws ON an AntV picture.
// Pure sanitize + DOM drawing, plus the key/update helpers the editor uses.
import { describe, expect, it } from 'vitest';

import {
  applyElementOverrides,
  elementKey,
  outlineWithOverrides,
  sanitizeElementOverrides,
  type ElementOverrides,
} from './elementOverrides';
import type { VisualOutline } from '@/lib/ai/outline';
import {
  ADDITION_MAX,
  additionIdFromKey,
  additionKey,
  appendAddition,
  applyAdditions,
  createAddition,
  isAdditionKey,
  removeAddition,
  sanitizeAdditions,
  updateAddition,
  type Addition,
} from './additions';

function svgHost(inner = ''): { host: HTMLElement; svg: SVGSVGElement } {
  const host = document.createElement('div');
  host.innerHTML = `<svg viewBox="0 0 400 300">${inner}</svg>`;
  return { host, svg: host.querySelector('svg') as SVGSVGElement };
}

function overridesWith(additions: Addition[]): ElementOverrides {
  return { template: 't', items: {}, additions };
}

function addition(partial: Partial<Addition> & Pick<Addition, 'id' | 'kind'>): Addition {
  return { x: 10, y: 20, w: 40, h: 30, ...partial } as Addition;
}

describe('PATCH-262 sanitizeAdditions', () => {
  it('keeps a valid addition and drops unknown fields', () => {
    const out = sanitizeAdditions([
      { id: 'abc123', kind: 'circle', x: 1, y: 2, w: 30, h: 40, fill: '#AABBCC', junk: 7 },
    ]);
    expect(out).toEqual([
      { id: 'abc123', kind: 'circle', x: 1, y: 2, w: 30, h: 40, fill: '#aabbcc' },
    ]);
  });

  it('drops a bad id, bad kind and bad geometry entirely', () => {
    const out = sanitizeAdditions([
      { id: 'BAD', kind: 'circle', x: 1, y: 2, w: 30, h: 40 },
      { id: 'abc123', kind: 'blob', x: 1, y: 2, w: 30, h: 40 },
      { id: 'abc123', kind: 'circle', x: 1, y: 2, w: 0, h: 40 },
      { id: 'abc123', kind: 'circle', x: 6000, y: 2, w: 30, h: 40 },
    ]);
    expect(out).toBeUndefined();
  });

  it('drops an unknown icon and an out-of-range fontSize but keeps the addition', () => {
    const out = sanitizeAdditions([
      { id: 'abc123', kind: 'icon', x: 1, y: 2, w: 30, h: 40, icon: 'not-a-name' },
      { id: 'abc123', kind: 'text', x: 1, y: 2, w: 30, h: 40, label: 'x', fontSize: 200 },
    ]);
    expect(out).toHaveLength(2);
    expect(out![0]).toMatchObject({ id: 'abc123', kind: 'icon' });
    expect(out![0].icon).toBeUndefined();
    expect(out![1]).toMatchObject({ id: 'abc123', kind: 'text', label: 'x' });
    expect(out![1].fontSize).toBeUndefined();
  });

  it('strips < and > and control characters from a text label (never script)', () => {
    const out = sanitizeAdditions([
      { id: 'abc123', kind: 'text', x: 1, y: 2, w: 30, h: 40, label: '<script>\u0000hi</script>' },
    ]);
    expect(out?.[0].label).toBe('scripthi/script');
  });

  it('keeps a listed icon for kind icon and caps at 50 additions', () => {
    const one = sanitizeAdditions([
      { id: 'abc123', kind: 'icon', x: 1, y: 2, w: 30, h: 40, icon: 'star' },
    ]);
    expect(one?.[0].icon).toBe('star');

    const many = Array.from({ length: ADDITION_MAX + 5 }, (_, i) => ({
      id: `id${String(i).padStart(4, '0')}`,
      kind: 'rect',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    }));
    const capped = sanitizeAdditions(many);
    expect(capped).toHaveLength(ADDITION_MAX);
  });

  it('never throws on hostile stored data', () => {
    for (const raw of [null, 'nope', 42, {}, undefined]) {
      expect(sanitizeAdditions(raw)).toBeUndefined();
    }
  });
});

describe('PATCH-262 keys and updates', () => {
  it('round-trips an addition key', () => {
    expect(additionKey('abc123')).toBe('ai-addition@abc123');
    expect(isAdditionKey('ai-addition@abc123')).toBe(true);
    expect(isAdditionKey('item-icon@0')).toBe(false);
    expect(additionIdFromKey('ai-addition@abc123')).toBe('abc123');
    expect(additionIdFromKey('item-icon@0')).toBeNull();
  });

  it('updateAddition patches geometry and colour without mutating', () => {
    const base = overridesWith([addition({ id: 'abc123', kind: 'rect' })]);
    const next = updateAddition(base, 'ai-addition@abc123', { x: 99, fill: '#112233' });
    expect(next.additions?.[0]).toMatchObject({ x: 99, fill: '#112233', y: 20 });
    expect(base.additions?.[0].x).toBe(10);
  });

  it('removeAddition drops it, and createAddition centres the box on the point', () => {
    const base = overridesWith([addition({ id: 'abc123', kind: 'rect' })]);
    expect(removeAddition(base, 'ai-addition@abc123').additions).toEqual([]);

    const circle = createAddition('circle', { x: 100, y: 100 }, { id: 'abc123' });
    expect(circle.x).toBe(40);
    expect(circle.y).toBe(60);
    expect(circle.w).toBe(120);
    expect(circle.h).toBe(80);

    const text = createAddition('text', { x: 100, y: 100 }, { id: 'abc123' });
    expect(text.w).toBe(200);
    expect(text.h).toBe(40);
    expect(text.label).toBe('Text');
    expect(text.fill).toBeUndefined();

    const icon = createAddition('icon', { x: 100, y: 100 }, { id: 'abc123' });
    expect(icon.w).toBe(64);
    expect(icon.h).toBe(64);
  });

  it('appendAddition keeps existing items and adds the new addition to the outline', () => {
    const outline: VisualOutline = {
      title: 'T',
      ordered: false,
      kind: 'list',
      items: [{ label: 'A' }],
      elementOverrides: { template: 't', items: { 'shape#0': { dx: 5 } }, additions: [] },
    };
    const next = appendAddition(outline, 't', addition({ id: 'newadd', kind: 'circle' }));
    expect(next.elementOverrides?.items['shape#0']).toEqual({ dx: 5 });
    expect(next.elementOverrides?.additions).toHaveLength(1);
    expect(next.elementOverrides?.additions?.[0].id).toBe('newadd');
    // The input outline is untouched.
    expect(outline.elementOverrides?.additions).toEqual([]);
  });

  it('appendAddition refuses to exceed the 50-addition cap', () => {
    const full = Array.from({ length: ADDITION_MAX }, (_, i) =>
      addition({ id: `id${String(i).padStart(5, '0')}`, kind: 'rect' }),
    );
    const outline: VisualOutline = {
      title: 'T',
      ordered: false,
      kind: 'list',
      items: [{ label: 'A' }],
      elementOverrides: { template: 't', items: {}, additions: full },
    };
    const next = appendAddition(outline, 't', addition({ id: 'newadd', kind: 'circle' }));
    expect(next).toBe(outline);
  });
});

describe('PATCH-262 applyAdditions', () => {
  it('draws each kind with the right element', () => {
    const { svg } = svgHost();
    const additions: Addition[] = [
      addition({ id: 'rect01', kind: 'rect' }),
      addition({ id: 'round1', kind: 'rounded' }),
      addition({ id: 'circle1', kind: 'circle' }),
      addition({ id: 'triang1', kind: 'triangle' }),
      addition({ id: 'line01', kind: 'line' }),
      addition({ id: 'arrow1', kind: 'arrow' }),
      addition({ id: 'text01', kind: 'text', label: 'Hello' }),
      addition({ id: 'icon01', kind: 'icon', icon: 'star' }),
    ];
    applyAdditions(svg, overridesWith(additions), 't');

    const node = (id: string) => svg.querySelector(`[data-ai-addition="${id}"]`) as Element;
    expect(node('rect01').querySelector('rect')).not.toBeNull();
    expect(node('round1').querySelector('rect')!.getAttribute('rx')).not.toBeNull();
    expect(node('circle1').querySelector('ellipse')).not.toBeNull();
    expect(node('triang1').querySelector('path')).not.toBeNull();
    expect(node('line01').querySelector('line')).not.toBeNull();
    // An arrow is a line plus a head path.
    expect(node('arrow1').querySelector('line')).not.toBeNull();
    expect(node('arrow1').querySelectorAll('path').length).toBeGreaterThan(0);
    expect(node('text01').querySelector('foreignObject')).not.toBeNull();
    expect(node('text01').textContent).toBe('Hello');
    // Icons are paths inside a scaled <g>, never a nested <svg>.
    expect(node('icon01').querySelector('path')).not.toBeNull();
    expect(node('icon01').querySelector('svg')).toBeNull();
  });

  it('writes the text label with textContent, never innerHTML', () => {
    const { svg } = svgHost();
    // A raw markup label (as if it bypassed the sanitizer): it must be rendered
    // as literal text, never parsed into an element.
    applyAdditions(
      svg,
      overridesWith([addition({ id: 'text01', kind: 'text', label: '<script>alert(1)</script>' })]),
      't',
    );
    const foreign = svg.querySelector('[data-ai-addition="text01"] foreignObject')!;
    expect(foreign.querySelector('script')).toBeNull();
    expect(foreign.textContent).toBe('<script>alert(1)</script>');
  });

  it('appends one additions group as the LAST child, is idempotent, and removes stale ones', () => {
    const { svg } = svgHost('<g data-element-type="items-group"></g>');
    applyAdditions(svg, overridesWith([addition({ id: 'abc123', kind: 'rect' })]), 't');
    const group = svg.querySelector('[data-ai-additions]') as Element;
    expect(group).not.toBeNull();
    expect(svg.lastElementChild).toBe(group);

    const first = group.innerHTML;
    applyAdditions(svg, overridesWith([addition({ id: 'abc123', kind: 'rect' })]), 't');
    expect(svg.querySelectorAll('[data-ai-additions]')).toHaveLength(1);
    expect((svg.querySelector('[data-ai-additions]') as Element).innerHTML).toBe(first);

    applyAdditions(svg, overridesWith([]), 't');
    expect(svg.querySelector('[data-ai-additions]')).toBeNull();
  });

  it('stays under AntV transient-container when it is present', () => {
    const { svg } = svgHost(
      '<g data-element-type="items-group"></g><g data-element-type="transient-container"></g>',
    );
    applyAdditions(svg, overridesWith([addition({ id: 'abc123', kind: 'rect' })]), 't');
    const group = svg.querySelector('[data-ai-additions]') as Element;
    const transient = svg.querySelector('[data-element-type="transient-container"]') as Element;
    expect(svg.lastElementChild).toBe(transient);
    expect(group.nextElementSibling).toBe(transient);
  });

  it('removes the group when the template does not match', () => {
    const { svg } = svgHost();
    applyAdditions(svg, overridesWith([addition({ id: 'abc123', kind: 'rect' })]), 't');
    expect(svg.querySelector('[data-ai-additions]')).not.toBeNull();
    applyAdditions(svg, overridesWith([addition({ id: 'abc123', kind: 'rect' })]), 'other');
    expect(svg.querySelector('[data-ai-additions]')).toBeNull();
  });
});

describe('PATCH-262 additions integrate with elementOverrides', () => {
  it('sanitizeElementOverrides keeps additions, alone or beside items', () => {
    const both = sanitizeElementOverrides({
      template: 't',
      items: { 'shape#0': { dx: 1 } },
      additions: [{ id: 'abc123', kind: 'rect', x: 0, y: 0, w: 10, h: 10 }],
    });
    expect(both?.items['shape#0']).toEqual({ dx: 1 });
    expect(both?.additions).toHaveLength(1);

    const only = sanitizeElementOverrides({
      template: 't',
      items: {},
      additions: [{ id: 'abc123', kind: 'rect', x: 0, y: 0, w: 10, h: 10 }],
    });
    expect(only?.additions).toHaveLength(1);
    expect(only?.items).toEqual({});
  });

  it('outlineWithOverrides keeps an additions-only map and drops an empty one', () => {
    const base: VisualOutline = { title: 'T', ordered: false, kind: 'list', items: [{ label: 'A' }] };
    const withAdd = outlineWithOverrides(base, overridesWith([addition({ id: 'abc123', kind: 'rect' })]));
    expect(withAdd.elementOverrides?.additions).toHaveLength(1);

    const empty = outlineWithOverrides(withAdd, { template: 't', items: {}, additions: [] });
    expect(empty.elementOverrides).toBeUndefined();
  });

  it('elementKey names an addition by its id, and leaves real AntV keys unchanged', () => {
    const { svg } = svgHost(
      '<g data-element-type="items-group"><rect data-element-type="shape"/>' +
        '<foreignObject data-element-type="item-label" data-indexes="1"></foreignObject></g>',
    );
    const realShapeKeyBefore = elementKey(svg.querySelector('[data-element-type="shape"]') as Element, svg);
    const realLabelKeyBefore = elementKey(svg.querySelector('[data-element-type="item-label"]') as Element, svg);

    applyElementOverrides(svg, overridesWith([addition({ id: 'abc123', kind: 'circle' })]), 't');

    const node = svg.querySelector('[data-ai-addition="abc123"]') as Element;
    expect(elementKey(node, svg)).toBe('ai-addition@abc123');
    // Lesson 5: adding the group never shifts AntV's own keys/ordinals.
    expect(elementKey(svg.querySelector('[data-element-type="shape"]') as Element, svg)).toBe(realShapeKeyBefore);
    expect(elementKey(svg.querySelector('[data-element-type="item-label"]') as Element, svg)).toBe(realLabelKeyBefore);
  });

  it('applyElementOverrides draws the addition and does not restore it away', () => {
    const { svg } = svgHost('<g data-element-type="items-group"><rect data-element-type="shape"/></g>');
    const list = overridesWith([addition({ id: 'abc123', kind: 'circle', fill: '#112233' })]);
    applyElementOverrides(svg, list, 't');
    const ellipse = svg.querySelector('[data-ai-addition="abc123"] ellipse') as Element;
    expect(ellipse.getAttribute('fill')).toBe('#112233');

    // A second pass (idempotent) still draws it with the same fill.
    applyElementOverrides(svg, list, 't');
    expect((svg.querySelector('[data-ai-addition="abc123"] ellipse') as Element).getAttribute('fill')).toBe('#112233');
  });
});
