'use client';

import React, { useState } from 'react';

import type { MindmapDiagramData } from '@/lib/ai/contracts';
import { colorForNode, effectiveBranchSides, layoutMindmap, type MindmapLayoutNode, type MindmapTree } from '@/lib/ai/mindmapLayout';
import type { VisualSide } from '@/lib/ai/outline';
import { OUTLINE_LIMITS } from '@/lib/ai/outline';
import {
  MAX_BRANCHES,
  MAX_LEAVES,
  MIN_BRANCHES,
  addChild,
  removeNode,
  renameNode,
} from '@/lib/ai/infographic/edit';
import { themeById, themeColor } from '@/lib/ai/visualThemes';
import { themeWithStyle } from '@/lib/ai/visualStyle';
import DiagramKicker from './DiagramKicker';
import PictureEditOverlay, { type ActiveEdit, type EditHandle } from './PictureEditOverlay';

/**
 * PATCH-234. Our own colourful, two-sided mind map. Drawn from the optional
 * `tree` on a MindmapDiagramData; the Mermaid `code` path (CodeDiagramRenderer)
 * still handles old posts and the plain Mindmap subtype. Every label is React
 * text (escaped), never innerHTML.
 *
 * PATCH-240. With an `edit` prop a node's label can be retyped in place, + adds
 * a branch (root) or a leaf (branch), and − removes a branch/leaf.
 */
function pathKey(path: number[]): string {
  return path.length ? path.join('.') : 'root';
}

function parsePathKey(key: string): number[] | null {
  if (key === 'root') return [];
  if (!/^\d+(\.\d+)*$/.test(key)) return null;
  return key.split('.').map(Number);
}

function valueForPath(tree: MindmapTree, path: number[]): string {
  if (path.length === 0) return tree.label;
  const branch = tree.children?.[path[0]];
  if (!branch) return '';
  if (path.length === 1) return branch.label;
  return branch.children?.[path[1]]?.label ?? '';
}

function maxForPath(path: number[]): number {
  return path.length === 0 ? OUTLINE_LIMITS.title : OUTLINE_LIMITS.label;
}

/**
 * PATCH-242. Handles sit fully OUTSIDE their node's box (centre at the box edge
 * plus the handle radius and a 3-unit gap), so no circle covers a word. The +
 * goes on the OUTER edge (where the children grow), the − on the inner edge.
 */
const HANDLE_RADIUS = 9;
const HANDLE_GAP = 3;
const HANDLE_OFFSET = HANDLE_RADIUS + HANDLE_GAP;

function nodeHandles(node: MindmapLayoutNode, tree: MindmapTree, width: number, height: number, onChange: (next: MindmapTree) => void): EditHandle[] {
  const pctX = (x: number) => (width ? (x / width) * 100 : 0);
  const pctY = (y: number) => (height ? (y / height) * 100 : 0);
  const branches = tree.children ?? [];
  const handles: EditHandle[] = [];
  const key = pathKey(node.path);
  const top = pctY(node.y);

  if (node.depth === 0) {
    if (branches.length < MAX_BRANCHES) {
      handles.push({ key: 'add-root-left', kind: 'add', left: pctX(node.x - node.w / 2 - HANDLE_OFFSET), top, target: 'root:left', onActivate: () => onChange(addChild(tree, [], { side: 'left' })) });
      handles.push({ key: 'add-root-right', kind: 'add', left: pctX(node.x + node.w / 2 + HANDLE_OFFSET), top, target: 'root:right', onActivate: () => onChange(addChild(tree, [], { side: 'right' })) });
    }
    return handles;
  }

  const dir: VisualSide = effectiveBranchSides(branches)[node.path[0]] ?? 'right';
  const outerX = dir === 'right' ? node.x + node.w / 2 + HANDLE_OFFSET : node.x - node.w / 2 - HANDLE_OFFSET;
  const innerX = dir === 'right' ? node.x - node.w / 2 - HANDLE_OFFSET : node.x + node.w / 2 + HANDLE_OFFSET;

  if (node.depth === 1) {
    const leaves = branches[node.path[0]]?.children ?? [];
    if (leaves.length < MAX_LEAVES) {
      handles.push({ key: `add-${key}`, kind: 'add', left: pctX(outerX), top, target: key, onActivate: () => onChange(addChild(tree, node.path, { side: dir })) });
    }
    if (branches.length > MIN_BRANCHES) {
      handles.push({ key: `remove-${key}`, kind: 'remove', left: pctX(innerX), top, target: key, onActivate: () => onChange(removeNode(tree, node.path)) });
    }
  }
  if (node.depth === 2) {
    handles.push({ key: `remove-${key}`, kind: 'remove', left: pctX(innerX), top, target: key, onActivate: () => onChange(removeNode(tree, node.path)) });
  }
  return handles;
}

