import { describe, expect, it } from 'vitest';

import { ALL_TEMPLATES, layoutInfographic } from './infographic';
import {
  OUTLINE_LIMITS,
  OUTLINE_SYSTEM_PROMPT,
  OutlineParseError,
  parseOutline,
  sanitizeTextStyle,
  withValuesEstimated,
} from './outline';
import { outlineToVisuals } from './outlineToVisuals';
import { VISUAL_THEMES } from './visualThemes';

describe('PATCH-233 parseOutline', () => {
  it('passes a valid outline and drops extra fields', () => {
    const out = parseOutline({
      title: 'Water cycle',
      ordered: true,
      junk: 'drop me',
      items: [
        { label: 'Evaporation', detail: 'Sun heats water', date: 'morning', extra: 1, children: [{ label: 'Oceans', foo: 1 }] },
        { label: 'Condensation' },
      ],
    });

    expect(out).toEqual({
      title: 'Water cycle',
      ordered: true,
      kind: 'timeline',
      items: [
        { label: 'Evaporation', detail: 'Sun heats water', date: 'morning', children: [{ label: 'Oceans' }] },
        { label: 'Condensation' },
      ],
    });
  });

  it('trims over-long strings to the limits instead of failing', () => {
    const out = parseOutline({
      title: 'T'.repeat(200),
      items: [
        { label: 'L'.repeat(200), detail: 'D'.repeat(400), date: 'X'.repeat(100) },
        { label: 'Second', children: [{ label: 'C'.repeat(200) }] },
      ],
    });

    expect(out.title.length).toBe(OUTLINE_LIMITS.title);
    expect(out.items[0].label.length).toBe(OUTLINE_LIMITS.label);
    expect(out.items[0].detail!.length).toBe(OUTLINE_LIMITS.detail);
    expect(out.items[0].date!.length).toBe(OUTLINE_LIMITS.date);
    expect(out.items[1].children![0].label.length).toBe(OUTLINE_LIMITS.label);
  });

  it('drops empty children and empty items', () => {
    const out = parseOutline({
      title: 'X',
      items: [
        { label: 'Keep', children: [{ label: '' }, { label: '   ' }, { label: 'Real' }] },
        { label: '   ' },
        { label: 'Also keep' },
      ],
    });

    expect(out.items.map((item) => item.label)).toEqual(['Keep', 'Also keep']);
    expect(out.items[0].children).toEqual([{ label: 'Real' }]);
  });

  it('throws the typed error when fewer than two usable items remain', () => {
    expect(() => parseOutline({ title: 'x', items: [{ label: 'only' }] })).toThrow(OutlineParseError);
    expect(() => parseOutline({ title: 'x' })).toThrow(OutlineParseError);
    expect(() => parseOutline('not an object')).toThrow(OutlineParseError);
  });
});

describe('PATCH-236 outline kind', () => {
  const items = [{ label: 'A' }, { label: 'B' }];
  const valid = ['list', 'steps', 'levels', 'cycle', 'parts', 'comparison', 'timeline', 'cause_effect'];

  it('parses a known kind', () => {
    for (const kind of valid) {
      expect(parseOutline({ title: 'T', kind, items }).kind).toBe(kind);
    }
  });

  it('an unknown kind falls back by rule', () => {
    // items with a date + ordered -> timeline
    expect(parseOutline({ title: 'T', kind: 'bogus', ordered: true, items: [{ label: 'A', date: 'Jan' }, { label: 'B' }] }).kind)
      .toBe('timeline');
    // ordered, no date -> steps
    expect(parseOutline({ title: 'T', kind: 'bogus', ordered: true, items }).kind).toBe('steps');
    // unordered, no date -> list
    expect(parseOutline({ title: 'T', kind: 'bogus', items }).kind).toBe('list');
  });

  it('a missing kind falls back by the same rule', () => {
    expect(parseOutline({ title: 'T', ordered: true, items: [{ label: 'A', date: '2020' }, { label: 'B' }] }).kind).toBe('timeline');
    expect(parseOutline({ title: 'T', ordered: true, items }).kind).toBe('steps');
    expect(parseOutline({ title: 'T', items }).kind).toBe('list');
  });
});

