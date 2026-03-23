'use client';

import React from 'react';
import type { AIContentData } from '@/lib/ai/contracts';

function StructuredLessonBoardRenderer({
  data,
}: {
  data: Extract<AIContentData, { type: 'lesson_board' }>;
}) {
  return (
    <div className="h-full w-full overflow-auto rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900">{data.title}</h1>
          {data.objective && (
            <p className="text-sm text-gray-600">{data.objective}</p>
          )}
        </div>
        <div className="space-y-4">
          {data.sections.map((section, index) => (
            <section key={`${section.title}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">{section.title}</h2>
                {section.durationMinutes && (
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-gray-500">
                    {section.durationMinutes} min
                  </span>
                )}
              </div>
              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {section.bullets.map((bullet, bulletIndex) => (
                    <li key={`${section.title}-${bulletIndex}`}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(StructuredLessonBoardRenderer);
