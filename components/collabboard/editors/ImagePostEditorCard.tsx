'use client';

import React from 'react';
import { resolveCaptionStyle } from '@/lib/domain/canvas/captionStyle';
import { contrastIconColor } from '@/components/collabboard/shells/CardShell';
import { isStripVisible } from '@/components/collabboard/canvas/engine/utils';
import { ImageWithLoadingIndicator } from './useDelayedImageLoading';

/**
 * R6I-C1 -- the Image post editor's card, as ONE implementation.
 *
 * This is the composition that makes an Image post editor recognisably an
 * Image post editor: a fixed-width card whose coloured top strip carries the
 * title, with the image as the primary content beneath it. It was inline in
 * FreeformPadletCards' overlay, which meant the only way to show it was to
 * already have a persisted padlet -- so the PDF-area creation flow reached for
 * the clipart draft modal instead and the user got the wrong editor.
 *
 * Extracted rather than copied. Two callers share it:
 *
 *   A. the persisted overlay (FreeformPadletCards), which passes the padlet's
 *      own values and adds its reactions/caption rows as children;
 *   B. the pre-save PDF-area draft (PdfAreaImageDraftModal), which passes a
 *      local draft and no children, because those rows need a real row to
 *      write to.
 *
 * It is deliberately presentation only: it holds no state, performs no
 * persistence, and knows nothing about whether the thing it is drawing exists
 * in the database yet. That is what lets one component serve both.
 */

/** The card's fixed width. Both callers centre it in the same modal geometry. */
export const IMAGE_POST_EDITOR_CARD_WIDTH_PX = 360;

export interface ImagePostEditorCardProps {
  /** The image to show. Already resolved by the caller. */
  readonly imageSrc: string | undefined;
  readonly imageAlt: string;
  readonly title: string;
  readonly onTitleChange: (next: string) => void;
  readonly onTitleFocus?: () => void;
  readonly onTitleBlur?: () => void;
  /** Highlights the title as the current styling target. */
  readonly titleActive?: boolean;
  readonly cardColor?: string;
  readonly topStrip?: string;
  /** Unknown on purpose: resolveCaptionStyle normalises it, exactly as the
   *  persisted overlay always did with the raw metadata value. */
  readonly titleStyle?: unknown;
  readonly titlePlaceholder?: string;
  /** Rows that only make sense once the post exists: reactions, caption. */
  readonly children?: React.ReactNode;
}

export default function ImagePostEditorCard({
  imageSrc,
  imageAlt,
  title,
  onTitleChange,
  onTitleFocus,
  onTitleBlur,
  titleActive = false,
  cardColor,
  topStrip,
  titleStyle,
  titlePlaceholder = 'Title',
  children,
}: ImagePostEditorCardProps) {
  return (
    <div
      className="overflow-hidden flex flex-col border border-gray-200 shadow-2xl"
      style={{ width: `${IMAGE_POST_EDITOR_CARD_WIDTH_PX}px`, backgroundColor: cardColor || '#ffffff', pointerEvents: 'auto' }}
      data-ui="image-post-editor-card"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Top strip -- Title lives inside it, same as the canvas card's own top
          strip (a single coloured bar with the title centred in it), not a
          separate row underneath. Modal-only placeholder: no ghost "Title"
          text is ever written, this is the real editable field. */}
      <div
        className="w-full flex-shrink-0 flex items-center px-2"
        style={{
          minHeight: '28px',
          backgroundColor: isStripVisible(topStrip) ? topStrip : 'rgba(0,0,0,0.04)',
        }}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onFocus={onTitleFocus}
          onBlur={onTitleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          // The press must not reach the backdrop: a first click here that got
          // retargeted would dismiss the editor (R6C).
          onMouseDown={(e) => e.stopPropagation()}
          placeholder={titlePlaceholder}
          data-ui="image-post-editor-title"
          className={`w-full text-sm font-semibold bg-transparent outline-none border-b placeholder:opacity-40 placeholder:font-normal rounded px-1 -mx-1 ${
            titleActive ? 'border-blue-400 bg-blue-50/40' : 'border-transparent focus:border-blue-400'
          }`}
          style={resolveCaptionStyle(
            titleStyle,
            isStripVisible(topStrip) ? contrastIconColor(topStrip as string) : '#374151',
          )}
        />
      </div>

      {/* Image */}
      <div className="relative overflow-hidden bg-gray-50 flex items-center justify-center min-h-[100px]">
        <ImageWithLoadingIndicator
          src={imageSrc}
          alt={imageAlt}
          className="w-full h-auto object-contain max-h-[500px] pointer-events-none select-none"
        />
      </div>

      {children}
    </div>
  );
}
