'use client';

import React from 'react';

import AIContentRenderer from '@/components/ai/AIContentRenderer';
import { DiagramKickerReadOnly } from '@/components/ai/renderers/DiagramKicker';
import PictureStage, { type PictureStageMode } from '@/components/ai/renderers/PictureStage';

/**
 * PATCH-271. The Show-options large preview is two layers:
 *   1. the selected stage -- always mounted while a design is selected, so its
 *      zoom and its element editor's history survive a hover. While a tile is
 *      hovered it is hidden with `visibility` (never `display:none`, never
 *      unmounted) so its size is unchanged and nothing re-fits;
 *   2. the hover stage -- drawn read-only from the hovered design on top while
 *      a tile is hovered, with its own stage and the hovered design's mode.
 */
export interface OutlinePreviewLayersProps {
  selectedMode: PictureStageMode;
  selectedResetKey: string;
  children: React.ReactNode;
  hover?: {
    mode: PictureStageMode;
    resetKey: string;
    content: unknown;
  } | null;
}

export default function OutlinePreviewLayers({
  selectedMode,
  selectedResetKey,
  children,
  hover = null,
}: OutlinePreviewLayersProps) {
  return (
    <>
      <div
        data-ai-preview-selected-layer="true"
        aria-hidden={hover ? true : undefined}
        className="absolute inset-0"
        style={hover ? { visibility: 'hidden' } : undefined}
      >
        <PictureStage
          mode={selectedMode}
          resetKey={selectedResetKey}
          aria-label="Design preview"
          className="h-full"
        >
          {children}
        </PictureStage>
      </div>
      {hover && (
        <div data-ai-preview-hover-layer="true" className="absolute inset-0">
          <PictureStage mode={hover.mode} resetKey={hover.resetKey} className="h-full">
            <DiagramKickerReadOnly>
              <AIContentRenderer content={hover.content} />
            </DiagramKickerReadOnly>
          </PictureStage>
        </div>
      )}
    </>
  );
}
