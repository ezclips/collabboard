"use client";

import React, { useState } from 'react';
import { useParams } from 'next/navigation';

/**
 * P6J-F9-C2 -- one authenticated C1 PAGE_REGION crop, shown above the source
 * excerpt/marker. The browser supplies only board id (route params) and
 * reference id (prop); C1 alone resolves document, page, rotation, region and
 * raster, so no crop query string and no Storage authority ever reach here.
 *
 * Reserves a fixed box rather than sizing from the display region's aspect
 * ratio: the card does not have that authority, and computing it here would
 * widen the client contract C1 was built to avoid.
 */

export interface KnowledgeSourceRegionCropProps {
  readonly referenceId: string;
}

export default function KnowledgeSourceRegionCrop({ referenceId }: KnowledgeSourceRegionCropProps) {
  const params = useParams<{ id: string }>();
  const boardId = params?.id;
  // The FAILED URL is remembered, not a bare boolean -- see
  // KnowledgeDocumentPageImage's identical pattern: a changed referenceId (new
  // src) clears a stale failure without an effect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!boardId) return null;

  const src = `/api/boards/${encodeURIComponent(boardId)}/knowledge/references/${encodeURIComponent(referenceId)}/crop`;
  if (failedSrc === src) return null;

  return (
    <div
      data-knowledge-source-region-crop="true"
      className="mt-1.5 h-20 w-full overflow-hidden rounded border border-gray-200 bg-gray-50"
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailedSrc(src)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
