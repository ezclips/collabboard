/**
 * PATCH-234. Pure layout for our own colourful, two-sided mind map. Given the
 * outline's tree (root -> branches -> leaves) it returns absolute SVG geometry:
 * node rects (centred), wrapped text lines, a palette index per node, and the
 * curved links. No DOM, no React.
 */

import { themeById, themeColor, type VisualTheme } from './visualThemes';
import type { VisualColor } from './visualPalette';
import { wrapLabel } from './infographic/text';

export interface MindmapTree {
  label: string;
  children?: Array<{ label: string; children?: Array<{ label: string }> }>;
}

export interface MindmapLayoutNode {
  id: string;
  depth: 0 | 1 | 2;
  /** Centre, in the returned viewBox coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  /** Palette index for branches/leaves; -1 for the neutral root. */
  colorIndex: number;
}

export interface MindmapLayoutLink {
  fromId: string;
  toId: string;
  d: string;
  colorIndex: number;
  depth: 1 | 2;
}

export interface MindmapLayout {
  width: number;
  height: number;
  nodes: MindmapLayoutNode[];
  links: MindmapLayoutLink[];
}

const PAD_X = 12;
const PAD_Y = 8;
const LINE_HEIGHT = 18;
const ROOT_CHAR = 8.4;
const NODE_CHAR = 7.2;
const ROOT_MAX = 200;
const BRANCH_MAX = 170;
const LEAF_MAX = 150;
const GAP_LEAF = 12;
const GAP_BRANCH = 20;
const GAP_LEVEL = 48;
const OUTER_PAD = 16;
const MAX_BRANCHES = 8;
const MAX_LEAVES = 6;

function measure(label: string, charWidth: number, maxWidth: number) {
  const lines = wrapLabel(label, maxWidth, charWidth);
  const textWidth = Math.min(maxWidth, Math.max(...lines.map((line) => line.length)) * charWidth);
  return {
    lines,
    w: Math.ceil(textWidth) + PAD_X * 2,
    h: lines.length * LINE_HEIGHT + PAD_Y * 2,
  };
}

function edgeMidpoint(node: MindmapLayoutNode, side: 'left' | 'right') {
  return { x: side === 'right' ? node.x + node.w / 2 : node.x - node.w / 2, y: node.y };
}

function bezier(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const mid = (from.x + to.x) / 2;
  return `M ${from.x},${from.y} C ${mid},${from.y} ${mid},${to.y} ${to.x},${to.y}`;
}

export function layoutMindmap(tree: MindmapTree): MindmapLayout {
  const root: MindmapLayoutNode = {
    id: 'root',
    depth: 0,
    x: 0,
    y: 0,
    ...measure(tree.label ?? '', ROOT_CHAR, ROOT_MAX),
    colorIndex: -1,
  };

  const branches = (tree.children ?? []).slice(0, MAX_BRANCHES).map((branch, ordinal) => ({
    ordinal,
    node: measure(branch.label ?? '', NODE_CHAR, BRANCH_MAX),
    leaves: (branch.children ?? [])
      .slice(0, MAX_LEAVES)
      .map((leaf) => measure(leaf.label ?? '', NODE_CHAR, LEAF_MAX)),
  }));

  const nodes: MindmapLayoutNode[] = [root];
  const allBranchWidths = branches.map((b) => b.node.w);
  const allLeafWidths = branches.flatMap((b) => b.leaves.map((l) => l.w));
  const maxBranchW = allBranchWidths.length ? Math.max(...allBranchWidths) : 0;
  const maxLeafW = allLeafWidths.length ? Math.max(...allLeafWidths) : 0;

  const rightCount = Math.ceil(branches.length / 2);
  const sides: Array<{ dir: 1 | -1; items: typeof branches }> = [
    { dir: 1, items: branches.slice(0, rightCount) },
    { dir: -1, items: branches.slice(rightCount) },
  ];

  for (const { dir, items } of sides) {
    if (items.length === 0) continue;
    const blockHeights = items.map(({ node, leaves }) => {
      const leavesH = leaves.reduce((sum, leaf) => sum + leaf.h, 0) + GAP_LEAF * Math.max(0, leaves.length - 1);
      return node.h + (leaves.length > 0 ? GAP_LEAF : 0) + leavesH;
    });
    const total = blockHeights.reduce((sum, h) => sum + h, 0) + GAP_BRANCH * Math.max(0, items.length - 1);

    const branchX = dir * (root.w / 2 + GAP_LEVEL + maxBranchW / 2);
    const leafX = dir * (root.w / 2 + GAP_LEVEL + maxBranchW + GAP_LEVEL + maxLeafW / 2);

    let cursorY = -total / 2;
    items.forEach(({ ordinal, node, leaves }, blockIndex) => {
      nodes.push({
        id: `b${ordinal}`,
        depth: 1,
        x: branchX,
        y: cursorY + node.h / 2,
        w: node.w,
        h: node.h,
        lines: node.lines,
        colorIndex: ordinal,
      });

      let leafY = cursorY + node.h + (leaves.length > 0 ? GAP_LEAF : 0);
      leaves.forEach((leaf, leafIndex) => {
        nodes.push({
          id: `b${ordinal}l${leafIndex}`,
          depth: 2,
          x: leafX,
          y: leafY + leaf.h / 2,
          w: leaf.w,
          h: leaf.h,
          lines: leaf.lines,
          colorIndex: ordinal,
        });
        leafY += leaf.h + GAP_LEAF;
      });

      cursorY += blockHeights[blockIndex] + GAP_BRANCH;
    });
  }

  // Shift everything so the drawing starts at (OUTER_PAD, OUTER_PAD).
  const minX = Math.min(...nodes.map((n) => n.x - n.w / 2));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w / 2));
  const minY = Math.min(...nodes.map((n) => n.y - n.h / 2));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h / 2));
  const offsetX = OUTER_PAD - minX;
  const offsetY = OUTER_PAD - minY;
  for (const node of nodes) {
    node.x += offsetX;
    node.y += offsetY;
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const links: MindmapLayoutLink[] = [];
  const rootPlaced = byId.get('root')!;
  for (const branch of branches) {
    const branchNode = byId.get(`b${branch.ordinal}`)!;
    const branchSide: 'left' | 'right' = branchNode.x > rootPlaced.x ? 'right' : 'left';
    links.push({
      fromId: 'root',
      toId: branchNode.id,
      d: bezier(edgeMidpoint(rootPlaced, branchSide), edgeMidpoint(branchNode, branchSide === 'right' ? 'left' : 'right')),
      colorIndex: branch.ordinal,
      depth: 1,
    });
    branch.leaves.forEach((_, leafIndex) => {
      const leafNode = byId.get(`b${branch.ordinal}l${leafIndex}`)!;
      links.push({
        fromId: branchNode.id,
        toId: leafNode.id,
        d: bezier(edgeMidpoint(branchNode, branchSide), edgeMidpoint(leafNode, branchSide === 'right' ? 'left' : 'right')),
        colorIndex: branch.ordinal,
        depth: 2,
      });
    });
  }

  return {
    width: maxX - minX + OUTER_PAD * 2,
    height: maxY - minY + OUTER_PAD * 2,
    nodes,
    links,
  };
}

export function colorForNode(node: MindmapLayoutNode, theme: VisualTheme = themeById()): VisualColor | null {
  return node.colorIndex < 0 ? null : themeColor(theme, node.colorIndex);
}
