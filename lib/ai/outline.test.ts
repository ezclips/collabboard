import { describe, expect, it } from 'vitest';

import { OUTLINE_LIMITS, OutlineParseError, parseOutline } from './outline';

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
