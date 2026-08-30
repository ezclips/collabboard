"use client";

import React, { useState } from 'react';
import { knowledgePageImageUrl } from './KnowledgeDocumentPageImage';
import {
  sourceRegionToDisplayRegion,
  type KnowledgePageRotation,
  type NormalizedPageRegion,
} from '@/lib/domain/knowledge/knowledgePageRegionGeometry';

/**
 * Area Phase 1 -- the ONE transient, pre-save preview of a staged area clip's
 * source rectangle, shown above the ordinary editable Note body.
 *
 * NOT Note content: no TipTap node, no persisted bytes, no Storage write, no
 * new crop route. It reuses the EXISTING authenticated page-image route
 * (auth on every request, same as every other Knowledge image) and crops it
 * with plain CSS -- an oversized `<img>` scaled and translated so the armed
 * rectangle exactly fills this box, using the SAME `sourceRegionToDisplayRegion`
 * geometry the persisted C1/C2 crop and the F9-D arrival overlay both use.
 *
 * Once the Note is saved, this component is never mounted again for it: the
 * EXISTING reference-owned `KnowledgeSourceRegionCrop` renders its permanent
 * crop from the real `source_references` row instead.
 */
export interface KnowledgeSourceRegionDraftPreviewProps {
  readonly boardId: string;
  readonly sourceDocumentId: string;
  readonly pageNumber: number;
  readonly region: NormalizedPageRegion;
  readonly appliedRotation: KnowledgePageRotation;
}

export default function KnowledgeSourceRegionDraftPreview({
  boardId, sourceDocumentId, pageNumber, region, appliedRotation,
}: KnowledgeSourceRegionDraftPreviewProps) {
  const [failed, setFailed] = useState(false);
  const display = sourceRegionToDisplayRegion(region, appliedRotation);

  if (display === null || failed) {
    return (
      <div
        data-knowledge-source-region-draft-preview="true"
        data-knowledge-source-region-draft-preview-unavailable="true"
        className="mb-2 flex h-16 items-center justify-center rounded border border-gray-200 bg-gray-50 text-[11px] text-gray-400"
      >
        Source area preview unavailable
      </div>
    );
  }

  const src = knowledgePageImageUrl(boardId, sourceDocumentId, pageNumber);
  // The full page image, scaled up so the armed rectangle alone fills this
  // box: width/height percentages are relative to THIS wrapper (sized to the
  // rectangle's own aspect ratio below), so scaling by 1/display.<dim> always
  // reconstructs the true full-page pixel size regardless of the wrapper's
  // actual rendered size.
  const scaleX = display.width > 0 ? 1 / display.width : 1;
  const scaleY = display.height > 0 ? 1 / display.height : 1;

  return (
    <div
      data-knowledge-source-region-draft-preview="true"
      className="mb-2 overflow-hidden rounded border border-gray-200 bg-gray-50"
      style={{ aspectRatio: `${display.width} / ${display.height}` }}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={() => setFailed(true)}
        style={{
          display: 'block',
          width: `${scaleX * 100}%`,
          height: `${scaleY * 100}%`,
          maxWidth: 'none',
          maxHeight: 'none',
          // Percentages here are relative to THIS element's own (already
          // scaled-up) box, so -display.x/-display.y directly land the
          // rectangle's stored top-left corner at the wrapper's origin.
          transform: `translate(${-display.x * 100}%, ${-display.y * 100}%)`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
}
