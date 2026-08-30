"use client";

import React, { useEffect, useState } from 'react';
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
 * The wrapper's aspect is the rectangle in RASTER pixels, not the bare
 * normalised fraction -- a 0.5 x 0.5 region on a portrait page is a portrait
 * crop, never a square one. The raster's own naturalWidth/naturalHeight, read
 * from the SAME <img>'s ordinary onLoad, is the one authority for that.
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
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const display = sourceRegionToDisplayRegion(region, appliedRotation);
  const src = display ? knowledgePageImageUrl(boardId, sourceDocumentId, pageNumber) : null;

  // A different source is a different raster: a page/document swap must never
  // crop with the PRIOR page's dimensions while the new image is still loading.
  useEffect(() => {
    setFailed(false);
    setNatural(null);
  }, [src]);

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

  // Unknown until the raster reports its own size: never a guessed ratio.
  const wrapperAspect = natural
    ? (display.width * natural.width) / (display.height * natural.height)
    : null;
  // Percentages are relative to THIS wrapper, so scaling by 1/display.<dim>
  // always reconstructs the true full-page pixel size regardless of the
  // wrapper's actual rendered size.
  const scaleX = display.width > 0 ? 1 / display.width : 1;
  const scaleY = display.height > 0 ? 1 / display.height : 1;

  return (
    <div
      data-knowledge-source-region-draft-preview="true"
      className="relative mb-2 overflow-hidden rounded border border-gray-200 bg-gray-50"
      style={wrapperAspect === null ? { height: '4rem' } : { aspectRatio: `${wrapperAspect}` }}
    >
      {wrapperAspect === null && (
        <div data-knowledge-source-region-draft-preview-loading="true" className="absolute inset-0" aria-hidden="true" />
      )}
      <img
        src={src!}
        alt=""
        aria-hidden="true"
        draggable={false}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          // A raster that reports no size can never yield a real ratio.
          if (naturalWidth > 0 && naturalHeight > 0) setNatural({ width: naturalWidth, height: naturalHeight });
          else setFailed(true);
        }}
        onError={() => setFailed(true)}
        style={wrapperAspect === null
          ? { position: 'absolute', width: 1, height: 1, opacity: 0 }
          : {
            display: 'block',
            width: `${scaleX * 100}%`,
            height: `${scaleY * 100}%`,
            maxWidth: 'none',
            maxHeight: 'none',
            // -display.x/-display.y land the rectangle's stored top-left
            // corner at the wrapper's origin.
            transform: `translate(${-display.x * 100}%, ${-display.y * 100}%)`,
            transformOrigin: 'top left',
          }}
      />
    </div>
  );
}
