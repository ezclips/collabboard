'use client';

import React from 'react';

import AIContentRenderer from '@/components/ai/AIContentRenderer';
import type { DesignSuggestion } from '@/lib/ai/infographic/suggest';
/**
 * PATCH-236. The Suggestions panel for Show options: one large preview of the
 * selected design, then "Suggested" (the top 4 by fit, the first badged "Best
 * match") and the remaining designs grouped under their category headings.
 * Moved out of AIComponentEditor so the editor passes options + selection only.
 */

export type SuggestionOption = DesignSuggestion;

interface OutlineSuggestionsPanelProps {
  options: DesignSuggestion[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Builds the renderable envelope for a suggestion (prompt/attribution live in the editor). */
  envelopeFor: (option: DesignSuggestion) => unknown;
}

const TILE_WIDTH = 160;
// PATCH-236 Addendum 4: render each tile's preview at a fixed natural width and
// scale it DOWN to the tile -- never up, which showed only the giant header.
const NATURAL_WIDTH = 560;

function ThumbButton({
  option,
  isSelected,
  best,
  envelope,
  onSelect,
}: {
  option: SuggestionOption;
  isSelected: boolean;
  best: boolean;
  envelope: unknown;
  onSelect: () => void;
}) {
  // PATCH-236 Addendum 4: a fixed 560px natural render, scaled by tile/560 (≤1).
  const innerW = TILE_WIDTH - 4;
  const scale = innerW / NATURAL_WIDTH;
  const [aspect, setAspect] = React.useState(1);
  const innerRef = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measuredW = el.offsetWidth || NATURAL_WIDTH;
    const measuredH = el.offsetHeight || NATURAL_WIDTH;
    if (measuredW > 0 && measuredH > 0) setAspect(measuredH / measuredW);
  }, [envelope]);

  const tileHeight = Math.min(120, Math.round(NATURAL_WIDTH * aspect * scale));

  return (
    <button
      type="button"
      data-ai-outline-option={option.key}
      aria-pressed={isSelected}
      onClick={onSelect}
      className={`w-[160px] shrink-0 overflow-hidden rounded-xl border-2 bg-white text-left transition-all ${
        isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="overflow-hidden bg-gray-50/50" style={{ height: tileHeight }}>
        <div
          ref={innerRef}
          data-ai-thumb-scale={scale}
          style={{ width: `${NATURAL_WIDTH}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          <AIContentRenderer content={envelope} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
        <span className="truncate">{option.label}</span>
        {best && (
          <span className="shrink-0 rounded bg-purple-100 px-1 py-0.5 text-[9px] font-semibold text-purple-700">
            Best match
          </span>
        )}
      </div>
    </button>
  );
}

export default function OutlineSuggestionsPanel({
  options,
  selectedKey,
  onSelect,
  envelopeFor,
}: OutlineSuggestionsPanelProps) {
  const selected = options.find((o) => o.key === selectedKey) ?? options[0] ?? null;
  const effectiveSelectedKey = selected?.key ?? null;
  const suggested = options.slice(0, 4);
  const rest = options.slice(4);

  const byCategory = new Map<string, SuggestionOption[]>();
  for (const option of rest) {
    const list = byCategory.get(option.category) ?? [];
    list.push(option);
    byCategory.set(option.category, list);
  }

  return (
    <div data-ai-outline-options="true" className="flex h-full w-full flex-col gap-3 overflow-hidden p-4">
      {/* PATCH-236 Addendum 4: the preview is the fixed top part; only the tiles
          area scrolls, so selecting a tile never scrolls the preview away. */}
      <div
        data-ai-outline-preview="true"
        className="min-h-0 shrink-0 overflow-auto rounded-xl border border-gray-200 bg-white"
        style={{ maxHeight: 460 }}
      >
        {selected && <AIContentRenderer content={envelopeFor(selected)} />}
      </div>

      <div data-ai-outline-tiles="true" className="min-h-0 flex-1 overflow-auto">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Suggested</div>
        <div className="flex flex-wrap gap-2">
          {suggested.map((option, index) => (
            <ThumbButton
              key={option.key}
              option={option}
              best={index === 0}
              isSelected={effectiveSelectedKey === option.key}
              envelope={envelopeFor(option)}
              onSelect={() => onSelect(option.key)}
            />
          ))}
        </div>

        {[...byCategory.entries()].map(([category, designs]) => (
          <div key={category} className="mt-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</div>
            <div className="flex flex-wrap gap-2">
              {designs.map((option) => (
                <ThumbButton
                  key={option.key}
                  option={option}
                  best={false}
                  isSelected={effectiveSelectedKey === option.key}
                  envelope={envelopeFor(option)}
                  onSelect={() => onSelect(option.key)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
