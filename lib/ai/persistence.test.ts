import { describe, expect, it } from 'vitest';

import type { StoredAIContent } from './contracts';
import { normalizeAIContent } from './normalize-ai-content';
import {
  isPersistedAIContentEnvelope,
  isStructuredAIContentData,
  parsePersistedAIContentEnvelope,
  parseStructuredAIContentData,
  serializeAIContentForPersistence,
} from './persistence';
import * as fx from './persistence.fixtures';

/**
 * PATCH-272. Replay real stored-post shapes through the load (normalize) and
 * save (serialize) paths. The point is that the VALIDATED, transformed data is
 * what comes back -- not the unchecked original.
 */

const CANONICAL: Array<{ name: string; envelope: StoredAIContent }> = [
  { name: 'antv current', envelope: fx.ANTV_CURRENT_ENVELOPE },
  ...fx.OUR_TEMPLATE_ENVELOPES.map((envelope, index) => ({ name: `our template ${index}`, envelope })),
  { name: 'mindmap tree', envelope: fx.MINDMAP_TREE_ENVELOPE },
  { name: 'mindmap code only', envelope: fx.MINDMAP_CODE_ONLY_ENVELOPE },
  { name: 'pie chart', envelope: fx.PIE_CHART_ENVELOPE },
  { name: 'bar chart', envelope: fx.BAR_CHART_ENVELOPE },
  { name: 'timeline', envelope: fx.TIMELINE_ENVELOPE },
  { name: 'comparison', envelope: fx.COMPARISON_ENVELOPE },
  { name: 'flowchart', envelope: fx.FLOWCHART_ENVELOPE },
  { name: 'photo card', envelope: fx.PHOTO_CARD_ENVELOPE },
  { name: 'lesson board', envelope: fx.LESSON_BOARD_ENVELOPE },
  { name: 'workshop board', envelope: fx.WORKSHOP_BOARD_ENVELOPE },
];

describe('PATCH-272 legacy replay: canonical v1 envelopes round-trip unchanged', () => {
  it.each(CANONICAL)('$name', ({ envelope }) => {
    const expected = envelope.data;

    const normalized = normalizeAIContent(envelope);
    expect(normalized.kind).toBe('structured');
    if (normalized.kind !== 'structured') return;
    expect(normalized.data).toEqual(expected);

    const serialized = serializeAIContentForPersistence(envelope);
    expect(serialized).toBeTruthy();
    expect((serialized as StoredAIContent).data).toEqual(expected);

    expect(parseStructuredAIContentData(envelope.data)).toEqual(expected);
    expect(parsePersistedAIContentEnvelope(envelope)?.data).toEqual(expected);
  });
});

describe('PATCH-272 intended cleanings reach the loaded and saved data', () => {
  const DIRTY_EXPECTED = {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Budget',
    template: 'antv:list-grid-badge-card',
    outline: {
      title: 'Budget',
      ordered: false,
      kind: 'parts',
      valuesEstimated: true,
      elementOverrides: {
        template: 'list-grid-badge-card',
        items: { 'item-label@0': { dx: 12 } },
      },
      items: [
        { label: 'Venue', value: 50 },
        { label: 'Food' },
      ],
    },
  };

  it('an unknown antv: template falls back in the normalized AND serialized data', () => {
    const normalized = normalizeAIContent(fx.ANTV_UNKNOWN_TEMPLATE_ENVELOPE);
    expect(normalized.kind).toBe('structured');
    if (normalized.kind !== 'structured') return;
    expect((normalized.data as { template: string }).template).toBe('antv:list-grid-badge-card');

    const serialized = serializeAIContentForPersistence(fx.ANTV_UNKNOWN_TEMPLATE_ENVELOPE) as StoredAIContent;
    expect((serialized.data as { template: string }).template).toBe('antv:list-grid-badge-card');
  });

  it('drops an out-of-range override, a junk key, valuesExample and valueExample, but keeps valuesEstimated', () => {
    const normalized = normalizeAIContent(fx.ANTV_DIRTY_ENVELOPE);
    expect(normalized.kind).toBe('structured');
    if (normalized.kind !== 'structured') return;
    expect(normalized.data).toEqual(DIRTY_EXPECTED);

    const serialized = serializeAIContentForPersistence(fx.ANTV_DIRTY_ENVELOPE) as StoredAIContent;
    expect(serialized.data).toEqual(DIRTY_EXPECTED);
  });

  it('the parsed-data parsers agree on the same cleaning', () => {
    expect(parseStructuredAIContentData(fx.ANTV_DIRTY_ENVELOPE.data)).toEqual(DIRTY_EXPECTED);
    expect(parsePersistedAIContentEnvelope(fx.ANTV_DIRTY_ENVELOPE)?.data).toEqual(DIRTY_EXPECTED);
  });
});

describe('PATCH-272 non-structured shapes keep their current handling', () => {
  it('legacy HTML is returned as-is by normalize and serialize', () => {
    const normalized = normalizeAIContent(fx.LEGACY_HTML);
    expect(normalized).toEqual({ kind: 'legacy_html', html: fx.LEGACY_HTML.html });
    expect(serializeAIContentForPersistence(fx.LEGACY_HTML)).toEqual(fx.LEGACY_HTML);
  });

  it('an unversioned structured object is still accepted and not rejected', () => {
    const normalized = normalizeAIContent(fx.UNVERSIONED_STRUCTURED_DATA);
    expect(normalized.kind).toBe('structured');
    const serialized = serializeAIContentForPersistence(fx.UNVERSIONED_STRUCTURED_DATA) as StoredAIContent;
    expect(serialized.mode).toBe('diagram');
    expect(serialized.version).toBe(1);
    expect(serialized.data).toEqual(fx.UNVERSIONED_STRUCTURED_DATA);
  });

  it('an unsupported version is reported as such and not serialized', () => {
    const normalized = normalizeAIContent(fx.UNSUPPORTED_VERSION_ENVELOPE);
    expect(normalized).toEqual({
      kind: 'unsupported_structured_version',
      version: 2,
      raw: fx.UNSUPPORTED_VERSION_ENVELOPE,
    });
    expect(serializeAIContentForPersistence(fx.UNSUPPORTED_VERSION_ENVELOPE)).toBeUndefined();
  });
});

describe('PATCH-272 parsed-envelope helpers', () => {
  it('isPersistedAIContentEnvelope and isStructuredAIContentData stay thin wrappers', () => {
    expect(isPersistedAIContentEnvelope(fx.ANTV_CURRENT_ENVELOPE)).toBe(true);
    expect(isStructuredAIContentData(fx.ANTV_CURRENT_ENVELOPE.data)).toBe(true);
    expect(parseStructuredAIContentData({ type: 'nonsense' })).toBeNull();
    expect(parsePersistedAIContentEnvelope({ mode: 'diagram', version: 1, data: { type: 'nope' } })).toBeNull();
  });

  it('parsePersistedAIContentEnvelope keeps mode, version and meta', () => {
    const parsed = parsePersistedAIContentEnvelope(fx.ANTV_CURRENT_ENVELOPE);
    expect(parsed?.mode).toBe('diagram');
    expect(parsed?.version).toBe(1);
    expect(parsed?.meta).toEqual(fx.ANTV_CURRENT_ENVELOPE.meta);
  });
});
