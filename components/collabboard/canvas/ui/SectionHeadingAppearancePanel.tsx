"use client";

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ColorPickerContent } from '@/components/collabboard/ColorPicker';
import { SECTION_HEADING_DEFAULT_ACCENT_COLOR } from '@/components/collabboard/canvas/engine/sectionHeading';

/**
 * PATCH SECTION-H2 Phase 25-31 -- the Section Heading appearance panel.
 *
 * ONE panel with three targets, not three floating palettes: a small segmented
 * switch chooses which part of the heading the picker below is editing. That
 * switch is the same T/H pattern TextStylePopup already uses to flip its own
 * picker between text and highlight, so the interaction is not a new idea.
 *
 * The swatches themselves are `ColorPickerContent` -- the app's existing
 * palette, hex field and opacity slider. No second colour system is defined
 * here, and no palette is copied from anywhere.
 */

export type SectionHeadingColorTarget = 'text' | 'background' | 'accent';

export interface SectionHeadingAppearancePanelProps {
  textColor: string;
  backgroundColor: string;
  accentColor: string;
  onChange: (target: SectionHeadingColorTarget, color: string) => void;
  /**
   * PATCH SECTION-H3B.3 Phase 3 -- closes the panel only. The heading's
   * selection/edit state is owned entirely elsewhere and is never touched
   * here, so closing can never commit, cancel, or deselect anything.
   */
  onClose: () => void;
}

const TARGETS: { id: SectionHeadingColorTarget; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'background', label: 'Background' },
  { id: 'accent', label: 'Accent' },
];

export default function SectionHeadingAppearancePanel({
  textColor,
  backgroundColor,
  accentColor,
  onChange,
  onClose,
}: SectionHeadingAppearancePanelProps) {
  const [target, setTarget] = useState<SectionHeadingColorTarget>('background');

  const current =
    target === 'text' ? textColor
      : target === 'accent' ? (accentColor || SECTION_HEADING_DEFAULT_ACCENT_COLOR)
        : backgroundColor;

  return (
    <div
      data-section-heading-appearance-panel="true"
      className="relative w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl"
    >
      {/* PATCH SECTION-H3B.3 Phase 2/3 -- byte-identical to the existing
          TextStylePopup/image-color-picker close control (FreeformPadletCards.tsx),
          not a new visual language. Rendered inside the toolbar's already
          fully pointer-isolated root (SectionHeadingToolbar.tsx's `isolate`
          on mousedown/click/etc), so no click here can ever reach the canvas
          viewport's blank-space deselect handler -- the same reason the
          H-level and trigger buttons need no stopPropagation of their own. */}
      <button
        type="button"
        // Keeps the heading's inline editor focused while the panel closes
        // (Phase 4) -- the same guard the target-switch buttons below use.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClose}
        className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
        title="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Appearance
      </div>
      <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-0.5">
        {TARGETS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-section-heading-color-target={entry.id}
            aria-pressed={target === entry.id}
            // Keeps the heading's inline editor focused while the user
            // recolours it (Phase 35) -- the same guard every shared style
            // popup in this app uses.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setTarget(entry.id)}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
              target === entry.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div onMouseDown={(event) => {
        if ((event.target as HTMLElement).tagName === 'INPUT') return;
        event.preventDefault();
      }}>
        <ColorPickerContent
          color={current}
          onChange={(color) => onChange(target, color)}
          hasOpacity
          // `transparent` is prepended for background only: a heading with no
          // surface is the SECTION-H1 default and must stay reachable, while
          // an invisible accent stripe or invisible text is not a useful
          // choice to offer.
          presets={target === 'background' ? BACKGROUND_PRESETS : undefined}
        />
      </div>
    </div>
  );
}

/**
 * The shared SIMPLE_PALETTE that ColorPickerContent falls back to on its own,
 * with `transparent` prepended -- exactly the arrangement TextStylePopup
 * already uses for its highlight picker, and the only way to clear a heading
 * surface back to bare canvas.
 */
const BACKGROUND_PRESETS = [
  'transparent', '#ffffff', '#f8f9fa', '#e9ecef', '#868e96', '#212529',
  '#fa5252', '#e64980', '#be4bdb', '#7950f2', '#4c6ef5',
  '#228be6', '#15aabf', '#12b886', '#40c057', '#82c91e',
  '#fab005', '#fd7e14',
];
