'use client';

import React from 'react';
import type { WorkshopBoardData } from '@/lib/ai/contracts';

function WorkshopBoardRenderer({ data }: { data: WorkshopBoardData }) {
  return (
    <div className="h-full w-full overflow-auto rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">{data.title}</h1>
        <div className="grid gap-3">
          {data.blocks.map((block, index) => (
            <div key={`${block.title}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-800">{block.title}</h2>
                {block.durationMinutes && (
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-gray-500">
                    {block.durationMinutes} min
                  </span>
                )}
              </div>
              {block.description && (
                <p className="mt-2 text-sm text-gray-600">{block.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(WorkshopBoardRenderer);
