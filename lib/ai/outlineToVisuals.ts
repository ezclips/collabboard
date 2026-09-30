import type {
  ComparisonDiagramData,
  DiagramData,
  FlowDiagramData,
  MindmapDiagramData,
  TimelineDiagramData,
} from './contracts';
import type { VisualOutline } from './outline';

/**
 * PATCH-233. Turns one extracted outline into several pictures to choose from,
 * using ONLY the existing stored diagram shapes (so the renderers and the board
 * are unchanged). Pure -- no DOM, no network, no AI.
 */

export interface VisualOption {
  key: string;
  label: string;
  envelopeData: DiagramData;
}

/** Characters Mermaid treats as syntax inside node text. */
const MERMAID_SYNTAX = /[\[\]{}()<>"`|#;]/g;

/**
 * One place where user text becomes Mermaid text: strip Mermaid's syntax
 * characters, collapse whitespace. Callers wrap the result in double quotes
 * where the syntax allows, so user text can never escape into the diagram.
 */
export function mermaidLabel(value: string): string {
  return value.replace(MERMAID_SYNTAX, '').replace(/\s+/g, ' ').trim();
}

function quoted(value: string): string {
  return `"${mermaidLabel(value)}"`;
}

function mindmapCode(outline: VisualOutline): string {
  const lines = ['mindmap', `  root((${quoted(outline.title)}))`];
  outline.items.forEach((item, index) => {
    lines.push(`    i${index}[${quoted(item.label)}]`);
    (item.children ?? []).forEach((child, childIndex) => {
      lines.push(`      i${index}c${childIndex}[${quoted(child.label)}]`);
    });
  });
  return lines.join('\n');
}

function flowchartCode(outline: VisualOutline): string {
  const lines = ['flowchart LR'];
  outline.items.forEach((item, index) => {
    lines.push(`  N${index}[${quoted(item.label)}]`);
  });
  for (let index = 0; index + 1 < outline.items.length; index += 1) {
    lines.push(`  N${index} --> N${index + 1}`);
  }
  return lines.join('\n');
}

function mindmap(outline: VisualOutline): MindmapDiagramData {
  return {
    type: 'diagram',
    subtype: 'mindmap',
    renderer: 'diagram_code',
    title: outline.title,
    code: mindmapCode(outline),
  };
}

function comparison(outline: VisualOutline): ComparisonDiagramData {
  return {
    type: 'diagram',
    subtype: 'comparison',
    renderer: 'comparison',
    title: outline.title,
    columns: outline.items.map((item) => ({
      heading: item.label,
      points: item.children && item.children.length > 0
        ? item.children.map((child) => child.label)
        : [item.detail ?? item.label],
    })),
  };
}

function flow(outline: VisualOutline): FlowDiagramData {
  return {
    type: 'diagram',
    subtype: 'flowchart',
    renderer: 'diagram_code',
    title: outline.title,
    code: flowchartCode(outline),
  };
}

function timeline(outline: VisualOutline): TimelineDiagramData {
  return {
    type: 'diagram',
    subtype: 'timeline',
    renderer: 'timeline',
    title: outline.title,
    items: outline.items.map((item) => ({
      title: item.label,
      description: item.detail,
      dateLabel: item.date,
    })),
  };
}

/**
 * Which pictures an outline can be drawn as, in a fixed order. Mind map is
 * always offered; comparison suits 2-4 points; flow suits an ordered sequence
 * or a short list; timeline needs an order.
 */
export function outlineToVisuals(outline: VisualOutline): VisualOption[] {
  const options: VisualOption[] = [
    { key: 'mindmap', label: 'Mind map', envelopeData: mindmap(outline) },
  ];

  if (outline.items.length >= 2 && outline.items.length <= 4) {
    options.push({ key: 'comparison', label: 'Comparison', envelopeData: comparison(outline) });
  }

  if (outline.ordered || outline.items.length <= 6) {
    options.push({ key: 'flow', label: 'Flow', envelopeData: flow(outline) });
  }

  if (outline.ordered) {
    options.push({ key: 'timeline', label: 'Timeline', envelopeData: timeline(outline) });
  }

  return options;
}
