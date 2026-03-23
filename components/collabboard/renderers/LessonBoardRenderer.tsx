'use client';

import React from 'react';
import type { LessonBoard, LessonBoardItem } from '@/types/collabboard';

function ItemRow({ item }: { item: LessonBoardItem }) {
  return (
    <div className="text-sm">
      <div className="flex items-baseline gap-2">
        {item.duration && (
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
            {item.duration}
          </span>
        )}
        {item.type === 'task' && (
          <span className="mt-0.5 shrink-0 h-3.5 w-3.5 rounded border border-gray-300 bg-white inline-block" />
        )}
        <p className="text-gray-700 leading-snug">{item.content}</p>
      </div>
      {item.bullets && item.bullets.length > 0 && (
        <ul className="ml-5 mt-1 list-disc space-y-0.5">
          {item.bullets.map((b, i) => (
            <li key={i} className="text-gray-500 text-xs">{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LessonBoardRenderer({ data }: { data: LessonBoard }) {
  return (
    <div className="w-full h-full overflow-auto bg-white font-sans">
      <div className="max-w-2xl mx-auto p-5 space-y-5">
        {/* Hero image */}
        {data.heroImage?.url && (
          <img
            src={data.heroImage.url}
            alt={data.heroImage.query ?? 'Hero image'}
            className="w-full h-44 object-cover rounded-xl"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        {/* Title + description */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{data.title}</h1>
          {data.description && (
            <p className="mt-1 text-sm text-gray-500">{data.description}</p>
          )}
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {data.sections.map((section, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-800 uppercase tracking-wide">
                {section.title}
              </h2>
              <div className="space-y-2.5">
                {section.items.map((item, j) => (
                  <ItemRow key={j} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
