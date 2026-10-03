'use client';

import React from 'react';
import type { ComparisonDiagramData } from '@/lib/ai/contracts';
import { themeById, themeColor } from '@/lib/ai/visualThemes';
import DiagramKicker from './DiagramKicker';

function ComparisonDiagramRenderer({ data }: { data: ComparisonDiagramData }) {
  const theme = themeById(data.theme);
  return (
    <div
      data-ai-theme-background={theme.id}
      className="h-full w-full overflow-auto rounded-2xl border border-black/10 p-5 shadow-sm"
      style={{ backgroundColor: theme.background }}
    >
      <div className="space-y-4">
        <div>
          <DiagramKicker value={data.kicker} fallback="comparison" color={theme.muted} />
          <h2 className="mt-1 text-lg font-semibold" style={{ color: theme.title }}>{data.title}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {data.columns.map((column, index) => {
            // PATCH-234: a palette-coloured band per column, index-cycled.
            const color = themeColor(theme, index);
            return (
              <div
                key={`${column.heading}-${index}`}
                data-ai-comparison-column="true"
                className="overflow-hidden rounded-xl border border-gray-200"
                style={{ backgroundColor: color.fill }}
              >
                <div
                  data-ai-comparison-band="true"
                  className="px-4 py-3"
                  style={{
                    borderTopWidth: '4px',
                    borderTopStyle: 'solid',
                    borderTopColor: color.stroke,
                    backgroundColor: color.fill,
                  }}
                >
                  <h3 className="text-sm font-semibold" style={{ color: color.text }}>{column.heading}</h3>
                </div>
                <ul data-ai-comparison-body="true" className="space-y-2 p-4 text-sm" style={{ color: color.detail }}>
                  {column.points.map((point, pointIndex) => (
                    <li key={`${column.heading}-${pointIndex}`} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color.stroke }}
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default React.memo(ComparisonDiagramRenderer);
