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
