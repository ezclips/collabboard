import type { AIMode, DiagramSubtype } from './contracts';

// -------------------------------------------------------------------------
// Failure categories — used by the test runner to classify why a test failed
// -------------------------------------------------------------------------
export type FailureCategory =
  | 'classifier_mismatch'
  | 'invalid_json'
  | 'schema_validation_failure'
  | 'empty_required_field'
  | 'renderer_risk_output'
  | 'conversion_mismatch';

// -------------------------------------------------------------------------
// Assertion helpers
// -------------------------------------------------------------------------
export interface GoldenAssertion {
  description: string;
  failureCategory: FailureCategory;
  check: (data: unknown) => boolean;
}

function rec(data: unknown): Record<string, unknown> {
  return typeof data === 'object' && data !== null
    ? (data as Record<string, unknown>)
    : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveNumber(value: unknown): boolean {
  return typeof value === 'number' && value > 0;
}

// -------------------------------------------------------------------------
// Golden prompt entry
// -------------------------------------------------------------------------
export interface GoldenPromptEntry {
  id: string;
  description: string;
  prompt: string;
  mode: AIMode;
  subtype?: DiagramSubtype;
  assertions: GoldenAssertion[];
}

// -------------------------------------------------------------------------
// Shared assertion builders
// -------------------------------------------------------------------------
const hasTitleAssertion: GoldenAssertion = {
  description: 'title is a non-empty string',
  failureCategory: 'empty_required_field',
  check: (d) => nonEmptyString(rec(d).title),
};

const hasCodeAssertion: GoldenAssertion = {
  description: 'code field is non-empty',
  failureCategory: 'empty_required_field',
  check: (d) => nonEmptyString(rec(d).code) && (rec(d).code as string).length > 10,
};

const codeHasNoHtmlAssertion: GoldenAssertion = {
  description: 'code field contains no HTML tags',
  failureCategory: 'renderer_risk_output',
  check: (d) => !/<[a-z][^>]*>/i.test(String(rec(d).code ?? '')),
};

function atLeastNDataPoints(n: number): GoldenAssertion {
  return {
    description: `at least ${n} dataPoints`,
    failureCategory: 'empty_required_field',
    check: (d) => arr(rec(d).dataPoints).length >= n,
  };
}

const allDataPointValuesPositive: GoldenAssertion = {
  description: 'all dataPoint values are positive numbers',
  failureCategory: 'schema_validation_failure',
  check: (d) =>
    arr(rec(d).dataPoints).length > 0 &&
    arr(rec(d).dataPoints).every((p) => positiveNumber(rec(p).value)),
};

const allDataPointLabelsNonEmpty: GoldenAssertion = {
  description: 'all dataPoint labels are non-empty strings',
  failureCategory: 'empty_required_field',
  check: (d) =>
    arr(rec(d).dataPoints).length > 0 &&
    arr(rec(d).dataPoints).every((p) => nonEmptyString(rec(p).label)),
};

function atLeastNItems(n: number): GoldenAssertion {
  return {
    description: `at least ${n} timeline items`,
    failureCategory: 'empty_required_field',
    check: (d) => arr(rec(d).items).length >= n,
  };
}

const allItemsHaveTitle: GoldenAssertion = {
  description: 'each timeline item has a non-empty title',
  failureCategory: 'empty_required_field',
  check: (d) =>
    arr(rec(d).items).length > 0 &&
    arr(rec(d).items).every((item) => nonEmptyString(rec(item).title)),
};

function atLeastNColumns(n: number): GoldenAssertion {
  return {
    description: `at least ${n} columns`,
    failureCategory: 'empty_required_field',
    check: (d) => arr(rec(d).columns).length >= n,
  };
}

const allColumnsHaveHeading: GoldenAssertion = {
  description: 'each column has a non-empty heading',
  failureCategory: 'empty_required_field',
  check: (d) =>
    arr(rec(d).columns).length > 0 &&
    arr(rec(d).columns).every((col) => nonEmptyString(rec(col).heading)),
};

const allColumnsHavePoints: GoldenAssertion = {
  description: 'each column has at least 1 point',
  failureCategory: 'empty_required_field',
  check: (d) =>
    arr(rec(d).columns).length > 0 &&
    arr(rec(d).columns).every((col) => arr(rec(col).points).length >= 1),
};

const imageQueryNonEmpty: GoldenAssertion = {
  description: 'image.query is a non-empty string',
  failureCategory: 'empty_required_field',
  check: (d) => nonEmptyString(rec(rec(d).image).query),
};

const imageQueryShort: GoldenAssertion = {
  description: 'image.query is a short phrase (under 60 chars)',
  failureCategory: 'renderer_risk_output',
  check: (d) => {
    const q = rec(rec(d).image).query;
    return typeof q === 'string' && q.length > 0 && q.length < 60;
  },
};

function atLeastNSections(n: number): GoldenAssertion {
  return {
    description: `at least ${n} sections`,
    failureCategory: 'empty_required_field',
    check: (d) => arr(rec(d).sections).length >= n,
  };
}

const allSectionsHaveTitle: GoldenAssertion = {
  description: 'each section has a non-empty title',
  failureCategory: 'empty_required_field',
  check: (d) =>
    arr(rec(d).sections).length > 0 &&
    arr(rec(d).sections).every((s) => nonEmptyString(rec(s).title)),
};

function atLeastNBlocks(n: number): GoldenAssertion {
  return {
    description: `at least ${n} blocks`,
    failureCategory: 'empty_required_field',
    check: (d) => arr(rec(d).blocks).length >= n,
  };
}

const allBlocksHaveTitle: GoldenAssertion = {
  description: 'each block has a non-empty title',
  failureCategory: 'empty_required_field',
  check: (d) =>
    arr(rec(d).blocks).length > 0 &&
    arr(rec(d).blocks).every((b) => nonEmptyString(rec(b).title)),
};

// -------------------------------------------------------------------------
// Golden prompt catalog
// -------------------------------------------------------------------------
export const GOLDEN_PROMPTS: GoldenPromptEntry[] = [

  // --- lesson_board (3 prompts) ---

  {
    id: 'lesson_board_water_cycle',
    description: 'Water cycle lesson for middle school',
    prompt: 'Create a 45-minute lesson board about the water cycle for middle school students.',
    mode: 'lesson_board',
    assertions: [hasTitleAssertion, atLeastNSections(2), allSectionsHaveTitle],
  },
  {
    id: 'lesson_board_fractions',
    description: 'Fractions lesson for elementary school',
    prompt: 'Build a 30-minute lesson on fractions for 4th grade students.',
    mode: 'lesson_board',
    assertions: [hasTitleAssertion, atLeastNSections(1), allSectionsHaveTitle],
  },
  {
    id: 'lesson_board_photosynthesis',
    description: 'Photosynthesis lesson for high school biology',
    prompt: 'Create a structured lesson about photosynthesis for 10th-grade biology.',
    mode: 'lesson_board',
    assertions: [hasTitleAssertion, atLeastNSections(2), allSectionsHaveTitle],
  },

  // --- diagram/flowchart (3 prompts) ---

  {
    id: 'flowchart_login',
    description: 'User login flowchart',
    prompt: 'Create a flowchart showing the user login process with password validation.',
    mode: 'diagram',
    subtype: 'flowchart',
    assertions: [hasTitleAssertion, hasCodeAssertion, codeHasNoHtmlAssertion],
  },
  {
    id: 'flowchart_plant_growth',
    description: 'Plant growth lifecycle',
    prompt: 'Show the process of plant growth from seed to flower.',
    mode: 'diagram',
    subtype: 'flowchart',
    assertions: [hasCodeAssertion, codeHasNoHtmlAssertion],
  },
  {
    id: 'flowchart_order_fulfillment',
    description: 'E-commerce order fulfillment',
    prompt: 'Create a flowchart of an e-commerce order fulfillment process from purchase to delivery.',
    mode: 'diagram',
    subtype: 'flowchart',
    assertions: [hasTitleAssertion, hasCodeAssertion, codeHasNoHtmlAssertion],
  },

  // --- diagram/mindmap (3 prompts) ---

  {
    id: 'mindmap_ww1_causes',
    description: 'Causes of World War I',
    prompt: 'Create a mindmap of the causes of World War I.',
    mode: 'diagram',
    subtype: 'mindmap',
    assertions: [hasTitleAssertion, hasCodeAssertion, codeHasNoHtmlAssertion],
  },
  {
    id: 'mindmap_climate_change',
    description: 'Climate change causes',
    prompt: 'Map the causes and effects of climate change in a visual concept map.',
    mode: 'diagram',
    subtype: 'mindmap',
    assertions: [hasCodeAssertion, codeHasNoHtmlAssertion],
  },
  {
    id: 'mindmap_web_dev_skills',
    description: 'Full-stack web development skills',
    prompt: 'Create a mindmap of skills needed to become a full-stack web developer.',
    mode: 'diagram',
    subtype: 'mindmap',
    assertions: [hasTitleAssertion, hasCodeAssertion, codeHasNoHtmlAssertion],
  },

  // --- diagram/pie_chart (3 prompts) ---

  {
    id: 'pie_chart_school_budget',
    description: 'School budget distribution',
    prompt: 'Show how a school budget is divided across staffing, supplies, transport, and facilities.',
    mode: 'diagram',
    subtype: 'pie_chart',
    assertions: [hasTitleAssertion, atLeastNDataPoints(2), allDataPointValuesPositive, allDataPointLabelsNonEmpty],
  },
  {
    id: 'pie_chart_energy_sources',
    description: 'Global energy production by source',
    prompt: 'Create a pie chart showing global energy production by source.',
    mode: 'diagram',
    subtype: 'pie_chart',
    assertions: [hasTitleAssertion, atLeastNDataPoints(2), allDataPointValuesPositive, allDataPointLabelsNonEmpty],
  },
  {
    id: 'pie_chart_time_allocation',
    description: 'Student daily time allocation',
    prompt: 'Show how a typical student allocates time across studying, socializing, sport, and sleep.',
    mode: 'diagram',
    subtype: 'pie_chart',
    assertions: [hasTitleAssertion, atLeastNDataPoints(3), allDataPointValuesPositive, allDataPointLabelsNonEmpty],
  },

  // --- diagram/bar_chart (3 prompts) ---

  {
    id: 'bar_chart_monthly_sales',
    description: 'Monthly sales Jan-Jun',
    prompt: 'Compare monthly sales figures for January to June.',
    mode: 'diagram',
    subtype: 'bar_chart',
    assertions: [hasTitleAssertion, atLeastNDataPoints(2), allDataPointValuesPositive, allDataPointLabelsNonEmpty],
  },
  {
    id: 'bar_chart_population',
    description: 'Top 5 most populous countries',
    prompt: 'Create a bar chart of the top 5 most populous countries.',
    mode: 'diagram',
    subtype: 'bar_chart',
    assertions: [hasTitleAssertion, atLeastNDataPoints(4), allDataPointValuesPositive, allDataPointLabelsNonEmpty],
  },
  {
    id: 'bar_chart_temperature',
    description: 'Average monthly temperatures',
    prompt: 'Show average monthly temperatures for a city across all 12 months.',
    mode: 'diagram',
    subtype: 'bar_chart',
    assertions: [hasTitleAssertion, atLeastNDataPoints(6), allDataPointLabelsNonEmpty],
  },

  // --- diagram/timeline (3 prompts) ---

  {
    id: 'timeline_space_exploration',
    description: 'Space exploration milestones',
    prompt: 'Create a timeline of major milestones in space exploration.',
    mode: 'diagram',
    subtype: 'timeline',
    assertions: [hasTitleAssertion, atLeastNItems(3), allItemsHaveTitle],
  },
  {
    id: 'timeline_internet_history',
    description: 'History of the internet',
    prompt: 'Show the key milestones in the history of the internet from 1960 to today.',
    mode: 'diagram',
    subtype: 'timeline',
    assertions: [hasTitleAssertion, atLeastNItems(4), allItemsHaveTitle],
  },
  {
    id: 'timeline_french_revolution',
    description: 'French Revolution events',
    prompt: 'Create a timeline of the main events of the French Revolution.',
    mode: 'diagram',
    subtype: 'timeline',
    assertions: [hasTitleAssertion, atLeastNItems(3), allItemsHaveTitle],
  },

  // --- diagram/comparison (3 prompts) ---

  {
    id: 'comparison_energy_sources',
    description: 'Renewable vs non-renewable energy',
    prompt: 'Compare renewable and non-renewable energy sources.',
    mode: 'diagram',
    subtype: 'comparison',
    assertions: [hasTitleAssertion, atLeastNColumns(2), allColumnsHaveHeading, allColumnsHavePoints],
  },
  {
    id: 'comparison_frontend_frameworks',
    description: 'React vs Vue vs Angular',
    prompt: 'Compare React, Vue, and Angular as frontend frameworks.',
    mode: 'diagram',
    subtype: 'comparison',
    assertions: [hasTitleAssertion, atLeastNColumns(2), allColumnsHaveHeading, allColumnsHavePoints],
  },
  {
    id: 'comparison_remote_vs_office',
    description: 'Remote work vs office work',
    prompt: 'Compare remote work and in-office work for knowledge workers.',
    mode: 'diagram',
    subtype: 'comparison',
    assertions: [hasTitleAssertion, atLeastNColumns(2), allColumnsHaveHeading, allColumnsHavePoints],
  },

  // --- photo_card (3 prompts) ---

  {
    id: 'photo_card_kyoto',
    description: 'Kyoto temples photo card',
    prompt: 'Create a visual card about Kyoto temples in Japan.',
    mode: 'photo_card',
    assertions: [hasTitleAssertion, imageQueryNonEmpty, imageQueryShort],
  },
  {
    id: 'photo_card_swiss_alps',
    description: 'Swiss alpine villages photo card',
    prompt: 'Create a photo card about alpine villages in Switzerland.',
    mode: 'photo_card',
    assertions: [hasTitleAssertion, imageQueryNonEmpty, imageQueryShort],
  },
  {
    id: 'photo_card_northern_lights',
    description: 'Northern lights in Norway photo card',
    prompt: 'Create a photo card about the northern lights in Norway.',
    mode: 'photo_card',
    assertions: [hasTitleAssertion, imageQueryNonEmpty, imageQueryShort],
  },

  // --- workshop_board (3 prompts) ---

  {
    id: 'workshop_board_remote_onboarding',
    description: 'Remote employee onboarding workshop',
    prompt: 'Create a half-day workshop board for onboarding new remote employees.',
    mode: 'workshop_board',
    assertions: [hasTitleAssertion, atLeastNBlocks(3), allBlocksHaveTitle],
  },
  {
    id: 'workshop_board_sprint_retro',
    description: 'Sprint retrospective workshop',
    prompt: 'Design a 90-minute sprint retrospective workshop for a software development team.',
    mode: 'workshop_board',
    assertions: [hasTitleAssertion, atLeastNBlocks(2), allBlocksHaveTitle],
  },
  {
    id: 'workshop_board_design_thinking',
    description: 'Full-day design thinking workshop',
    prompt: 'Create a full-day design thinking workshop for a product team.',
    mode: 'workshop_board',
    assertions: [hasTitleAssertion, atLeastNBlocks(4), allBlocksHaveTitle],
  },
];
