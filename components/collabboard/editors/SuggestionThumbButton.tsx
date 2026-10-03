'use client';

import React from 'react';

import AIContentRenderer from '@/components/ai/AIContentRenderer';
import { DiagramKickerReadOnly } from '@/components/ai/renderers/DiagramKicker';
import type { DesignSuggestion } from '@/lib/ai/infographic/suggest';

/**
 * PATCH-262. Extracted from `OutlineSuggestionsPanel` (which is at the 800-line
 * ceiling) so the panel can gain the Add toolbar icon and side panel. No
 * behaviour changed by the move: the 160px/preview-scaling ThumbButton and the
 * small `PreviewToolButton`.
 */

export type SuggestionOption = DesignSuggestion;

const TILE_WIDTH = 160;
// PATCH-236 Addendum 4: render each tile's preview at a fixed natural width and
// scale it DOWN to the tile -- never up, which showed only the giant header.
const NATURAL_WIDTH = 560;

export function SuggestionThumbButton({
  option,
  isSelected,
  best,
  envelope,
  onSelect,
  onPointerEnter,
  onPointerLeave,
  note,
  fullWidth = false,
}: {
  option: SuggestionOption;
  isSelected: boolean;
  best: boolean;
  envelope: unknown;
  onSelect: () => void;
  /** PATCH-250. Mouse hover previews this design in the large stage. */
  onPointerEnter?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerLeave?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  note?: string;
  /** PATCH-252. `w-full` for the 2-column panel grid instead of a fixed 160px. */
  fullWidth?: boolean;
}) {
  // PATCH-236 Addendum 4: a fixed 560px natural render, scaled by tile/560 (≤1).
  // PATCH-252. A full-width tile measures its own column; a fixed tile keeps 160.
  const [tileWidth, setTileWidth] = React.useState(TILE_WIDTH);
  const innerW = Math.max(1, tileWidth - 4);
  const scale = innerW / NATURAL_WIDTH;
  const [aspect, setAspect] = React.useState(1);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);

  // PATCH-241. The heavy per-tile preview is built only when the tile is on
  // screen. Without IntersectionObserver (tests/SSR) the tile renders at once.
  const [visible, setVisible] = React.useState(() => typeof IntersectionObserver === 'undefined');
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (visible) return;
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  React.useLayoutEffect(() => {
    if (!visible) return;
    if (fullWidth) {
      const width = buttonRef.current?.offsetWidth;
      if (width && width > 0) setTileWidth(width);
    }
    const el = innerRef.current;
    if (!el) return;
    const measuredW = el.offsetWidth || NATURAL_WIDTH;
    const measuredH = el.offsetHeight || NATURAL_WIDTH;
    if (measuredW > 0 && measuredH > 0) setAspect(measuredH / measuredW);
  }, [envelope, visible, fullWidth]);

  const tileHeight = Math.min(120, Math.round(NATURAL_WIDTH * aspect * scale));

  return (
    <button
      ref={buttonRef}
      type="button"
      data-ai-outline-option={option.key}
      aria-pressed={isSelected}
      onClick={onSelect}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={`${fullWidth ? 'w-full' : 'w-[160px] shrink-0'} overflow-hidden rounded-xl border-2 bg-white text-left transition-all ${
        isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div ref={wrapRef} className="overflow-hidden bg-gray-50/50" style={{ height: tileHeight }}>
        {visible && (
          <div
            ref={innerRef}
            data-ai-thumb-scale={scale}
            style={{ width: `${NATURAL_WIDTH}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <DiagramKickerReadOnly>
              <AIContentRenderer content={envelope} />
            </DiagramKickerReadOnly>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t border-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
        <span className="truncate">{option.label}</span>
        {best && (
          <span className="shrink-0 rounded bg-purple-100 px-1 py-0.5 text-[9px] font-semibold text-purple-700">
            Best match
          </span>
        )}
      </div>
      {note && (
        <div data-ai-theme-note="true" className="px-3 pb-1.5 text-[9px] text-gray-500">
          {note}
        </div>
      )}
    </button>
  );
}

/**
 * PATCH-251. One preview toolbar icon: 28x28, with its name as a hint below on
 * hover/focus (CSS only) and as `title`. `aria-pressed` marks the open popover.
 */
export function PreviewToolButton({
  label,
  active,
  onClick,
  dataAi,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dataAi: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      {...{ [dataAi]: 'true' }}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`group relative flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}
