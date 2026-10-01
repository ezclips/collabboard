'use client';

import React from 'react';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import { layoutInfographic, type InfographicShape, type InfographicText } from '@/lib/ai/infographic';

/**
 * PATCH-236. Draws an infographic design from its stored outline. Every label is
 * React text (escaped), never innerHTML.
 */
function shapeEl(shape: InfographicShape) {
  const common = {
    fill: shape.fill,
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth ?? 0,
  };
  switch (shape.kind) {
    case 'rect':
      return <rect key={shape.id} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...common} />;
    case 'circle':
      return <circle key={shape.id} cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />;
    case 'polygon':
      return <polygon key={shape.id} points={shape.points} {...common} />;
    case 'path':
    default:
      return <path key={shape.id} d={shape.d} strokeLinecap="round" {...common} />;
  }
}

function textEl(text: InfographicText) {
  const firstLineY = text.y - ((text.lines.length - 1) * 18) / 2;
  return (
    <text
      key={text.id}
      x={text.x}
      y={firstLineY}
      textAnchor={text.anchor}
      fontSize={text.fontSize}
      fontWeight={text.fontWeight}
      fill={text.color}
      fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
    >
      {text.lines.map((line, i) => (
        <tspan key={i} x={text.x} dy={i === 0 ? 0 : 18}>{line}</tspan>
      ))}
    </text>
  );
}

function InfographicRenderer({ data }: { data: InfographicDiagramData }) {
  const layout = layoutInfographic(data.template, data.outline);

  return (
    <div className="h-full w-full overflow-auto rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">infographic</div>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{data.title}</h2>
          {data.explanation && <p className="mt-2 text-sm text-gray-600">{data.explanation}</p>}
        </div>
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          data-infographic-svg={data.template}
          role="img"
          aria-label={data.title}
          style={{ width: '100%', height: 'auto', maxHeight: 520 }}
        >
          {layout.shapes.map(shapeEl)}
          {layout.texts.map(textEl)}
        </svg>
      </div>
    </div>
  );
}

export default React.memo(InfographicRenderer);
