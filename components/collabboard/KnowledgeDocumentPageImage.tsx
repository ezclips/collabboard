"use client";

import React, { useState } from 'react';

/**
 * P6J-F9-A2b -- one worker-generated PDF page image, fetched through the
 * authenticated A2a route.
 *
 * The browser never holds Storage authority: this component knows only domain
 * identity (board, document, page) and asks the same-origin app route for the
 * bytes. No bucket, no object key, no signed URL, and no Supabase Storage
 * client ever reaches the client bundle.
 *
 * The image is optional enhancement data layered over the canonical extracted
 * text. Anything that goes wrong -- no derivative was ever rendered, the
 * document predates A1, Storage is unavailable -- must leave the reader's text
 * exactly as it was, so a failure here removes the visual and nothing else.
 */

export interface KnowledgeDocumentPageImageProps {
  readonly boardId: string;
  readonly documentId: string;
  readonly pageNumber: number;
  readonly originalFilename: string;
  readonly widthPoints?: number | null;
  readonly heightPoints?: number | null;
  readonly rotation?: number | null;
  /**
   * Optional: told once when this page has no usable derivative, so a host that
   * shows the image INSTEAD of the text (rather than above it, as the reader
   * does) can fall back to the canonical page text. Purely a notification --
   * this component still removes itself either way, so every existing caller
   * keeps today's behaviour by omitting it.
   */
  readonly onUnavailable?: () => void;
}

/** Reserves pre-load space only. Never page-coordinate authority. */
const FALLBACK_RATIO = { width: 3, height: 4 } as const;

/**
 * Without intrinsic dimensions an <img> occupies zero height until its bytes
 * arrive: every page section collapses, the document fits inside one viewport,
 * and the browser fetches every image at once -- which defeats loading="lazy".
 * A1 rasterises with the page rotation already applied, so a quarter-turn page
 * displays transposed relative to the stored unrotated points.
 */
export function knowledgePageDisplayDimensions(
  widthPoints?: number | null,
  heightPoints?: number | null,
  rotation?: number | null,
): { readonly width: number; readonly height: number } {
  const positive = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (!positive(widthPoints) || !positive(heightPoints)) return FALLBACK_RATIO;
  // Absent means none recorded; a present non-canonical value is uninterpretable.
  const turn = rotation ?? 0;
  if (turn !== 0 && turn !== 90 && turn !== 180 && turn !== 270) return FALLBACK_RATIO;
  const quarter = turn === 90 || turn === 270;
  return {
    width: Math.max(1, Math.round(quarter ? heightPoints : widthPoints)),
    height: Math.max(1, Math.round(quarter ? widthPoints : heightPoints)),
  };
}

/**
 * Both ids are encoded the way every other Knowledge client request encodes
 * them (see KnowledgeSourceReaderDrawer's pages fetch). `pageNumber` is a
 * number and is rendered as a plain decimal; the route re-validates it.
 */
export function knowledgePageImageUrl(
  boardId: string,
  documentId: string,
  pageNumber: number,
): string {
  return `/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}`
    + `/pages/${pageNumber}/image`;
}

export default function KnowledgeDocumentPageImage({
  boardId,
  documentId,
  pageNumber,
  widthPoints,
  heightPoints,
  rotation,
  onUnavailable,
}: KnowledgeDocumentPageImageProps) {
  const src = knowledgePageImageUrl(boardId, documentId, pageNumber);
  const reserved = knowledgePageDisplayDimensions(widthPoints, heightPoints, rotation);
  // The FAILED URL is remembered, not a bare boolean: when the reader switches
  // document or page the src changes, and the stale failure clears itself
  // without an effect. A boolean would survive the identity change and hide a
  // perfectly good image for the newly opened document.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return null;

  return (
    <img
      src={src}
      // Decorative by construction: the canonical page text sits immediately
      // below this element in the same section and is the accessible content.
      // A descriptive alt would make a screen reader announce the page twice,
      // and the "Page {n}" heading above already labels the section.
      alt=""
      aria-hidden="true"
      // Every page section is mounted at once (continuous scroll), so the
      // browser's own viewport heuristic -- not a current-page state machine --
      // is what keeps a 200-page document from fetching 200 images on open.
      loading="lazy"
      decoding="async"
      // The reader suppresses native drags outside the F8 clip chip, and an
      // <img> is natively draggable. Saying so here makes that explicit rather
      // than incidental, so this can never become a second drag source
      // competing with the knowledge-clip payload on the canvas.
      draggable={false}
      // The pre-load ratio reservation that makes loading="lazy" real; these
      // are attributes, not styling, so h-auto still governs the drawn size.
      width={reserved.width}
      height={reserved.height}
      onError={() => { setFailedSrc(src); onUnavailable?.(); }}
      className="mb-2 block h-auto w-full rounded border border-gray-200 bg-gray-50"
    />
  );
}
