'use client';

import React from 'react';
import type { ComparisonDiagramData } from '@/lib/ai/contracts';
import { paletteAt } from '@/lib/ai/visualPalette';

function ComparisonDiagramRenderer({ data }: { data: ComparisonDiagramData }) {
  return (
    <div className="h-full w-full overflow-auto rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">comparison</div>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{data.title}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {data.columns.map((column, index) => {
            // PATCH-234: a palette-coloured band per column, index-cycled.
            const color = paletteAt(index);
            return (
              <div
                key={`${column.heading}-${index}`}
                data-ai-comparison-column="true"
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
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
                <ul className="space-y-2 p-4 text-sm text-gray-700">
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
