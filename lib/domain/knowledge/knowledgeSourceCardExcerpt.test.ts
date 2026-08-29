import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_SOURCE_CARD_EXCERPT_MAX_LENGTH as CAP,
  knowledgeSourceCardExcerpt,
} from './knowledgeSourceCardExcerpt';
import type { SourceReference } from './knowledgePersistence';

/**
 * P6J-F8-B2 -- eligibility for the card's read-only source excerpt.
 *
 * The gate is the product of this module, so most of these are negatives. The
 * ids are branded nominal types with no runtime component, hence the cast.
 */
type ReferenceOverrides = Partial<Record<keyof SourceReference, unknown>>;

function reference(overrides: ReferenceOverrides = {}): SourceReference {
  return {
    id: 'ref-1',
    targetPadletId: 'padlet-1',
    sourceDocumentId: 'doc-1',
    pageStart: 2,
    pageEnd: 2,
    quoteText: 'Opening are prime examples',
    quoteHash: 'hash',
    charStart: 1329,
    charEnd: 1355,
    locator: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as SourceReference;
}

describe('knowledgeSourceCardExcerpt eligibility', () => {
  it('renders a verified exact span verbatim', () => {
    // The write command stored the SERVER'S OWN slice of the canonical page for
    // this shape, so the text is provenance rather than a client claim.
    expect(knowledgeSourceCardExcerpt([reference()])).toEqual({
      text: 'Opening are prime examples',
      truncated: false,
    });
  });

  it('EXCLUDES a page-only reference even though its quote is non-empty', () => {
    /**
     * THE LOAD-BEARING NEGATIVE.
     *
     * Page-only rows are written by the "create a Note from this page" path,
     * which sends the ENTIRE page text as a client-supplied quote. On the first
     * board using this feature four of six live references are page-only, with
     * stored quotes of 1546 and 1591 characters. Displaying them would dump a
     * page onto a 280px card AND would present unverified client text as
     * canonical provenance. Absent offsets is the whole signal.
     */
    const pageOnly = reference({
      quoteText: 'A'.repeat(1591),
      charStart: null,
      charEnd: null,
    });

    expect(knowledgeSourceCardExcerpt([pageOnly])).toBeNull();
  });

  it('excludes an empty span, which the column constraint tolerates', () => {
    // `char_end >= char_start` passes the CHECK, so a direct insert can produce
    // offsets the write command would have refused. A span nobody can see is
    // not evidence that the quote beside it was ever verified.
    expect(knowledgeSourceCardExcerpt([reference({ charStart: 40, charEnd: 40 })])).toBeNull();
  });

  it.each([
    ['negative charStart', { charStart: -1, charEnd: 10 }],
    ['reversed range', { charStart: 20, charEnd: 10 }],
    ['fractional charStart', { charStart: 1.5, charEnd: 10 }],
    ['fractional charEnd', { charStart: 1, charEnd: 10.5 }],
    ['NaN charStart', { charStart: Number.NaN, charEnd: 10 }],
    ['NaN charEnd', { charStart: 1, charEnd: Number.NaN }],
    ['only charStart present', { charStart: 1, charEnd: null }],
    ['only charEnd present', { charStart: null, charEnd: 10 }],
  ])('excludes %s', (_name, offsets) => {
    expect(knowledgeSourceCardExcerpt([reference(offsets as ReferenceOverrides)])).toBeNull();
  });

  it('excludes valid offsets carrying no usable quote', () => {
    expect(knowledgeSourceCardExcerpt([reference({ quoteText: null })])).toBeNull();
    expect(knowledgeSourceCardExcerpt([reference({ quoteText: '' })])).toBeNull();
  });

  it('renders nothing for a Note with no references', () => {
    expect(knowledgeSourceCardExcerpt([])).toBeNull();
  });

  it('renders nothing for a Note with several references, even eligible ones', () => {
    // The card marker already collapses to "N sources" because picking one
    // citation to show would misrepresent the rest; an excerpt would make that
    // choice invisible.
    const two = [reference(), reference({ id: 'ref-2', quoteText: 'Second quote' })];
    expect(knowledgeSourceCardExcerpt(two)).toBeNull();
  });
});

describe('knowledgeSourceCardExcerpt clamping', () => {
  it('leaves a quote of exactly the cap untouched', () => {
    const quote = 'x'.repeat(CAP);
    expect(knowledgeSourceCardExcerpt([reference({ quoteText: quote, charEnd: 9000 })])).toEqual({
      text: quote,
      truncated: false,
    });
  });

  it('cuts a longer quote to the cap and marks it truncated', () => {
    const quote = 'x'.repeat(CAP + 100);
    const excerpt = knowledgeSourceCardExcerpt([reference({ quoteText: quote, charEnd: 9000 })]);

    expect(excerpt).not.toBeNull();
    expect(excerpt!.truncated).toBe(true);
    expect(excerpt!.text).toBe('x'.repeat(CAP) + '…');
    // The cap bounds the STORED text that reaches the DOM; the ellipsis is ours.
    expect(excerpt!.text.length).toBe(CAP + 1);
  });

  it('steps back rather than splitting a surrogate pair at the boundary', () => {
    // The astral character starts at index CAP-1, so a naive slice(0, CAP)
    // would keep its high half and drop its low half -- a lone surrogate the
    // user never selected, rendered as a replacement glyph.
    const quote = 'a'.repeat(CAP - 1) + '\u{1F600}' + 'b'.repeat(50);
    expect(quote.charCodeAt(CAP - 1)).toBeGreaterThanOrEqual(0xd800);
    expect(quote.charCodeAt(CAP - 1)).toBeLessThanOrEqual(0xdbff);

    const excerpt = knowledgeSourceCardExcerpt([reference({ quoteText: quote, charEnd: 9000 })]);

    expect(excerpt!.truncated).toBe(true);
    expect(excerpt!.text).toBe('a'.repeat(CAP - 1) + '…');
    // No lone surrogate survived. Array.from iterates code POINTS, so an
    // unpaired half shows up as a single-unit string in the surrogate range.
    const lone = Array.from(excerpt!.text).some(
      (character) => character.length === 1
        && character.charCodeAt(0) >= 0xd800
        && character.charCodeAt(0) <= 0xdfff,
    );
    expect(lone).toBe(false);
  });

  it('keeps a whole astral character when it ends before the boundary', () => {
    const quote = 'a'.repeat(CAP - 2) + '\u{1F600}' + 'b'.repeat(50);
    const excerpt = knowledgeSourceCardExcerpt([reference({ quoteText: quote, charEnd: 9000 })]);

    expect(excerpt!.text).toBe('a'.repeat(CAP - 2) + '\u{1F600}' + '…');
  });

  it('never trims, collapses or normalises the canonical text', () => {
    const quote = '  spaced\t\ttext\n\nwith  gaps  ';
    expect(knowledgeSourceCardExcerpt([reference({ quoteText: quote })])!.text).toBe(quote);
  });

  it('does not mutate the reference it read', () => {
    const original = reference({ quoteText: 'y'.repeat(CAP + 10), charEnd: 9000 });
    const snapshot = JSON.stringify(original);

    knowledgeSourceCardExcerpt([Object.freeze(original)]);

    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('KNI-R1-F/G/H noteContent eligibility gate', () => {
  it('12: a genuinely authored body suppresses the excerpt entirely', () => {
    expect(knowledgeSourceCardExcerpt([reference()], '<p>Opening are prime examples</p>')).toBeNull();
  });

  it('13: a legacy blank body still shows the excerpt (default parameter)', () => {
    expect(knowledgeSourceCardExcerpt([reference()])).toEqual({
      text: 'Opening are prime examples', truncated: false,
    });
    expect(knowledgeSourceCardExcerpt([reference()], '')).toEqual({
      text: 'Opening are prime examples', truncated: false,
    });
  });

  it('treats empty-editor wrapper noise as no body, not as authored content', () => {
    for (const empty of ['', '   ', '<p></p>', '<p><br></p>', '<p>   </p>']) {
      expect(knowledgeSourceCardExcerpt([reference()], empty), JSON.stringify(empty)).not.toBeNull();
    }
  });

  it('17: HTML-shaped note content is stripped as tags, never causing a false negative', () => {
    // A body containing literal angle brackets the user typed still counts as
    // meaningful -- the tag-strip only removes real markup, and any residual
    // non-whitespace character makes the body meaningful.
    expect(knowledgeSourceCardExcerpt([reference()], '<p>&lt;img&gt;</p>')).toBeNull();
  });

  it('14: multiple references still show no excerpt regardless of note content', () => {
    const two = [reference(), reference({ id: 'ref-2', quoteText: 'Second quote' })];
    expect(knowledgeSourceCardExcerpt(two, '')).toBeNull();
  });
});
