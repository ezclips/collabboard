'use client';

import React from 'react';
import type { TimelineDiagramData } from '@/lib/ai/contracts';

function TimelineDiagramRenderer({ data }: { data: TimelineDiagramData }) {
  return (
    <div className="h-full w-full overflow-auto rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">timeline</div>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{data.title}</h2>
        </div>
        <div className="space-y-4">
          {data.items.map((item, index) => (
            <div key={`${item.title}-${index}`} className="flex gap-3">
              <div className="mt-1 flex flex-col items-center">
                <div className="h-2.5 w-2.5 rounded-full bg-gray-900" />
                {index < data.items.length - 1 && <div className="mt-1 h-full w-px bg-gray-200" />}
              </div>
              <div className="pb-4">
                {item.dateLabel && (
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {item.dateLabel}
                  </div>
                )}
                <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                {item.description && <div className="mt-1 text-sm text-gray-600">{item.description}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(TimelineDiagramRenderer);
