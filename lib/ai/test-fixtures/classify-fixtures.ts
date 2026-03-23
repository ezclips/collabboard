import type { AIMode, DiagramSubtype } from '../contracts';

// -------------------------------------------------------------------------
// Classify fixture types
// -------------------------------------------------------------------------
export interface ClassifyFixture {
  id: string;
  description: string;
  prompt: string;
  expectedMode: AIMode;
  expectedSubtype?: DiagramSubtype;
  // When true, any confidence is acceptable.
  // When false, we assert 'high' confidence is returned.
  allowLowConfidence?: boolean;
}

// -------------------------------------------------------------------------
// Classification benchmark set
//
// Each prompt is chosen to be clearly representative of one mode/subtype.
// Ambiguous prompts are marked with allowLowConfidence: true.
// -------------------------------------------------------------------------
export const CLASSIFY_FIXTURES: ClassifyFixture[] = [

  // Clearly pie_chart: "budget split", proportional language
  {
    id: 'classify_pie_budget',
    description: 'School budget split -> pie_chart',
    prompt: 'Show the budget split for a school across staffing, supplies, and transport.',
    expectedMode: 'diagram',
    expectedSubtype: 'pie_chart',
  },

  // Clearly mindmap: "Map the causes" = branching concept map
  {
    id: 'classify_mindmap_climate',
    description: 'Map causes of climate change -> mindmap',
    prompt: 'Map the causes of climate change in a visual concept diagram.',
    expectedMode: 'diagram',
    expectedSubtype: 'mindmap',
  },

  // Clearly lesson_board: "45-minute lesson"
  {
    id: 'classify_lesson_fractions',
    description: 'Lesson on fractions -> lesson_board',
    prompt: 'Build a 45-minute lesson on fractions for 4th grade students.',
    expectedMode: 'lesson_board',
  },

  // Clearly photo_card: "visual card about"
  {
    id: 'classify_photo_kyoto',
    description: 'Visual card about Kyoto -> photo_card',
    prompt: 'Create a visual card about Kyoto temples with a beautiful photo.',
    expectedMode: 'photo_card',
  },

  // Clearly flowchart: step-by-step process
  {
    id: 'classify_flowchart_login',
    description: 'Login process steps -> flowchart',
    prompt: 'Create a step-by-step diagram of the user login process.',
    expectedMode: 'diagram',
    expectedSubtype: 'flowchart',
  },

  // Clearly bar_chart: comparing categories with numbers
  {
    id: 'classify_bar_monthly_sales',
    description: 'Monthly sales comparison -> bar_chart',
    prompt: 'Compare monthly sales figures for January through June with a chart.',
    expectedMode: 'diagram',
    expectedSubtype: 'bar_chart',
  },

  // Clearly timeline: chronological events
  {
    id: 'classify_timeline_space',
    description: 'Space exploration milestones -> timeline',
    prompt: 'Show the key milestones in space exploration from 1957 to today.',
    expectedMode: 'diagram',
    expectedSubtype: 'timeline',
  },

  // Clearly comparison: side-by-side options
  {
    id: 'classify_comparison_energy',
    description: 'Renewable vs non-renewable -> comparison',
    prompt: 'Compare renewable and non-renewable energy sources side by side.',
    expectedMode: 'diagram',
    expectedSubtype: 'comparison',
  },

  // Clearly workshop_board: facilitated meeting structure
  {
    id: 'classify_workshop_retro',
    description: 'Sprint retrospective -> workshop_board',
    prompt: 'Design a 90-minute sprint retrospective workshop for a software team.',
    expectedMode: 'workshop_board',
  },

  // Ambiguous: could be lesson_board or workshop_board
  {
    id: 'classify_ambiguous_training',
    description: 'Ambiguous training session (lesson_board or workshop_board)',
    prompt: 'Create a training session on React hooks.',
    expectedMode: 'lesson_board',
    allowLowConfidence: true,
  },

  // Ambiguous: could be mindmap or comparison
  {
    id: 'classify_ambiguous_pros_cons',
    description: 'Pros and cons (comparison or mindmap)',
    prompt: 'Show the pros and cons of working remotely.',
    expectedMode: 'diagram',
    expectedSubtype: 'comparison',
    allowLowConfidence: true,
  },

  // Clearly pie_chart: "percentage breakdown"
  {
    id: 'classify_pie_time',
    description: 'Time breakdown -> pie_chart',
    prompt: 'Show what percentage of their day students spend on studying, sports, socializing, and sleep.',
    expectedMode: 'diagram',
    expectedSubtype: 'pie_chart',
  },
];