describe('PATCH-237 outline icons', () => {
  it('keeps a listed icon and drops an unlisted one', () => {
    const out = parseOutline({
      title: 'T',
      items: [
        { label: 'A', icon: 'sun' },
        { label: 'B', icon: 'not-a-real-icon' },
        { label: 'C' },
      ],
    });
    expect(out.items[0].icon).toBe('sun');
    expect(out.items[1].icon).toBeUndefined();
    expect(out.items[2].icon).toBeUndefined();
  });
});

describe('PATCH-242 outline item side', () => {
  it('keeps a valid side and drops anything else, never failing the post', () => {
    const out = parseOutline({
      title: 'T',
      items: [
        { label: 'A', side: 'left' },
        { label: 'B', side: 'right' },
        { label: 'C', side: 'up' },
        { label: 'D' },
        { label: 'E', side: 3 },
      ],
    });
    expect(out.items[0].side).toBe('left');
    expect(out.items[1].side).toBe('right');
    expect(out.items[2].side).toBeUndefined();
    expect(out.items[3].side).toBeUndefined();
    expect(out.items[4].side).toBeUndefined();
  });
});

describe('PATCH-240 outline item colour', () => {
  it('keeps a palette slot 0..5 and drops an invalid one', () => {
    const out = parseOutline({
      title: 'T',
      items: [
        { label: 'A', color: 3 },
        { label: 'B', color: 9 },
        { label: 'C', color: -1 },
        { label: 'D', color: 2.5 },
        { label: 'E' },
      ],
    });
    expect(out.items[0].color).toBe(3);
    expect(out.items[1].color).toBeUndefined();
    expect(out.items[2].color).toBeUndefined();
    expect(out.items[3].color).toBeUndefined();
    expect(out.items[4].color).toBeUndefined();
  });
});

describe('PATCH-248 outline item value', () => {
  it('keeps a finite number, drops a string, a negative and NaN', () => {
    const out = parseOutline({
      title: 'Budget',
      items: [
        { label: 'Venue', value: 40 },
        { label: 'Food', value: '40%' },
        { label: 'Travel', value: -1 },
        { label: 'Other', value: Number.NaN },
        { label: 'Misc' },
      ],
    });
    expect(out.items[0].value).toBe(40);
    expect(out.items[1].value).toBeUndefined();
    expect(out.items[2].value).toBeUndefined();
    expect(out.items[3].value).toBeUndefined();
    expect(out.items[4].value).toBeUndefined();
  });

  it('keeps a zero and a decimal', () => {
    const out = parseOutline({
      title: 'T',
      items: [
        { label: 'A', value: 0 },
        { label: 'B', value: 12.5 },
      ],
    });
    expect(out.items[0].value).toBe(0);
    expect(out.items[1].value).toBe(12.5);
  });
});

describe('PATCH-248 outline prompt value rule', () => {
  it('shows an optional value in the example and forbids inventing one', () => {
    expect(OUTLINE_SYSTEM_PROMPT).toContain('"value": 40');
    expect(OUTLINE_SYSTEM_PROMPT).toContain('Never invent a value');
  });
});

describe('PATCH-250 valuesEstimated', () => {
  it('withValuesEstimated returns a new flagged object and never mutates its input', () => {
    const base = parseOutline({
      title: 'Budget',
      items: [
        { label: 'Venue', value: 60 },
        { label: 'Food', value: 40 },
      ],
    });
    const next = withValuesEstimated(base);

    expect(next).not.toBe(base);
    expect(next.valuesEstimated).toBe(true);
    expect(base.valuesEstimated).toBeUndefined();
    expect(next.items).toBe(base.items);
  });

  it('parseOutline drops a model-supplied valuesEstimated flag', () => {
    const out = parseOutline({
      title: 'Budget',
      valuesEstimated: true,
      items: [
        { label: 'Venue', value: 60 },
        { label: 'Food', value: 40 },
      ],
    });

    expect(out.valuesEstimated).toBeUndefined();
  });
});

