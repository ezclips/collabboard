'use client';

import React from 'react';
import Image from 'next/image';

import type { PhotoCardData } from '@/lib/ai/contracts';

function PhotoCardRenderer({ data }: { data: PhotoCardData }) {
  return (
    <div className="h-full w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
      <div className="flex h-full flex-col">
        <div className="flex min-h-[180px] items-center justify-center bg-gray-100 p-6 text-center">
          {data.image.url ? (
            <Image
              src={data.image.url}
              alt={data.title}
              width={1200}
              height={675}
              className="max-h-[320px] w-full object-cover"
            />
          ) : (
            <div>
              <div className="text-sm font-medium text-gray-700">{data.title}</div>
              <div className="mt-1 text-xs text-gray-500">Image query: {data.image.query}</div>
            </div>
          )}
        </div>
        <div className="space-y-2 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">photo card</div>
          <h2 className="mt-0.5 text-lg font-semibold text-gray-900">{data.title}</h2>
          <p className="text-xs uppercase tracking-wide text-gray-400">{data.image.query}</p>
          {data.caption && <p className="text-sm text-gray-700">{data.caption}</p>}
        </div>
      </div>
    </div>
  );
}

export default React.memo(PhotoCardRenderer);
