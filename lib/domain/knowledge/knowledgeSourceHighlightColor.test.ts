import { describe, expect, it } from 'vitest';
import { knowledgeSourceHighlightColor } from './knowledgeSourceHighlightColor';
import type { KnowledgeSourceNoteColors } from './knowledgeSourceHighlightColor';
import type { KnowledgeSourceHighlightSpan } from './knowledgeSourceHighlights';

/**
 * P6J-F8-B3 -- which colour, if any, one source highlight may wear.
 *
 * The rule is "every citing Note agrees, or nothing", so most of this file is
 * negatives. `A`/`B` are padlet ids; only `targetPadletId` matters here.
 */
function span(targetPadletId: string, start = 0, end = 10): KnowledgeSourceHighlightSpan {
  return {
    referenceId: `ref-${targetPadletId}-${start}`,
    targetPadletId,
    start,
    end,
    resolution: 'offset',
  } as KnowledgeSourceHighlightSpan;
}

/** Most tests exercise the primary `topStrip` authority. */
const colors = (entries: Record<string, string>): KnowledgeSourceNoteColors =>
  new Map(Object.entries(entries).map(([id, topStrip]) => [id, { topStrip }]));

describe('knowledgeSourceHighlightColor single Note', () => {
  it('tints with the citing Note card colour', () => {
    expect(knowledgeSourceHighlightColor([span('A')], colors({ A: '#dbeafe' })))
      .toEqual({ backgroundColor: '#dbeafe' });
  });

  it('returns the STORED spelling rather than a normalised one', () => {
    // Nothing here rewrites what the user picked; normalisation is comparison
    // only, so an uppercase card colour reaches the DOM as the user stored it.
    expect(knowledgeSourceHighlightColor([span('A')], colors({ A: '#DBEAFE' })))
      .toEqual({ backgroundColor: '#DBEAFE' });
  });

  it('renders nothing when the Note is absent from the map', () => {
    expect(knowledgeSourceHighlightColor([span('A')], colors({ B: '#dbeafe' }))).toBeNull();
  });

  it('renders nothing for a Note with no spans at all', () => {
    expect(knowledgeSourceHighlightColor([], colors({ A: '#dbeafe' }))).toBeNull();
  });

  it.each(['#ffffff', '#FFFFFF', '#fff', '#FFF', '#ffffffff', '#ffffff00'])(
    'treats %s as the card default and keeps the highlight neutral',
    (white) => {
      // A white highlight is an invisible one. Every spelling of white loses,
      // alpha included -- a transparent white tints nothing either.
      expect(knowledgeSourceHighlightColor([span('A')], colors({ A: white }))).toBeNull();
    },
  );

  it.each([
    'red',
    'url(x)',
    'javascript:alert(1)',
    '#12',
    '#12345',
    '#1234567',
    '123456',
    '',
    '  #dbeafe  ',
    'rgb(1,2,3)',
  ])('rejects the non-hex value %j without repairing it', (value) => {
    expect(knowledgeSourceHighlightColor([span('A')], colors({ A: value }))).toBeNull();
  });

  it.each(['#abc', '#dbeafe', '#11223344'])('accepts the hex spelling %s', (value) => {
    expect(knowledgeSourceHighlightColor([span('A')], colors({ A: value })))
      .toEqual({ backgroundColor: value });
  });

  it('two citations from the SAME Note are one opinion, not a conflict', () => {
    // A Note may hold several references; colour belongs to the Note, so B2's
    // one-reference excerpt rule deliberately does not apply here.
    const spans = [span('A', 0, 10), span('A', 4, 20)];
    expect(knowledgeSourceHighlightColor(spans, colors({ A: '#dcfce7' })))
      .toEqual({ backgroundColor: '#dcfce7' });
  });
});

