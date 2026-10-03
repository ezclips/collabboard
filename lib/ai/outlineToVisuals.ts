import type {
  ComparisonDiagramData,
  DiagramData,
  FlowDiagramData,
  MindmapDiagramData,
  TimelineDiagramData,
} from './contracts';
import type { MindmapTree } from './mindmapLayout';
import { OUTLINE_LIMITS, parseOutline, type VisualOutline, type VisualOutlineItem } from './outline';
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
 * PATCH-269. A guaranteed-valid companion item, used only while running one tree
 * branch through `parseOutline` (which requires at least two items).
 */
const TREE_ITEM_PAD = '\u0000outline-item-pad';

/**
 * PATCH-269. Runs ONE tree branch through the outline's own item validation, so
 * unknown or invalid fields carried on a tree node are dropped while `value`,
 * `textStyle`, `side`, `icon`, `detail`, `date`, `color` and `children` survive.
 * A branch that has no usable label yields null. The outline's parser needs two
 * items, so a valid pad rides along; a branch it rejects leaves only the pad (or
 * throws) and is dropped. Pure.
 */
function sanitizeTreeBranch(raw: unknown): VisualOutlineItem | null {
  try {
    const parsed = parseOutline({ title: 'Outline', items: [raw, { label: TREE_ITEM_PAD }] });
    const item = parsed.items[0];
    return item && item.label !== TREE_ITEM_PAD ? item : null;
  } catch {
    return null;
  }
}

/**
 * PATCH-243/269. The outline -> tree the mind-map preview edits. Each branch
 * carries EVERY item field (label, children and the rest -- value, textStyle,
 * side, detail, date, icon, colour) so the native tree helpers keep them through
 * renames, additions, removals and reorders, and `outlineFromMindmapTree` can
 * map an edit back without losing anything.
 */
function mindmapTree(outline: VisualOutline): MindmapTree {
  const children = outline.items.slice(0, OUTLINE_LIMITS.items).map((item) => {
    const { label, children: itemChildren, ...rest } = item;
    return {
      ...rest,
      label,
      ...(itemChildren?.length
        ? { children: itemChildren.slice(0, OUTLINE_LIMITS.children).map((child) => ({ label: child.label })) }
        : {}),
    };
  });
  return { label: outline.title, children } as MindmapTree;
}

/**
 * PATCH-243/269. A mind-map tree edit (root -> title, branches -> items, leaves
 * -> children) mapped back to a NEW outline. Each branch's fields travel with
 * its node, then the rebuilt item is passed through the outline's own item
 * validation, so an unknown or invalid field can never reach the outline. A new
 * branch added in the tree has only a label (no value). Pure.
 */
export function outlineFromMindmapTree(outline: VisualOutline, tree: MindmapTree): VisualOutline {
  const items: VisualOutlineItem[] = (tree.children ?? [])
    .slice(0, OUTLINE_LIMITS.items)
    .map((branch) => {
      const { label, ...rest } = branch;
      return sanitizeTreeBranch({ ...rest, label });
    })
    .filter((item): item is VisualOutlineItem => item !== null);
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
