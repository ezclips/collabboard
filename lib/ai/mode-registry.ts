import type { AIMode, DiagramSubtype, AIRendererKey } from './contracts';

export interface BaseModeConfig {
  id: AIMode;
  label: string;
  description: string;
  placeholder: string;
  systemPrompt: string;
  version: 1;
  requiresImages: boolean;
  defaultRenderer?: AIRendererKey;
}

export interface DiagramSubtypeConfig {
  id: DiagramSubtype;
  label: string;
  description: string;
  placeholder: string;
  systemPrompt: string;
  defaultRenderer: AIRendererKey;
}

export interface StandardModeConfig extends BaseModeConfig {
  id: Exclude<AIMode, 'diagram'>;
}

export interface DiagramModeConfig extends BaseModeConfig {
  id: 'diagram';
  subtypes: Record<DiagramSubtype, DiagramSubtypeConfig>;
}

export type ModeConfig = StandardModeConfig | DiagramModeConfig;

export const MODE_REGISTRY: Record<AIMode, ModeConfig> = {
  lesson_board: {
    id: 'lesson_board',
    label: 'Lesson Board',
    description: 'Structured teaching content with sections, bullets, and lesson flow.',
    placeholder: 'Create a 45-minute lesson board about the water cycle for middle school students.',
    systemPrompt: `
You generate structured lesson board content.
Return JSON only. Do not return HTML or markdown.
Focus on clear lesson structure, sections, bullets, and timing where helpful.

Return this exact JSON shape:
{
  "title": "Lesson title here",
  "objective": "What students will learn",
  "sections": [
    {
      "title": "Section name here",
      "bullets": ["Key point one", "Key point two"],
      "durationMinutes": 10
    }
  ]
}

Use 3 to 6 sections. The "title" field on each section is required. "bullets" and "durationMinutes" are optional.
    `.trim(),
    version: 1,
    requiresImages: false,
    defaultRenderer: 'lesson_board',
  },

  diagram: {
    id: 'diagram',
    label: 'Diagram',
    description: 'Structured visual content such as flowcharts, mindmaps, charts, timelines, and comparisons.',
    placeholder: 'Create a visual explanation of how photosynthesis works.',
    systemPrompt: `
You generate structured diagram content.
Return JSON only.
Do not return HTML.
Do not return markdown.
The output must match the requested subtype exactly.
    `.trim(),
    version: 1,
    requiresImages: false,
    defaultRenderer: 'diagram_code',
    subtypes: {
      flowchart: {
        id: 'flowchart',
        label: 'Flowchart',
        description: 'Step-by-step process visualization.',
        placeholder: 'Show the process of plant growth from seed to flower.',
        systemPrompt: `
You generate structured flowchart content.
Return JSON only.
Do not return HTML.
Do not return markdown.
Use Mermaid flowchart syntax in the code field only.
Keep node labels short (under 6 words each).
Do not embed prose or commentary inside node labels.
Do not include any explanation outside the JSON structure.
        `.trim(),
        defaultRenderer: 'diagram_code',
      },

      mindmap: {
        id: 'mindmap',
        label: 'Mindmap',
        description: 'Branching idea map for concepts and categories.',
        placeholder: 'Create a mindmap of the causes of World War I.',
        systemPrompt: `
You generate structured mindmap content.
Return JSON only.
Do not return HTML.
Do not return markdown.
Use Mermaid mindmap syntax in the code field only.
Keep branch labels short (under 5 words each).
Do not embed prose or sentences in branch labels.
Do not include any explanation outside the JSON structure.
        `.trim(),
        defaultRenderer: 'diagram_code',
      },

      pie_chart: {
        id: 'pie_chart',
        label: 'Pie Chart',
        description: 'Part-to-whole chart for proportions.',
        placeholder: 'Show how a school budget is divided across staffing, supplies, transport, and facilities.',
        systemPrompt: `
You generate structured pie chart content.
Return JSON only.
Do not return HTML.
Do not return markdown.
Return numeric data points for a pie chart.
All values in dataPoints must be positive numbers greater than zero.
Return at least 2 data points.
Labels must be concise (1 to 4 words).
Do not return prose explanations outside the JSON structure.
        `.trim(),
        defaultRenderer: 'chart',
      },

      bar_chart: {
        id: 'bar_chart',
        label: 'Bar Chart',
        description: 'Category comparison chart.',
        placeholder: 'Compare monthly sales for January to June.',
        systemPrompt: `
You generate structured bar chart content.
Return JSON only.
Do not return HTML.
Do not return markdown.
Return numeric category data suitable for a bar chart renderer.
All values in dataPoints must be positive numbers greater than zero.
Return at least 2 data points.
Labels must be concise (1 to 4 words).
If xLabel or yLabel would add clarity, include them.
Do not return prose explanations outside the JSON structure.
        `.trim(),
        defaultRenderer: 'chart',
      },

      timeline: {
        id: 'timeline',
        label: 'Timeline',
        description: 'Chronological sequence of events.',
        placeholder: 'Create a timeline of major milestones in space exploration.',
        systemPrompt: `
You generate structured timeline content.
Return JSON only. Do not return HTML or markdown.
Return a clean chronological list of timeline items.

Return this exact JSON shape:
{
  "title": "Timeline title here",
  "items": [
    {
      "title": "Event name here",
      "dateLabel": "Year or date",
      "description": "Short description of the event"
    }
  ]
}

Use 4 to 10 items. The "title" field on each item is required. "dateLabel" and "description" are optional.
        `.trim(),
        defaultRenderer: 'timeline',
      },

      comparison: {
        id: 'comparison',
        label: 'Comparison',
        description: 'Side-by-side comparison of options, ideas, or entities.',
        placeholder: 'Compare renewable and non-renewable energy sources.',
        systemPrompt: `
You generate structured comparison content.
Return JSON only.
Do not return HTML.
Do not return markdown.
Return at least 2 columns.
Each column must have a heading and at least 2 bullet points.
Keep each bullet point concise (under 12 words).
Do not add prose outside the JSON structure.
        `.trim(),
        defaultRenderer: 'comparison',
      },
    },
  },

  photo_card: {
    id: 'photo_card',
    label: 'Photo Card',
    description: 'Image-first content with a short caption and resolved photo.',
    placeholder: 'Create a photo card about alpine villages in Switzerland.',
    systemPrompt: `
You generate structured photo card content.
Return JSON only.
Do not return HTML.
Do not return markdown.
Prefer short, visual, image-first content.
The image.query field must be a short noun phrase (2 to 5 words) suitable for image search, not a full sentence.
The caption should be one short sentence or omitted.
    `.trim(),
    version: 1,
    requiresImages: true,
    defaultRenderer: 'photo',
  },

  workshop_board: {
    id: 'workshop_board',
    label: 'Workshop Board',
    description: 'Facilitated workshop structure with blocks, flow, and activities.',
    placeholder: 'Create a half-day workshop board for onboarding new remote employees.',
    systemPrompt: `
You generate structured workshop board content.
Return JSON only. Do not return HTML or markdown.
Focus on workshop flow, blocks, timing, and practical activities.

Return this exact JSON shape:
{
  "title": "Workshop title here",
  "blocks": [
    {
      "title": "Block name here",
      "description": "What happens in this block",
      "durationMinutes": 15
    }
  ]
}

Use 3 to 8 blocks. The "title" field on each block is required. "description" and "durationMinutes" are optional.
    `.trim(),
    version: 1,
    requiresImages: false,
    defaultRenderer: 'workshop_board',
  },
};

export function getModeConfig(mode: AIMode): ModeConfig {
  return MODE_REGISTRY[mode];
}

export function isDiagramModeConfig(config: ModeConfig): config is DiagramModeConfig {
  return config.id === 'diagram';
}

export function getDiagramSubtypeConfig(subtype: DiagramSubtype): DiagramSubtypeConfig {
  const diagramConfig = getModeConfig('diagram');

  if (!isDiagramModeConfig(diagramConfig)) {
    throw new Error('Diagram mode registry is invalid.');
  }

  return diagramConfig.subtypes[subtype];
}

export function resolvePromptConfig(mode: AIMode, subtype?: DiagramSubtype) {
  const modeConfig = getModeConfig(mode);

  if (mode === 'diagram') {
    if (!subtype) {
      throw new Error('Diagram subtype is required for diagram mode.');
    }

    const subtypeConfig = getDiagramSubtypeConfig(subtype);

    return {
      mode: modeConfig,
      subtype: subtypeConfig,
      systemPrompt: subtypeConfig.systemPrompt,
      renderer: subtypeConfig.defaultRenderer,
    };
  }

  return {
    mode: modeConfig,
    systemPrompt: modeConfig.systemPrompt,
    renderer: modeConfig.defaultRenderer,
  };
}