describe('knowledgeSourceHighlightColor overlapping Notes', () => {
  it('keeps a shared colour when different Notes agree', () => {
    const spans = [span('A'), span('B')];
    expect(knowledgeSourceHighlightColor(spans, colors({ A: '#dcfce7', B: '#dcfce7' })))
      .toEqual({ backgroundColor: '#dcfce7' });
  });

  it('treats the same colour spelled differently as agreement', () => {
    const spans = [span('A'), span('B')];
    expect(knowledgeSourceHighlightColor(spans, colors({ A: '#abc', B: '#AABBCC' })))
      .toEqual({ backgroundColor: '#abc' });
  });

  it('FAILS CLOSED when two Notes want different colours', () => {
    // The single most important negative: one background cannot honestly say
    // "this run belongs to both of these Notes", and picking spans[0] would
    // hide the other citation behind a colour that is not its own.
    const spans = [span('A'), span('B')];
    expect(knowledgeSourceHighlightColor(spans, colors({ A: '#dbeafe', B: '#fee2e2' }))).toBeNull();
  });

  it('fails closed when a coloured Note overlaps an uncoloured one', () => {
    const spans = [span('A'), span('B')];
    expect(knowledgeSourceHighlightColor(spans, colors({ A: '#dbeafe' }))).toBeNull();
  });

  it('fails closed when the second Note is default white', () => {
    const spans = [span('A'), span('B')];
    expect(knowledgeSourceHighlightColor(spans, colors({ A: '#dbeafe', B: '#ffffff' }))).toBeNull();
  });

  it('fails closed when the second Note colour is malformed', () => {
    const spans = [span('A'), span('B')];
    expect(knowledgeSourceHighlightColor(spans, colors({ A: '#dbeafe', B: 'red' }))).toBeNull();
  });

  it('renders nothing when no citing Note is coloured', () => {
    expect(knowledgeSourceHighlightColor([span('A'), span('B')], colors({}))).toBeNull();
  });

  it('is order independent -- an uncoloured Note first still fails closed', () => {
    expect(knowledgeSourceHighlightColor([span('B'), span('A')], colors({ A: '#dbeafe' }))).toBeNull();
  });
});

describe('knowledgeSourceHighlightColor topStrip authority, cardColor legacy fallback', () => {
  it('reads topStrip over a legacy cardColor when both are present', () => {
    const map: KnowledgeSourceNoteColors = new Map([['A', { topStrip: '#eab308', cardColor: '#dbeafe' }]]);
    expect(knowledgeSourceHighlightColor([span('A')], map)).toEqual({ backgroundColor: '#eab308' });
  });

  it('falls back to cardColor only when topStrip was never written at all', () => {
    const map: KnowledgeSourceNoteColors = new Map([['A', { cardColor: '#dbeafe' }]]);
    expect(knowledgeSourceHighlightColor([span('A')], map)).toEqual({ backgroundColor: '#dbeafe' });
  });

  it('an explicit topStrip of "transparent" is authoritative and does NOT fall back to cardColor', () => {
    const map: KnowledgeSourceNoteColors = new Map([['A', { topStrip: 'transparent', cardColor: '#dbeafe' }]]);
    expect(knowledgeSourceHighlightColor([span('A')], map)).toBeNull();
  });

  it('renders nothing for a Note with neither field', () => {
    const map: KnowledgeSourceNoteColors = new Map([['A', {}]]);
    expect(knowledgeSourceHighlightColor([span('A')], map)).toBeNull();
  });
});

describe('knowledgeSourceHighlightColor purity', () => {
  it('mutates neither the span list nor the colour map', () => {
    const spans = [span('A'), span('B')];
    const map = colors({ A: '#dbeafe', B: '#dbeafe' });
    const spansBefore = JSON.stringify(spans);
    const mapBefore = JSON.stringify([...map.entries()]);

    knowledgeSourceHighlightColor(Object.freeze(spans), map);

    expect(JSON.stringify(spans)).toBe(spansBefore);
    expect(JSON.stringify([...map.entries()])).toBe(mapBefore);
    expect(map.size).toBe(2);
  });
});