describe('PATCH-244 sanitizeTextStyle', () => {
  it('keeps a real hex/rgb(a) colour, size, font family and align', () => {
    expect(sanitizeTextStyle({ fill: '#f00', fontSize: 14, fontFamily: 'Alibaba PuHuiTi', align: 'center' })).toEqual({
      fill: '#f00',
      fontSize: 14,
      fontFamily: 'Alibaba PuHuiTi',
      align: 'center',
    });
    expect(sanitizeTextStyle({ fill: '#a1b2c3' })).toEqual({ fill: '#a1b2c3' });
    expect(sanitizeTextStyle({ fill: '#a1b2c3dd' })).toEqual({ fill: '#a1b2c3dd' });
    expect(sanitizeTextStyle({ fill: 'rgb(255, 0, 0)' })).toEqual({ fill: 'rgb(255, 0, 0)' });
    expect(sanitizeTextStyle({ fill: 'rgba(1, 2, 3, 0.5)' })).toEqual({ fill: 'rgba(1, 2, 3, 0.5)' });
  });

  it('drops a hostile or malformed fill', () => {
    for (const fill of ['red', 'url(x)', '#12', 'rgb(300,0,0)', '#fff;x', 'javascript:alert(1)']) {
      expect(sanitizeTextStyle({ fill }), fill).toBeUndefined();
    }
  });

  it('drops an out-of-range or non-integer font size', () => {
    expect(sanitizeTextStyle({ fontSize: 7 })).toBeUndefined();
    expect(sanitizeTextStyle({ fontSize: 73 })).toBeUndefined();
    expect(sanitizeTextStyle({ fontSize: 12.5 })).toBeUndefined();
    expect(sanitizeTextStyle({ fontSize: 14 })).toEqual({ fontSize: 14 });
  });

  it('drops an unknown font family and an unknown align', () => {
    expect(sanitizeTextStyle({ fontFamily: 'Comic Sans MS' })).toBeUndefined();
    expect(sanitizeTextStyle({ align: 'justify' })).toBeUndefined();
    expect(sanitizeTextStyle({ align: 'right' })).toEqual({ align: 'right' });
  });

  it('never throws on hostile stored data, and an empty style is removed', () => {
    expect(sanitizeTextStyle('nonsense')).toBeUndefined();
    expect(sanitizeTextStyle(null)).toBeUndefined();
    expect(sanitizeTextStyle({})).toBeUndefined();
    expect(sanitizeTextStyle({ fill: { toString: () => { throw new Error('boom'); } } })).toBeUndefined();
  });
});

describe('PATCH-244 parseOutline text style', () => {
  it('keeps a valid stored style and drops a hostile fill', () => {
    const out = parseOutline({
      title: 'T',
      titleStyle: { fill: '#00ff00', fontSize: 20 },
      items: [
        {
          label: 'A',
          textStyle: { label: { fill: '#123456' }, detail: { fontSize: 12 }, icon: { fill: 'rgb(1,2,3)' } },
        },
        { label: 'B', textStyle: { label: { fill: 'url(evil)' }, detail: { fontSize: 999 } } },
      ],
    });
    expect(out.titleStyle).toEqual({ fill: '#00ff00', fontSize: 20 });
    expect(out.items[0].textStyle).toEqual({
      label: { fill: '#123456' },
      detail: { fontSize: 12 },
      icon: { fill: 'rgb(1,2,3)' },
    });
    expect(out.items[1].textStyle).toBeUndefined();
  });

  it('removes an empty style object', () => {
    const out = parseOutline({ title: 'T', items: [{ label: 'A', textStyle: {} }, { label: 'B' }] });
    expect(out.items[0].textStyle).toBeUndefined();
  });

  it('our own six layouts and the tree ignore AntV textStyle', () => {
    const o = parseOutline({
      title: 'T',
      titleStyle: { fill: '#ff0000' },
      items: [
        { label: 'A', textStyle: { label: { fill: '#ff0000' } } },
        { label: 'B', textStyle: { label: { fill: '#ff0000' } } },
      ],
    });
    for (const template of ALL_TEMPLATES) {
      const layout = layoutInfographic(template, o, VISUAL_THEMES.classic);
      expect(layout.texts.every((text) => text.color !== '#ff0000'), template).toBe(true);
    }
    expect(JSON.stringify(outlineToVisuals(o))).not.toContain('#ff0000');
  });
});
