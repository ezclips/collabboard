"use client";

import React, { useEffect, useRef } from 'react';

import { createPdfTextLayer, getPdfDocument } from './knowledgePdfDocumentCache';

/**
 * PATCH-177. An invisible, SELECTABLE pdf.js text layer drawn exactly over the
 * page image, so text can be selected directly on the PDF page.
 *
 * It renders NOTHING the user can see -- the spans are transparent -- and it
 * stores nothing. When the user finishes a selection, the reader matches the
 * selected words in the stored page text and captures the same exact selection
 * the text view captures. A page whose file cannot be loaded, or a scanned page
 * with no text items, simply shows no layer: the reader behaves exactly as it
 * did before this existed.
 */

export interface KnowledgePdfPageTextLayerProps {
  readonly boardId: string;
  readonly documentId: string;
  readonly pageNumber: number;
  readonly rotation: number | null | undefined;
  /** The page IMAGE's content box relative to its wrapper. */
  readonly box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

/** The scoped styles pdf.js's text layer needs. Not a global stylesheet. */
const LAYER_STYLE = `
[data-knowledge-page-text-layer] {
  position: absolute;
  line-height: 1;
  text-align: initial;
  overflow: hidden;
}
[data-knowledge-page-text-layer] span,
[data-knowledge-page-text-layer] br {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0 0;
}
[data-knowledge-page-text-layer] ::selection {
  background: rgba(59, 130, 246, 0.3);
}
/* pdf.js's own rules: line breaks never paint a selection, and the helper it
   appends for smooth selection stays invisible below the text. */
[data-knowledge-page-text-layer] br::selection {
  background: transparent;
}
[data-knowledge-page-text-layer] .endOfContent {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  z-index: -1;
  cursor: default;
  user-select: none;
}
`;

export default function KnowledgePdfPageTextLayer({
  boardId,
  documentId,
  pageNumber,
  rotation,
  box,
}: KnowledgePdfPageTextLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The live pdf.js TextLayer, so a resize can cancel the previous render.
  const layerRef = useRef<{ cancel: () => void } | null>(null);
  // A cancelled or superseded render must not paint; each run owns a token.
  const runRef = useRef(0);

  useEffect(() => {
    if (box.width <= 0 || box.height <= 0) return undefined;
    const container = containerRef.current;
    if (container === null) return undefined;

    const token = ++runRef.current;
    let cancelled = false;

    const render = async () => {
      try {
        const document = await getPdfDocument(boardId, documentId);
        if (cancelled || runRef.current !== token) return;
        const page = await document.getPage(pageNumber);
        if (cancelled || runRef.current !== token) return;

        const rotationValue = typeof rotation === 'number' && Number.isFinite(rotation) ? rotation : 0;
        const base = page.getViewport({ scale: 1, rotation: rotationValue });
        if (base.width <= 0) return;
        const scale = box.width / base.width;
        const viewport = page.getViewport({ scale, rotation: rotationValue });

        const content = await page.getTextContent();
        if (cancelled || runRef.current !== token) return;
        // A scanned page has no text items. Render nothing rather than an empty
        // layer, which keeps the reader's DOM identical to before this feature.
        if (content.items.length === 0) return;

        // A fresh container per render so a resize cannot double up spans.
        container.replaceChildren();
        // pdf.js reads `--scale-factor` from the container to size the
        // transformed spans it generates; it must equal the viewport scale.
        container.style.setProperty('--scale-factor', String(scale));
        const layer = await createPdfTextLayer({ textContentSource: content, container, viewport });
        if (cancelled || runRef.current !== token) return;
        layerRef.current = layer;
        await layer.render();
      } catch {
        // Loading or rendering failed: render nothing. The reader then behaves
        // exactly as it does today, and the user is told nothing.
      }
    };

    void render();
    return () => {
      cancelled = true;
      layerRef.current?.cancel?.();
      layerRef.current = null;
      container.replaceChildren();
    };
  }, [boardId, documentId, pageNumber, rotation, box.left, box.top, box.width, box.height]);

  return (
    <>
      <style>{LAYER_STYLE}</style>
      <div
        ref={containerRef}
        data-knowledge-page-text-layer={pageNumber}
        className="absolute"
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        }}
      />
    </>
  );
}
