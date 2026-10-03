/**
 * PATCH-272. Legacy replay fixtures for the stored-data load/save path. These are
 * hand-written, canonical examples of the shapes real posts take, so a change to
 * `parseOutline` / the persistence schemas is exercised against data the app has
 * actually written before. Pure data only; no production helpers are called here.
 */

import type { StoredAIContent } from './contracts';

/**
 * A canonical v1 AntV infographic: every trusted field the app itself writes is
 * present, so a fixture round-trip can prove none of them is dropped.
 */
export const ANTV_CURRENT_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Budget',
    template: 'antv:list-grid-badge-card',
    theme: 'teal-night',
    style: {
      background: '#ffffff',
      colors: ['#ff0000'],
      fonts: { title: { family: 'sans', weight: 700 } },
    },
    kicker: 'Q3',
    outline: {
      title: 'Budget',
      ordered: false,
      kind: 'parts',
      valuesEstimated: true,
      titleStyle: { fill: '#112233', fontSize: 20 },
      elementOverrides: {
        template: 'antv:list-grid-badge-card',
        items: { 'item-label@0': { dx: 12, dy: -3, sx: 2, sy: 0.5 } },
        additions: [{ id: 'abc123', kind: 'circle', x: 1, y: 2, w: 10, h: 10, fill: '#ff0000' }],
      },
      items: [
        { label: 'Venue', value: 40, textStyle: { label: { fill: '#ff0000' } } },
        { label: 'Food', value: 60 },
      ],
    },
  },
  meta: {
    renderer: 'infographic',
    subtype: 'infographic',
    prompt: 'Budget breakdown',
    createdAt: '2026-10-01T00:00:00.000Z',
    generatedBy: { source: 'collabboard-default', model: 'deepseek-chat' },
  },
};

/** A v1 infographic whose stored AntV template no longer exists. */
export const ANTV_UNKNOWN_TEMPLATE_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Budget',
    template: 'antv:obsolete-template',
    outline: {
      title: 'Budget',
      ordered: false,
      kind: 'parts',
      items: [{ label: 'Venue' }, { label: 'Food' }],
    },
  },
};

/**
 * A v1 infographic carrying every intended cleaning at once: an unknown AntV
 * template, an out-of-range override and a junk key, a model-only example flag
 * (outline `valuesExample` and per-item `valueExample`) and the trusted
 * `valuesEstimated` flag that must survive.
 */
export const ANTV_DIRTY_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Budget',
    template: 'antv:obsolete-template',
    outline: {
      title: 'Budget',
      ordered: false,
      kind: 'parts',
      valuesEstimated: true,
      valuesExample: true,
      elementOverrides: {
        template: 'list-grid-badge-card',
        items: {
          'item-label@0': { dx: 12 },
          'shape@1': { dx: 99999 },
          'Bad Key': { dx: 1 },
        },
      },
      items: [
        { label: 'Venue', value: 50, valueExample: true },
        { label: 'Food' },
      ],
    },
  },
};

const CANONICAL_OUTLINE = {
  title: 'Seasons',
  ordered: false,
  kind: 'levels' as const,
  items: [
    { label: 'Spring', detail: 'warm' },
    { label: 'Summer', detail: 'hot' },
    { label: 'Autumn', detail: 'cool' },
  ],
};

/** One v1 envelope per template our own infographic engine draws. */
export const OUR_TEMPLATE_ENVELOPES: StoredAIContent[] = (
  ['stack', 'pyramid', 'stairs', 'cycle', 'funnel', 'hub'] as const
).map((template) => ({
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Seasons',
    template,
    outline: CANONICAL_OUTLINE,
  },
}));

export const MINDMAP_TREE_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'mindmap',
    renderer: 'diagram_code',
    title: 'Water cycle',
    code: 'mindmap\n  root((Water cycle))',
    tree: {
      label: 'Water cycle',
      children: [
        { label: 'Evaporation', children: [{ label: 'Oceans' }] },
        { label: 'Condensation' },
      ],
    },
  },
};

export const MINDMAP_CODE_ONLY_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'mindmap',
    renderer: 'diagram_code',
    title: 'Water cycle',
    code: 'mindmap\n  root((Water cycle))\n    Evaporation\n    Condensation',
  },
};

export const PIE_CHART_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'pie_chart',
    renderer: 'chart',
    title: 'Budget',
    dataPoints: [
      { label: 'Venue', value: 40 },
      { label: 'Food', value: 60 },
    ],
  },
};

export const BAR_CHART_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'bar_chart',
    renderer: 'chart',
    title: 'Budget',
    dataPoints: [
      { label: 'Venue', value: 40 },
      { label: 'Food', value: 60 },
    ],
    xLabel: 'Item',
    yLabel: 'Share',
  },
};

export const TIMELINE_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'timeline',
    renderer: 'timeline',
    title: 'Launch',
    items: [
      { title: 'Kickoff', dateLabel: 'January', description: 'Planning' },
      { title: 'Ship', dateLabel: 'June' },
    ],
  },
};

export const COMPARISON_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'comparison',
    renderer: 'comparison',
    title: 'Plans',
    columns: [
      { heading: 'Free', points: ['One board', 'Basic'] },
      { heading: 'Pro', points: ['Unlimited', 'AI'] },
    ],
  },
};

export const FLOWCHART_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'flowchart',
    renderer: 'diagram_code',
    title: 'Flow',
    code: 'flowchart LR\n  A --> B',
  },
};

export const PHOTO_CARD_ENVELOPE: StoredAIContent = {
  mode: 'photo_card',
  version: 1,
  data: {
    type: 'photo',
    title: 'Puppy',
    image: { query: 'puppy', url: 'https://example.com/puppy.png' },
    caption: 'A good dog',
    kicker: 'NEW',
  },
};

export const LESSON_BOARD_ENVELOPE: StoredAIContent = {
  mode: 'lesson_board',
  version: 1,
  data: {
    type: 'lesson_board',
    title: 'Photosynthesis',
    objective: 'Explain how plants make food',
    sections: [
      { title: 'Light', bullets: ['Sunlight'], durationMinutes: 10 },
      { title: 'Dark', bullets: ['Calvin cycle'] },
    ],
  },
};

export const WORKSHOP_BOARD_ENVELOPE: StoredAIContent = {
  mode: 'workshop_board',
  version: 1,
  data: {
    type: 'workshop_board',
    title: 'Retro',
    blocks: [
      { title: 'Went well', description: 'Shipping' },
      { title: 'Improve', durationMinutes: 15 },
    ],
  },
};

export const LEGACY_HTML = { html: '<div>old post</div>' };

export const UNVERSIONED_STRUCTURED_DATA = {
  type: 'diagram',
  subtype: 'pie_chart',
  renderer: 'chart',
  title: 'Legacy pie',
  dataPoints: [
    { label: 'A', value: 1 },
    { label: 'B', value: 2 },
  ],
};

export const UNSUPPORTED_VERSION_ENVELOPE = {
  mode: 'diagram',
  version: 2,
  data: {
    type: 'diagram',
    subtype: 'pie_chart',
    renderer: 'chart',
    title: 'Future pie',
    dataPoints: [
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
    ],
  },
};
