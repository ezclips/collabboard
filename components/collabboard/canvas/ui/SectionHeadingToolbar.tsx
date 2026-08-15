"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Palette, Type } from 'lucide-react';
import type { Padlet } from '@/types/collabboard';
import type { CaptionStyle } from '@/lib/domain/canvas/captionStyle';
import {
  SECTION_HEADING_LEVELS,
  computeSectionHeadingToolbarPlacement,
  getSectionHeadingAccentColor,
  getSectionHeadingBackgroundColor,
  getSectionHeadingLevel,
  type SectionHeadingLevel,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import SectionHeadingTextStylePanel from '@/components/collabboard/canvas/ui/SectionHeadingTextStylePanel';
import SectionHeadingAppearancePanel, {
  type SectionHeadingColorTarget,
} from '@/components/collabboard/canvas/ui/SectionHeadingAppearancePanel';

/**
 * PATCH SECTION-H2 Phase 3-5 -- the selected-Section-Heading formatting bar.
 *
 *   [ Text style ] | [ H1 ][ H2 ][ H3 ][ H4 ] | [ Colors ]
 *
 * Screen UI, not world UI (Phase 4). It is `position: fixed` and positioned
 * from the heading's MEASURED client rect, which is what makes it immune to
 * canvas zoom and to signed-world placement in one stroke: at 10% the heading
 * shrinks, the toolbar does not, and a heading at (-4900, -3200) anchors
 * exactly like one at (200, 300). No camera math is defined or duplicated
 * here -- the browser has already applied it to the rect being read.
 *
 * This is the SELECTED-OBJECT toolbar. The global creation toolbar's "Section
 * heading" button (SECTION-H1) is a different thing and is untouched.
 */

/** Estimated size used for the very first paint, before the real one is measured. */
const FALLBACK_TOOLBAR_SIZE = { width: 300, height: 40 };

export interface SectionHeadingToolbarProps {
  padlet: Padlet;
  /** Live element to anchor against -- the canonical `[data-padlet-id]` wrapper. */
  headingElement: HTMLElement | null;
  /** Read-only: re-measure whenever the camera changes. */
  canvasZoom: number;
  onChangeLevel: (padletId: string, level: SectionHeadingLevel) => void;
  onChangeTextStyle: (padletId: string, style: Partial<CaptionStyle>) => void;
  onChangeColor: (padletId: string, target: SectionHeadingColorTarget, color: string) => void;
}

type OpenPanel = 'text' | 'appearance' | null;

export default function SectionHeadingToolbar({
  padlet,
  headingElement,
  canvasZoom,
  onChangeLevel,
  onChangeTextStyle,
  onChangeColor,
}: SectionHeadingToolbarProps) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const level = getSectionHeadingLevel(padlet);
  const titleStyle = ((padlet.metadata as { titleStyle?: Partial<CaptionStyle> } | undefined)?.titleStyle ?? {});
  const textColor = (padlet.metadata as { textColor?: string } | undefined)?.textColor ?? '#1f2937';

  const measure = useCallback(() => {
    if (!headingElement) return;
    const heading = headingElement.getBoundingClientRect();
    const self = rootRef.current?.getBoundingClientRect();
    setPosition(computeSectionHeadingToolbarPlacement({
      heading: { left: heading.left, top: heading.top, width: heading.width, height: heading.height },
      toolbar: {
        width: self?.width || FALLBACK_TOOLBAR_SIZE.width,
        height: self?.height || FALLBACK_TOOLBAR_SIZE.height,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }));
  }, [headingElement]);

  // Re-anchor on every input that can move the heading on screen: its own
  // geometry, the camera scale, and any scrolling ancestor (capture:true is
  // what catches the canvas viewport's scroller, not just the document).
  useLayoutEffect(() => { measure(); }, [
    measure, canvasZoom, padlet.position_x, padlet.position_y, padlet.width, padlet.height, openPanel,
  ]);

  useEffect(() => {
    const onViewportChange = () => measure();
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    return () => {
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [measure]);

  // Phase 32: outside click and Escape both close whichever panel is open.
  useEffect(() => {
    if (!openPanel) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpenPanel(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPanel(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openPanel]);

  // Phase 33: the toolbar is an interaction island. Without this the canvas
  // would treat every button press as a background click and deselect the
  // very heading being formatted.
  const isolate = (event: React.SyntheticEvent) => event.stopPropagation();
  // Keeps the heading's inline text editor focused while formatting (Phase
  // 33-35) -- the same guard the shared Text style popups use.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div
      ref={rootRef}
      data-section-heading-toolbar="true"
      // Phase 43: above canvas/post content, and below the Library drawer
      // (z-[800]), the editor-panel tier (z-[1000]) and the toolbar overflow
      // menu (z-[3001]) -- the ladder those patches established is unchanged.
      className="fixed z-[700] flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? 'visible' : 'hidden',
      }}
      onMouseDown={isolate}
      onClick={isolate}
      onDoubleClick={isolate}
      onPointerDown={isolate}
      onContextMenu={isolate}
    >
      {/* ---- LEFT: Text style trigger + its panel (Phase 21) ---- */}
      <div className="relative">
        <button
          type="button"
          data-section-heading-text-style-trigger="true"
          aria-label="Text style"
          title="Text style"
          aria-expanded={openPanel === 'text'}
          onMouseDown={keepFocus}
          onClick={() => setOpenPanel((current) => (current === 'text' ? null : 'text'))}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            openPanel === 'text' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Type className="h-4 w-4" />
        </button>
        {openPanel === 'text' && (
          // Opens to the LEFT of the toolbar -- the app's established
          // `right-full ... mr-3` side-panel convention.
          <div data-section-heading-panel="text" className="absolute right-full top-0 mr-3">
            <SectionHeadingTextStylePanel
              style={titleStyle}
              onChange={(next) => onChangeTextStyle(padlet.id, next)}
            />
          </div>
        )}
      </div>

      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-gray-200" />

      {/* ---- CENTRE: H1-H4 (Phase 6). Labels only: the canonical type-scale
           map lives in engine/sectionHeading.ts and is consumed by the
           renderer, so no size/weight values are restated here. ---- */}
      <div data-section-heading-levels="true" className="flex items-center gap-0.5">
        {SECTION_HEADING_LEVELS.map((entry) => (
          <button
            key={entry}
            type="button"
            data-section-heading-level={entry}
            aria-label={`Heading ${entry}`}
            aria-pressed={level === entry}
            title={`Heading ${entry}`}
            onMouseDown={keepFocus}
            onClick={() => onChangeLevel(padlet.id, entry)}
            className={`h-8 w-8 rounded-md text-xs font-semibold transition-colors ${
              level === entry
                ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-300'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {`H${entry}`}
          </button>
        ))}
      </div>

      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-gray-200" />

      {/* ---- RIGHT: Appearance trigger + its panel (Phase 25) ---- */}
      <div className="relative">
        <button
          type="button"
          data-section-heading-appearance-trigger="true"
          aria-label="Colors"
          title="Colors"
          aria-expanded={openPanel === 'appearance'}
          onMouseDown={keepFocus}
          onClick={() => setOpenPanel((current) => (current === 'appearance' ? null : 'appearance'))}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            openPanel === 'appearance' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Palette className="h-4 w-4" />
        </button>
        {openPanel === 'appearance' && (
          // Opens to the RIGHT -- an explicit product requirement, so it is
          // NOT flipped for stylistic reasons at desktop widths. The
          // horizontal clamp in computeSectionHeadingToolbarPlacement keeps
          // the whole assembly on screen near an edge.
          <div data-section-heading-panel="appearance" className="absolute left-full top-0 ml-3">
            <SectionHeadingAppearancePanel
              textColor={textColor}
              backgroundColor={getSectionHeadingBackgroundColor(padlet)}
              accentColor={getSectionHeadingAccentColor(padlet)}
              onChange={(target, color) => onChangeColor(padlet.id, target, color)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
