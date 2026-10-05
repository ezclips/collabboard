'use client';

import React from 'react';

import type { DrawnDiagramData } from '@/lib/ai/contracts';
import { sceneFromStored } from '@/lib/ai/drawn/stored';
import { sceneToSvg } from '@/lib/ai/drawn/toSvg';
import { trackAIRenderFallback } from '@/lib/ai/telemetry';

import UnsupportedAIContent from './UnsupportedAIContent';

/**
 * PATCH-284. Renders an AI-drawn picture. `sceneToSvg` escapes every text run and
 * only emits `data:image/svg+xml` hrefs it built itself, so injecting the string
 * is safe; a malformed picture falls back to the unsupported message.
 */
function DrawnPictureRenderer({ data }: { data: DrawnDiagramData }) {
  let svg: string | null = null;
  try {
    svg = sceneToSvg(sceneFromStored(data));
  } catch {
    svg = null;
  }

  if (!svg) {
    trackAIRenderFallback({ renderer: 'drawn', subtype: 'drawn', reason: 'invalid_picture' });
    return <UnsupportedAIContent message="This drawn picture could not be displayed." />;
  }

  return (
    <div
      data-ai-drawn="true"
      className="w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      style={{ aspectRatio: `${data.picture.width} / ${data.picture.height}` }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default React.memo(DrawnPictureRenderer);
