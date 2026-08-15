"use client";

import React from 'react';
import TextFormattingButtons from '@/components/collabboard/editors/TextFormattingButtons';
import { nextTextAlign, type TextAlignValue } from '@/components/collabboard/editors/textAlignCycle';
import type { CaptionStyle } from '@/lib/domain/canvas/captionStyle';

/**
 * PATCH SECTION-H2 Phase 21-24 -- the Section Heading "Text style" panel.
 *
 * Deliberately NOT the Note/Document Text style popup: that one is built for a
 * rich-text body with heading presets, lists, code blocks and selection-range
 * marks, none of which a single-line board divider has. What IS shared is the
 * part that matters -- the same `TextFormattingButtons` grid every Text style
 * panel in the app renders, here narrowed to the four controls that carry
 * meaning for a heading, and the same `nextTextAlign` cycle its Align button
 * uses everywhere else.
 *
 * Scope is the WHOLE heading string (Phase 22). There is no partial-selection
 * formatting: the value read and written is one `metadata.titleStyle` object,
 * the app's existing generic per-post title styling concept.
 */

export interface SectionHeadingTextStylePanelProps {
  style: Partial<CaptionStyle>;
  onChange: (next: Partial<CaptionStyle>) => void;
}

const BOLD_WEIGHT = '700';

export function isSectionHeadingBold(style: Partial<CaptionStyle> | null | undefined): boolean {
  const weight = style?.fontWeight;
  return weight === BOLD_WEIGHT || weight === 'bold' || weight === 'bolder';
}

export default function SectionHeadingTextStylePanel({
  style,
  onChange,
}: SectionHeadingTextStylePanelProps) {
  const isBold = isSectionHeadingBold(style);
  const isItalic = style?.fontStyle === 'italic';
  const isUnderline = style?.underline === true;
  const align: TextAlignValue = style?.textAlign ?? 'left';

  return (
    <div
      data-section-heading-text-style-panel="true"
      className="w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl"
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Text style
      </div>
      <TextFormattingButtons
        controls={['bold', 'italic', 'underline', 'align']}
        onBold={() => onChange({ ...style, fontWeight: isBold ? 'normal' : BOLD_WEIGHT })}
        onItalic={() => onChange({ ...style, fontStyle: isItalic ? 'normal' : 'italic' })}
        onUnderline={() => onChange({ ...style, underline: !isUnderline })}
        onAlign={() => onChange({ ...style, textAlign: nextTextAlign(align) })}
        isBold={isBold}
        isItalic={isItalic}
        isUnderline={isUnderline}
      />
    </div>
  );
}
