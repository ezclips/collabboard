import type { AIMode, DiagramSubtype, StoredAIContent } from '../contracts';
import type { FailureCategory } from '../golden-prompts';

// -------------------------------------------------------------------------
// Conversion fixture types
// -------------------------------------------------------------------------
export interface ConversionAssertion {
  description: string;
  failureCategory: FailureCategory;
  check: (data: unknown) => boolean;
}

export interface ConversionFixture {
  id: string;
  description: string;
  sourceEnvelope: StoredAIContent;
  targetMode: AIMode;
  targetSubtype?: DiagramSubtype;
  assertions: ConversionAssertion[];
}

// -------------------------------------------------------------------------
// Assertion helpers (local)
// -------------------------------------------------------------------------
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
// Source envelopes
// -------------------------------------------------------------------------
const FLOWCHART_SOURCE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'flowchart',
    title: 'User Login Process',
    renderer: 'diagram_code',
    code: [
      'flowchart TD',
      '  A[Start] --> B{User logged in?}',
      '  B -- Yes --> C[Show Dashboard]',
      '  B -- No --> D[Show Login Form]',
      '  D --> E[Submit Credentials]',
      '  E --> F{Valid?}',
      '  F -- Yes --> C',
      '  F -- No --> G[Show Error]',
      '  G --> D',
    ].join('\n'),
  },
  meta: {
    renderer: 'diagram_code',
    subtype: 'flowchart',
    prompt: 'Show the user login process with validation.',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

const MINDMAP_SOURCE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'mindmap',
    title: 'Web Development Skills',
    renderer: 'diagram_code',
    code: [
      'mindmap',
      '  root((Web Dev))',
      '    Frontend',
      '      HTML',
      '      CSS',
      '      JavaScript',
      '    Backend',
      '      Node.js',
      '      Databases',
      '    DevOps',
      '      CI/CD',
      '      Cloud',
    ].join('\n'),
  },
  meta: {
    renderer: 'diagram_code',
    subtype: 'mindmap',
    prompt: 'Create a mindmap of web development skills.',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

const PIE_CHART_SOURCE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'pie_chart',
    title: 'School Budget Distribution',
    renderer: 'chart',
    dataPoints: [
      { label: 'Staffing', value: 60 },
      { label: 'Supplies', value: 20 },
      { label: 'Transport', value: 10 },
      { label: 'Facilities', value: 10 },
    ],
  },
  meta: {
    renderer: 'chart',
    subtype: 'pie_chart',
    prompt: 'Show how a school budget is divided.',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

const BAR_CHART_SOURCE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'bar_chart',
    title: 'Monthly Website Visitors',
    renderer: 'chart',
    dataPoints: [
      { label: 'Jan', value: 1200 },
      { label: 'Feb', value: 1800 },
      { label: 'Mar', value: 2200 },
      { label: 'Apr', value: 1900 },
      { label: 'May', value: 2500 },
      { label: 'Jun', value: 2100 },
    ],
    xLabel: 'Month',
    yLabel: 'Visitors',
  },
  meta: {
    renderer: 'chart',
    subtype: 'bar_chart',
    prompt: 'Show monthly website visitors for Jan-Jun.',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

// -------------------------------------------------------------------------
// Conversion fixtures
// -------------------------------------------------------------------------
export const CONVERSION_FIXTURES: ConversionFixture[] = [
  {
    id: 'flowchart_to_mindmap',
    description: 'Convert flowchart (login process) to mindmap',
    sourceEnvelope: FLOWCHART_SOURCE,
    targetMode: 'diagram',
    targetSubtype: 'mindmap',
    assertions: [
      {
        description: 'result subtype is mindmap',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).subtype === 'mindmap',
      },
      {
        description: 'result type is diagram',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).type === 'diagram',
      },
      {
        description: 'result renderer is diagram_code',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).renderer === 'diagram_code',
      },
      {
        description: 'code field is non-empty',
        failureCategory: 'empty_required_field',
        check: (d) => nonEmptyString(rec(d).code) && (rec(d).code as string).length > 10,
      },
      {
        description: 'title is non-empty',
        failureCategory: 'empty_required_field',
        check: (d) => nonEmptyString(rec(d).title),
      },
    ],
  },

  {
    id: 'mindmap_to_flowchart',
    description: 'Convert mindmap (web dev skills) to flowchart',
    sourceEnvelope: MINDMAP_SOURCE,
    targetMode: 'diagram',
    targetSubtype: 'flowchart',
    assertions: [
      {
        description: 'result subtype is flowchart',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).subtype === 'flowchart',
      },
      {
        description: 'result type is diagram',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).type === 'diagram',
      },
      {
        description: 'result renderer is diagram_code',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).renderer === 'diagram_code',
      },
      {
        description: 'code field is non-empty',
        failureCategory: 'empty_required_field',
        check: (d) => nonEmptyString(rec(d).code) && (rec(d).code as string).length > 10,
      },
    ],
  },

  {
    id: 'pie_chart_to_bar_chart',
    description: 'Convert pie chart (school budget) to bar chart',
    sourceEnvelope: PIE_CHART_SOURCE,
    targetMode: 'diagram',
    targetSubtype: 'bar_chart',
    assertions: [
      {
        description: 'result subtype is bar_chart',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).subtype === 'bar_chart',
      },
      {
        description: 'result type is diagram',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).type === 'diagram',
      },
      {
        description: 'result renderer is chart',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).renderer === 'chart',
      },
      {
        description: 'at least 2 dataPoints',
        failureCategory: 'empty_required_field',
        check: (d) => arr(rec(d).dataPoints).length >= 2,
      },
      {
        description: 'all dataPoint values are positive',
        failureCategory: 'schema_validation_failure',
        check: (d) =>
          arr(rec(d).dataPoints).length > 0 &&
          arr(rec(d).dataPoints).every((p) => positiveNumber(rec(p).value)),
      },
      {
        description: 'preserves at least 2 data points from source',
        failureCategory: 'conversion_mismatch',
        check: (d) => arr(rec(d).dataPoints).length >= 2,
      },
    ],
  },

  {
    id: 'bar_chart_to_pie_chart',
    description: 'Convert bar chart (monthly visitors) to pie chart',
    sourceEnvelope: BAR_CHART_SOURCE,
    targetMode: 'diagram',
    targetSubtype: 'pie_chart',
    assertions: [
      {
        description: 'result subtype is pie_chart',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).subtype === 'pie_chart',
      },
      {
        description: 'result type is diagram',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).type === 'diagram',
      },
      {
        description: 'result renderer is chart',
        failureCategory: 'conversion_mismatch',
        check: (d) => rec(d).renderer === 'chart',
      },
      {
        description: 'at least 2 dataPoints',
        failureCategory: 'empty_required_field',
        check: (d) => arr(rec(d).dataPoints).length >= 2,
      },
      {
        description: 'all dataPoint values are positive',
        failureCategory: 'schema_validation_failure',
        check: (d) =>
          arr(rec(d).dataPoints).length > 0 &&
          arr(rec(d).dataPoints).every((p) => positiveNumber(rec(p).value)),
      },
    ],
  },
];
