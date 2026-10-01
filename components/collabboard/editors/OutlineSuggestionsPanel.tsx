'use client';

import React from 'react';

import AIContentRenderer from '@/components/ai/AIContentRenderer';
import type { DesignSuggestion } from '@/lib/ai/infographic/suggest';
import type { VisualOutline } from '@/lib/ai/outline';
import OutlineTextEditor from './OutlineTextEditor';
/**
 * PATCH-236/237. The Suggestions panel for Show options: one large preview of
 * the selected design, then "Suggested" (the top 4 by fit, the first badged
 * "Best match"), the remaining designs grouped by category, and -- PATCH-237 --
 * a "Customize" section (one new AI call) and an "Edit text" form (local only).
 */

export type SuggestionOption = DesignSuggestion;

interface OutlineSuggestionsPanelProps {
  options: DesignSuggestion[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Builds the renderable envelope for a suggestion (prompt/attribution live in the editor). */
  envelopeFor: (option: DesignSuggestion) => unknown;
  /** PATCH-237. Edit text / Customize / flow direction. */
  outline?: VisualOutline | null;
  onEditOutline?: (next: VisualOutline) => void;
  flowDirection?: 'LR' | 'TD';
  onFlowDirectionChange?: (direction: 'LR' | 'TD') => void;
  onApplyCustomize?: (options: { detail?: 'auto' | 'summary' | 'detailed'; keepWording?: boolean; visualHint?: string }) => void;
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
  outline,
  onEditOutline,
  flowDirection = 'LR',
  onFlowDirectionChange,
  onApplyCustomize,
}: OutlineSuggestionsPanelProps) {
  const selected = options.find((o) => o.key === selectedKey) ?? options[0] ?? null;
  const effectiveSelectedKey = selected?.key ?? null;
  const suggested = options.slice(0, 4);
  const rest = options.slice(4);

  const [editing, setEditing] = React.useState(false);
  const [customizeOpen, setCustomizeOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<'auto' | 'summary' | 'detailed'>('auto');
  const [keepWording, setKeepWording] = React.useState(false);
  const [visualHint, setVisualHint] = React.useState('');

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
        style={{ maxHeight: '55%' }}
      >
        {selected && <AIContentRenderer content={envelopeFor(selected)} />}
      </div>

      {outline && onEditOutline && (
        <div>
          <button
            type="button"
            data-ai-edit-text-toggle="true"
            onClick={() => setEditing((v) => !v)}
            className="text-xs font-semibold text-purple-600 hover:text-purple-800"
          >
            {editing ? 'Done editing' : 'Edit text'}
          </button>
          {editing && <OutlineTextEditor outline={outline} onChange={onEditOutline} />}
        </div>
      )}

      <div data-ai-outline-tiles="true" className="min-h-0 flex-1 overflow-auto" style={{ minHeight: 220 }}>
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

      {/* PATCH-237: Customize -- one new AI call only when Apply is pressed. */}
      <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customize</span>
          {onFlowDirectionChange && (
            <div className="flex items-center gap-1 text-[11px] text-gray-600">
              <span>Flow</span>
              <select
                data-ai-flow-direction="true"
                value={flowDirection}
                onChange={(e) => onFlowDirectionChange(e.target.value as 'LR' | 'TD')}
                className="rounded border border-gray-300 px-1 py-0.5 text-[11px]"
              >
                <option value="LR">Left to right</option>
                <option value="TD">Top to bottom</option>
              </select>
            </div>
          )}
          <button
            type="button"
            data-ai-customize-toggle="true"
            onClick={() => setCustomizeOpen((v) => !v)}
            className="text-xs font-semibold text-purple-600 hover:text-purple-800"
          >
            {customizeOpen ? 'Hide' : 'Customize'}
          </button>
        </div>

        {customizeOpen && (
          <div data-ai-customize="true" className="mt-3 space-y-3">
            <div>
              <div className="mb-1 text-[11px] font-medium text-gray-600">Detail</div>
              <div className="inline-flex rounded-lg border border-gray-300">
                {(['auto', 'summary', 'detailed'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-ai-customize-detail={value}
                    onClick={() => setDetail(value)}
                    className={`px-3 py-1 text-xs capitalize ${detail === value ? 'bg-purple-100 text-purple-700' : 'text-gray-600'}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                data-ai-customize-keep-wording="true"
                checked={keepWording}
                onChange={(e) => setKeepWording(e.target.checked)}
              />
              Keep my wording
            </label>

            <div>
              <div className="mb-1 text-[11px] font-medium text-gray-600">Make it a…</div>
              <input
                type="text"
                data-ai-customize-hint="true"
                value={visualHint}
                maxLength={60}
                placeholder="e.g. pyramid, cycle, timeline"
                onChange={(e) => setVisualHint(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>

            <button
              type="button"
              data-ai-customize-apply="true"
              onClick={() => {
                const options = {
                  detail,
                  ...(keepWording ? { keepWording: true } : {}),
                  ...(visualHint.trim() ? { visualHint: visualHint.trim() } : {}),
                };
                onApplyCustomize?.(options);
              }}
              className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
