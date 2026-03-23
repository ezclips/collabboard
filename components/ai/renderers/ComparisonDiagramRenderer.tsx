'use client';

import React from 'react';
import type { ComparisonDiagramData } from '@/lib/ai/contracts';

function ComparisonDiagramRenderer({ data }: { data: ComparisonDiagramData }) {
  return (
    <div className="h-full w-full overflow-auto rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">comparison</div>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{data.title}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {data.columns.map((column, index) => (
            <div key={`${column.heading}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-800">{column.heading}</h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {column.points.map((point, pointIndex) => (
                  <li key={`${column.heading}-${pointIndex}`}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(ComparisonDiagramRenderer);
