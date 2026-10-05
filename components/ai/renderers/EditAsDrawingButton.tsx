'use client';

import React, { useState } from 'react';
import { PenTool } from 'lucide-react';

import type { PictureScene } from '@/lib/ai/antv/toExcalidraw/scene';
import {
  buildDrawingPostData,
  buildDrawingPostDataFromScene,
  type DrawingPostData,
} from '@/lib/ai/antv/toExcalidraw/drawingPost';

/**
 * PATCH-278 D / PATCH-284. The "Edit as drawing" action shown next to Save in
 * the generator and in the Edit window. It converts the picture the caller hands
 * it into drawing-post data and reports it upward; the caller creates the post.
 *
 * PATCH-284. An AntV picture hands it `getSvg`; a drawn picture hands it
 * `getScene`, so the drawn path never round-trips through the DOM.
 */
export interface EditAsDrawingButtonProps {
  /** The AntV picture to convert; the caller picks the SELECTED layer, never hover. */
  getSvg?: () => SVGSVGElement | null;
  /** The drawn picture's scene, built from the stored data. */
  getScene?: () => PictureScene;
  /** The picture's ground (already computed from `[data-ai-theme-background]`). */
  getBackground: () => string;
  title?: string;
  /** Same gate/reason as the neighbouring Save button. */
  disabledReason?: string;
  onDrawing: (data: DrawingPostData) => void | Promise<void>;
}

/** Normalises a computed CSS colour to `#rrggbb`. */
export function normalizeBackgroundColor(value: string, fallback = '#ffffff'): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(trimmed);
  if (rgb) {
    const hex = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  return fallback;
}

export default function EditAsDrawingButton({
  getSvg,
  getScene,
  getBackground,
  title,
  disabledReason,
  onDrawing,
}: EditAsDrawingButtonProps) {
  const [converting, setConverting] = useState(false);
  const [failed, setFailed] = useState(false);
  const disabled = Boolean(disabledReason) || converting;

  const handleClick = async () => {
    if (disabled) return;
    setFailed(false);
    setConverting(true);
    try {
      const background = normalizeBackgroundColor(getBackground());
      const data = getScene
        ? await buildDrawingPostDataFromScene(getScene(), { background, title })
        : await buildDrawingPostData(getSvg?.() ?? null, { background, title });
      await onDrawing(data);
    } catch {
      // The picture and the modal stay exactly as they are.
      setFailed(true);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        data-ai-edit-as-drawing="true"
        onClick={handleClick}
        disabled={disabled}
        title={disabledReason}
        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
          disabled
            ? 'cursor-not-allowed bg-gray-100 text-gray-400'
            : 'border border-indigo-200 text-indigo-600 hover:bg-indigo-50'
        }`}
      >
        <PenTool className="h-4 w-4" />
        {converting ? 'Converting…' : 'Edit as drawing'}
      </button>
      {failed && (
        <span data-ai-edit-as-drawing-error="true" className="mt-1 text-xs text-red-600">
          This picture could not be turned into a drawing.
        </span>
      )}
    </div>
  );
}
