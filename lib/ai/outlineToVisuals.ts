import type {
  ComparisonDiagramData,
  DiagramData,
  FlowDiagramData,
  MindmapDiagramData,
  TimelineDiagramData,
} from './contracts';
import type { MindmapTree } from './mindmapLayout';
import { OUTLINE_LIMITS, type VisualOutline, type VisualOutlineItem, type VisualSide } from './outline';
import { paletteAt } from './visualPalette';

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

/** Rounded Mermaid node text: `N0("label")`. */
function quotedRound(value: string): string {
  return `("${mermaidLabel(value)}")`;
}

/**
 * PATCH-239. The tree -> Mermaid text builder, exported so an editor can
 * regenerate `code` from an edited `tree` and keep the two in sync.
 */
export function mindmapCodeFromTree(tree: MindmapTree): string {
  const lines = ['mindmap', `  root((${quoted(tree.label)}))`];
  (tree.children ?? []).forEach((branch, branchIndex) => {
    lines.push(`    i${branchIndex}[${quoted(branch.label)}]`);
    (branch.children ?? []).forEach((leaf, leafIndex) => {
      lines.push(`      i${branchIndex}c${leafIndex}[${quoted(leaf.label)}]`);
    });
  });
  return lines.join('\n');
}

function mindmapCode(outline: VisualOutline): string {
  return mindmapCodeFromTree(mindmapTree(outline));
}

/** PATCH-239. The editable flow graph: steps and the connections between them. */
export interface FlowGraph {
  direction: 'LR' | 'TD';
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
}

/**
 * PATCH-239. A flow graph -> Mermaid text, with every label neutralised through
 * `mermaidLabel` and the same palette `classDef`s today's Flow option uses.
 */
export function flowCodeFromGraph(graph: FlowGraph): string {
  const lines = [`flowchart ${graph.direction}`];
  graph.nodes.forEach((node) => {
    lines.push(`  ${node.id}${quotedRound(node.label)}`);
  });
  graph.nodes.forEach((_, index) => {
    const color = paletteAt(index);
    lines.push(`  classDef c${index} fill:${color.fill},stroke:${color.stroke},color:${color.text}`);
  });
  graph.edges.forEach((edge) => {
    const label = edge.label ? `|${mermaidLabel(edge.label)}|` : '';
    lines.push(`  ${edge.from} -->${label} ${edge.to}`);
  });
  graph.nodes.forEach((node, index) => {
    lines.push(`  class ${node.id} c${index}`);
  });
  return lines.join('\n');
}

function flowchartCode(outline: VisualOutline, direction: 'LR' | 'TD' = 'LR'): string {
  const items = outline.items.slice(0, 8);
  return flowCodeFromGraph({
    direction,
    nodes: items.map((item, index) => ({ id: `N${index}`, label: item.label })),
    edges: items.slice(0, -1).map((_, index) => ({ from: `N${index}`, to: `N${index + 1}` })),
  });
}

/**
 * PATCH-243. The outline -> tree the mind-map preview edits. Each branch keeps
 * the side (and, as extra fields the tree helper preserves through edits, the
 * detail/date/icon/colour), so `outlineFromMindmapTree` can map an edit back
 * without losing the rest of the item.
 */
function mindmapTree(outline: VisualOutline): MindmapTree {
  const children = outline.items.slice(0, OUTLINE_LIMITS.items).map((item) => ({
    label: item.label,
    ...(item.side ? { side: item.side } : {}),
    ...(item.detail !== undefined ? { detail: item.detail } : {}),
    ...(item.date !== undefined ? { date: item.date } : {}),
    ...(item.icon !== undefined ? { icon: item.icon } : {}),
    ...(item.color !== undefined ? { color: item.color } : {}),
    ...(item.children?.length
      ? { children: item.children.slice(0, OUTLINE_LIMITS.children).map((child) => ({ label: child.label })) }
      : {}),
  }));
  return { label: outline.title, children } as MindmapTree;
}

/**
 * PATCH-243. A mind-map tree edit (root -> title, branches -> items, leaves ->
 * children) mapped back to a NEW outline, carrying each branch's side and any
 * extra fields the tree preserved. Pure.
 */
export function outlineFromMindmapTree(outline: VisualOutline, tree: MindmapTree): VisualOutline {
  const items: VisualOutlineItem[] = (tree.children ?? [])
    .slice(0, OUTLINE_LIMITS.items)
    .map((branch) => {
      const raw = branch as VisualOutlineItem & { side?: VisualSide };
      const item: VisualOutlineItem = { label: raw.label };
      if (raw.detail !== undefined) item.detail = raw.detail;
      if (raw.date !== undefined) item.date = raw.date;
      if (raw.icon !== undefined) item.icon = raw.icon;
      if (raw.color !== undefined) item.color = raw.color;
      if (raw.side === 'left' || raw.side === 'right') item.side = raw.side;
      if (branch.children?.length) {
        item.children = branch.children
          .slice(0, OUTLINE_LIMITS.children)
          .map((child) => ({ label: child.label }));
      }
      return item;
    });
  return { ...outline, title: tree.label, items };
}

function mindmap(outline: VisualOutline): MindmapDiagramData {
  return {
    type: 'diagram',
    subtype: 'mindmap',
    renderer: 'diagram_code',
    title: outline.title,
    code: mindmapCode(outline),
    // PATCH-234: our own renderer draws this; `code` stays for old posts.
    tree: mindmapTree(outline),
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

export function flowCode(outline: VisualOutline, direction: 'LR' | 'TD' = 'LR'): string {
  return flowchartCode(outline, direction);
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