function MindmapTreeRenderer({
  data,
  edit,
  initialEditRef,
}: {
  data: MindmapDiagramData;
  edit?: { onChange: (next: MindmapTree) => void };
  initialEditRef?: string | null;
}) {
  const theme = themeWithStyle(themeById(data.theme), data.style);
  const titleFont = theme.fonts?.title;
  const labelFont = theme.fonts?.label;
  const descFont = theme.fonts?.desc;
  const [editingKey, setEditingKey] = useState<string | null>(edit && initialEditRef ? initialEditRef : null);

  if (!data.tree) {
    return (
      <div
        data-ai-theme-background={theme.id}
        className="h-full w-full overflow-auto rounded-2xl border border-black/10 p-5 shadow-sm"
        style={{ backgroundColor: theme.background }}
      >
        <DiagramKicker value={data.kicker} fallback="mindmap" color={theme.muted} />
        <h2
          className="mt-1 text-lg font-semibold"
          style={{ color: theme.title, ...(titleFont ? { fontFamily: titleFont.family, fontWeight: titleFont.weight } : {}) }}
        >
          {data.title}
        </h2>
      </div>
    );
  }

  const tree = data.tree;
  const layout = layoutMindmap(tree);

  const activePath = edit && editingKey ? parsePathKey(editingKey) : null;
  const activeNode = activePath ? layout.nodes.find((node) => pathKey(node.path) === editingKey) : undefined;
  const activeEdit: ActiveEdit | null = edit && activePath && activeNode
    ? {
        key: editingKey as string,
        value: valueForPath(tree, activePath),
        maxLength: maxForPath(activePath),
        left: ((activeNode.x / layout.width) * 100),
        top: ((activeNode.y / layout.height) * 100),
        onCommit: (value: string) => {
          edit.onChange(renameNode(tree, activePath, value));
          setEditingKey(null);
        },
        onCancel: () => setEditingKey(null),
      }
    : null;

  // PATCH-242: while a rename input is open the +/− circles are hidden (the
  // input can cover a neighbouring handle otherwise); they return on commit.
  const handles = edit && !editingKey
    ? layout.nodes.flatMap((node) => nodeHandles(node, tree, layout.width, layout.height, edit.onChange))
    : [];

  const svg = (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      data-mindmap-svg="true"
      role="img"
      aria-label={data.title}
      style={{ width: '100%', height: 'auto', maxHeight: 520 }}
    >
      {/* Links under the nodes. */}
      {layout.links.map((link, index) => {
        const stroke = themeColor(theme, link.colorIndex).stroke;
        return (
          <path
            key={`link-${index}`}
            d={link.d}
            fill="none"
            stroke={stroke}
            strokeWidth={link.depth === 1 ? 3 : 2}
            strokeLinecap="round"
          />
        );
      })}

      {layout.nodes.map((node) => {
        const color = colorForNode(node, theme);
        const isRoot = node.depth === 0;
        const isBranch = node.depth === 1;
        const fill = isRoot ? theme.centreFill : (color?.fill ?? theme.background);
        const stroke = isRoot ? theme.centreFill : (color?.stroke ?? theme.line);
        const textColor = isRoot ? theme.centreText : (color?.text ?? theme.text);
        const font = isRoot ? titleFont : labelFont;
        const fontSize = isRoot ? 15 : isBranch ? 13 : 12;
        const fontWeight = font?.weight ?? (isRoot ? 700 : isBranch ? 600 : 500);
        const fontFamily = font?.family ?? 'ui-sans-serif, system-ui, -apple-system, sans-serif';
        const firstLineY = node.y - ((node.lines.length - 1) * 18) / 2 + 5;
        const key = pathKey(node.path);

        return (
          <g key={node.id} data-mindmap-node={node.id} data-mindmap-depth={node.depth}>
            <rect
              x={node.x - node.w / 2}
              y={node.y - node.h / 2}
              width={node.w}
              height={node.h}
              rx={10}
              fill={fill}
              stroke={stroke}
              strokeWidth={1.5}
            />
            <text
              x={node.x}
              y={firstLineY}
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight={fontWeight}
              fill={textColor}
              fontFamily={fontFamily}
              data-ai-edit-ref={key}
              style={edit ? { cursor: 'text' } : undefined}
              onClick={edit ? () => setEditingKey(key) : undefined}
            >
              {node.lines.map((line, lineIndex) => (
                <tspan key={lineIndex} x={node.x} dy={lineIndex === 0 ? 0 : 18}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );

  return (
    <div
      data-ai-theme-background={theme.id}
      className="h-full w-full overflow-auto rounded-2xl border border-black/10 p-5 shadow-sm"
      style={{ backgroundColor: theme.background }}
    >
      <div className="space-y-4">
        <div>
          <DiagramKicker value={data.kicker} fallback="mindmap" color={theme.muted} />
          <h2
            className="mt-1 text-lg font-semibold"
            style={{ color: theme.title, ...(titleFont ? { fontFamily: titleFont.family, fontWeight: titleFont.weight } : {}) }}
          >
            {data.title}
          </h2>
          {data.explanation && (
            <p
              className="mt-2 text-sm"
              style={{ color: theme.text, ...(descFont ? { fontFamily: descFont.family, fontWeight: descFont.weight } : {}) }}
            >
              {data.explanation}
            </p>
          )}
        </div>

        {edit ? (
          <div className="group relative w-full">
            {svg}
            <PictureEditOverlay handles={handles} activeEdit={activeEdit} />
          </div>
        ) : (
          svg
        )}
      </div>
    </div>
  );
}

export default React.memo(MindmapTreeRenderer);
