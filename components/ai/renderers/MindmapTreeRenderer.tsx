'use client';

import React from 'react';

import type { MindmapDiagramData } from '@/lib/ai/contracts';
import { colorForNode, layoutMindmap } from '@/lib/ai/mindmapLayout';
import { themeById, themeColor } from '@/lib/ai/visualThemes';

/**
 * PATCH-234. Our own colourful, two-sided mind map. Drawn from the optional
 * `tree` on a MindmapDiagramData; the Mermaid `code` path (CodeDiagramRenderer)
 * still handles old posts and the plain Mindmap subtype. Every label is React
 * text (escaped), never innerHTML.
 */
function MindmapTreeRenderer({ data }: { data: MindmapDiagramData }) {
  const theme = themeById(data.theme);
  if (!data.tree) {
    return (
      <div
        data-ai-theme-background={theme.id}
        className="h-full w-full overflow-auto rounded-2xl border border-black/10 p-5 shadow-sm"
        style={{ backgroundColor: theme.background }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.muted }}>mindmap</div>
        <h2 className="mt-1 text-lg font-semibold" style={{ color: theme.title }}>{data.title}</h2>
      </div>
    );
  }

  const layout = layoutMindmap(data.tree);

  return (
    <div
      data-ai-theme-background={theme.id}
      className="h-full w-full overflow-auto rounded-2xl border border-black/10 p-5 shadow-sm"
      style={{ backgroundColor: theme.background }}
    >
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.muted }}>mindmap</div>
          <h2 className="mt-1 text-lg font-semibold" style={{ color: theme.title }}>{data.title}</h2>
          {data.explanation && <p className="mt-2 text-sm" style={{ color: theme.text }}>{data.explanation}</p>}
        </div>

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
            const fontSize = isRoot ? 15 : isBranch ? 13 : 12;
            const fontWeight = isRoot ? 700 : isBranch ? 600 : 500;
            const firstLineY = node.y - ((node.lines.length - 1) * 18) / 2 + 5;

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
                  fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
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
      </div>
    </div>
  );
}

export default React.memo(MindmapTreeRenderer);
