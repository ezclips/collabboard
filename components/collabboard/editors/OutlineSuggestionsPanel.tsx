'use client';

import React from 'react';

import AIContentRenderer from '@/components/ai/AIContentRenderer';
import InfographicRenderer from '@/components/ai/renderers/InfographicRenderer';
import MindmapTreeRenderer from '@/components/ai/renderers/MindmapTreeRenderer';
import PictureStage, { type PictureStageMode } from '@/components/ai/renderers/PictureStage';
import { isAntvTemplate, type InfographicDiagramData, type MindmapDiagramData } from '@/lib/ai/contracts';
import { antvTemplateLabel, similarTemplates } from '@/lib/ai/antv/catalog';
import type { DesignSuggestion } from '@/lib/ai/infographic/suggest';
import { PICTURE_FAMILY_LABELS, pictureFamily, type PictureFamily } from '@/lib/ai/pictureFamilies';
import type { MindmapTree } from '@/lib/ai/mindmapLayout';
import type { VisualOutline } from '@/lib/ai/outline';
import { outlineFromMindmapTree } from '@/lib/ai/outlineToVisuals';
import { VISUAL_THEMES, type VisualThemeId } from '@/lib/ai/visualThemes';
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
  /** PATCH-238. Colour themes. */
  theme?: VisualThemeId;
  onThemeChange?: (id: VisualThemeId) => void;
  /** PATCH-248. Filter the gallery locally into one picture family (null = all). */
  familyFilter?: PictureFamily | null;
  /** PATCH-248. Human label for the filter line, e.g. "Flowchart". */
  familyLabel?: string | null;
  /** PATCH-248. "Show all" in the filter line is Show options. */
  onShowAll?: () => void;
  /** PATCH-248. Run today's chart generator when a chart family has no designs. */
  onMakeChart?: (subtype: 'pie_chart' | 'bar_chart') => void;
  /** PATCH-248. Which chart subtype button was clicked (labels the make-chart button). */
  makeChartSubtype?: 'pie_chart' | 'bar_chart';
}

const TILE_WIDTH = 160;
// PATCH-236 Addendum 4: render each tile's preview at a fixed natural width and
// scale it DOWN to the tile -- never up, which showed only the giant header.
const NATURAL_WIDTH = 560;
// PATCH-241: at most this many tiles per category before "Show more".
const MAX_PER_CATEGORY = 12;
const ANTV_PREFIX = 'antv:';

/** PATCH-248 Addendum 2. The AntV chart name behind a suggestion key. */
function antvChartName(key: string): string {
  return key.startsWith(ANTV_PREFIX) ? key.slice(ANTV_PREFIX.length) : key;
}

/** A pie/bar/column/line chart needs numbers; a word cloud does not. */
function isNumericChartKey(key: string): boolean {
  const name = antvChartName(key);
  return (
    name.startsWith('chart-pie-') ||
    name.startsWith('chart-bar-') ||
    name.startsWith('chart-column-') ||
    name.startsWith('chart-line-')
  );
}

/**
 * PATCH-248 Addendum 2. The clicked chart type leads the chart family; word
 * clouds always come last.
 */
function chartOrder(key: string, subtype: 'pie_chart' | 'bar_chart'): number {
  const name = antvChartName(key);
  if (name.startsWith('chart-wordcloud')) return 100;
  if (subtype === 'bar_chart') {
    if (name.startsWith('chart-bar-')) return 0;
    if (name.startsWith('chart-column-')) return 1;
    if (name.startsWith('chart-line-')) return 2;
    if (name.startsWith('chart-pie-')) return 3;
    return 4;
  }
  if (name.startsWith('chart-pie-')) return 0;
  if (name.startsWith('chart-bar-')) return 1;
  if (name.startsWith('chart-column-')) return 2;
  if (name.startsWith('chart-line-')) return 3;
  return 4;
}

function ThumbButton({
  option,
  isSelected,
  best,
  envelope,
  onSelect,
  note,
}: {
  option: SuggestionOption;
  isSelected: boolean;
  best: boolean;
  envelope: unknown;
  onSelect: () => void;
  note?: string;
}) {
  // PATCH-236 Addendum 4: a fixed 560px natural render, scaled by tile/560 (≤1).
  const innerW = TILE_WIDTH - 4;
  const scale = innerW / NATURAL_WIDTH;
  const [aspect, setAspect] = React.useState(1);
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
    const el = innerRef.current;
    if (!el) return;
    const measuredW = el.offsetWidth || NATURAL_WIDTH;
    const measuredH = el.offsetHeight || NATURAL_WIDTH;
    if (measuredW > 0 && measuredH > 0) setAspect(measuredH / measuredW);
  }, [envelope, visible]);

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
      <div ref={wrapRef} className="overflow-hidden bg-gray-50/50" style={{ height: tileHeight }}>
        {visible && (
          <div
            ref={innerRef}
            data-ai-thumb-scale={scale}
            style={{ width: `${NATURAL_WIDTH}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <AIContentRenderer content={envelope} />
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
  theme = 'classic',
  onThemeChange,
  familyFilter = null,
  familyLabel = null,
  onShowAll,
  onMakeChart,
  makeChartSubtype = 'pie_chart',
}: OutlineSuggestionsPanelProps) {
  // PATCH-248. The family filter is controlled by the editor's subtype buttons;
  // the panel only shows the matching designs and keeps the selection valid.
  // Addendum 2: within the chart family, the clicked subtype's designs come
  // first (and word clouds last).
  const familyOptions =
    familyFilter === 'chart'
      ? options
          .filter((option) => pictureFamily(option) === 'chart')
          .sort((a, b) => chartOrder(a.key, makeChartSubtype) - chartOrder(b.key, makeChartSubtype))
      : familyFilter
        ? options.filter((option) => pictureFamily(option) === familyFilter)
        : options;
  const visibleOptions = familyOptions;
  const selected = options.find((o) => o.key === selectedKey) ?? null;
  const selectedVisible = Boolean(selected && visibleOptions.some((o) => o.key === selected!.key));
  const effectiveSelected = selectedVisible ? selected : visibleOptions[0] ?? null;
  const effectiveSelectedKey = effectiveSelected?.key ?? null;

  // PATCH-248 Addendum 1. A family with no designs at all shows the note in
  // place of the preview, not an empty dotted stage.
  const familyEmpty = familyFilter === 'chart' && visibleOptions.length === 0;
  // Addendum 2. The note decides by "no numeric chart design", so it also shows
  // ABOVE the word clouds when the text has no numbers.
  const showNoNumbersNote =
    familyFilter === 'chart' && !visibleOptions.some((option) => isNumericChartKey(option.key));

  // Keep the editor's selection in step with what the filtered list shows.
  React.useEffect(() => {
    if (effectiveSelectedKey && effectiveSelectedKey !== selectedKey) onSelect(effectiveSelectedKey);
  }, [effectiveSelectedKey, selectedKey, onSelect]);

  // PATCH-248. A family click opens the list at the top.
  const tilesRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (tilesRef.current) tilesRef.current.scrollTop = 0;
  }, [familyFilter]);

  // PATCH-245. The large preview is zoomable/movable like the Edit window.
  const selectedTemplate =
    effectiveSelected && 'template' in effectiveSelected.envelopeData ? effectiveSelected.envelopeData.template : undefined;
  const previewMode: PictureStageMode =
    selectedTemplate && isAntvTemplate(selectedTemplate) ? 'antv' : 'css';
  // PATCH-240. The selected infographic edits on the picture itself, bound to the
  // same active outline as "Edit text" (no AI call). Every other option keeps the
  // plain preview.
  const selectedData = effectiveSelected
    ? (envelopeFor(effectiveSelected) as { data?: { subtype?: string } } | null)?.data
    : null;
  const editableInfographic: InfographicDiagramData | null =
    outline && onEditOutline && selectedData?.subtype === 'infographic'
      ? (selectedData as InfographicDiagramData)
      : null;
  // PATCH-243. The tree option edits on the large preview too: a tree edit maps
  // back to the outline (no AI call).
  const editableMindmap: MindmapDiagramData | null =
    outline && onEditOutline && selectedData?.subtype === 'mindmap' && (selectedData as MindmapDiagramData).tree
      ? (selectedData as MindmapDiagramData)
      : null;
  const suggested = visibleOptions.slice(0, 4);
  const rest = visibleOptions.slice(4);

  const [editing, setEditing] = React.useState(false);
  const [customizeOpen, setCustomizeOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<'auto' | 'summary' | 'detailed'>('auto');
  const [keepWording, setKeepWording] = React.useState(false);
  const [visualHint, setVisualHint] = React.useState('');
  // PATCH-241. Categories start at 12 tiles; "Show more" reveals the rest.
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  // PATCH-241. "Similar visuals" for the selected AntV design.
  const [similarOpen, setSimilarOpen] = React.useState(false);

  React.useEffect(() => {
    setSimilarOpen(false);
  }, [selectedKey]);

  const selectedAntvName =
    effectiveSelected && effectiveSelected.key.startsWith(ANTV_PREFIX)
      ? effectiveSelected.key.slice(ANTV_PREFIX.length)
      : null;
  const similarPresent = selectedAntvName
    ? similarTemplates(selectedAntvName).filter((name) => options.some((option) => option.key === `${ANTV_PREFIX}${name}`))
    : [];

  const byCategory = new Map<string, SuggestionOption[]>();
  for (const option of rest) {
    const list = byCategory.get(option.category) ?? [];
    list.push(option);
    byCategory.set(option.category, list);
  }

  // PATCH-248 Addendum 2. The no-numbers note, shown in the preview when there
  // are no chart designs at all, or above the word clouds when only those fit.
  const chartNote = (
    <div data-ai-chart-note="true" className="shrink-0 rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-600">
        Your text has no numbers to split into slices. Add some (e.g. &ldquo;Venue 40%, Food 30%&rdquo;) and
        press Generate again, or let the AI estimate them:
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-ai-make-chart={makeChartSubtype === 'bar_chart' ? 'bar' : 'pie'}
          onClick={() => onMakeChart?.(makeChartSubtype)}
          className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
        >
          {makeChartSubtype === 'bar_chart' ? 'Make bar chart' : 'Make pie chart'}
        </button>
      </div>
    </div>
  );

  return (
    <div data-ai-outline-options="true" className="flex h-full w-full flex-col gap-3 overflow-hidden p-4">
      {/* PATCH-236 Addendum 4: the preview is the fixed top part; only the tiles
          area scrolls, so selecting a tile never scrolls the preview away. */}
      {familyEmpty ? (
        chartNote
      ) : (
        <div
          data-ai-outline-preview="true"
          className="min-h-0 shrink-0"
          style={{ height: '55%', maxHeight: '55%' }}
        >
          <PictureStage
            mode={previewMode}
            resetKey={`${effectiveSelectedKey ?? ''}:${theme}`}
            aria-label="Design preview"
            className="h-full"
          >
            {effectiveSelected && (editableInfographic ? (
              <InfographicRenderer data={editableInfographic} edit={{ onChange: onEditOutline! }} />
            ) : editableMindmap ? (
              <MindmapTreeRenderer
                data={editableMindmap}
                edit={{ onChange: (next: MindmapTree) => onEditOutline!(outlineFromMindmapTree(outline!, next)) }}
              />
            ) : (
              <AIContentRenderer content={envelopeFor(effectiveSelected)} />
            ))}
          </PictureStage>
        </div>
      )}

      {/* PATCH-241: same-family AntV designs for the selected one. */}
      {selectedAntvName && similarPresent.length > 0 && (
        <div className="shrink-0">
          <button
            type="button"
            data-ai-similar-toggle="true"
            aria-expanded={similarOpen}
            onClick={() => setSimilarOpen((v) => !v)}
            className="text-xs font-semibold text-purple-600 hover:text-purple-800"
          >
            Similar visuals
          </button>
          {similarOpen && (
            <div data-ai-similar-row="true" className="mt-2 flex flex-wrap gap-2">
              {similarPresent.map((name) => (
                <button
                  key={name}
                  type="button"
                  data-ai-similar-template={name}
                  onClick={() => onSelect(`${ANTV_PREFIX}${name}`)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {antvTemplateLabel(name)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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

      {familyFilter && (
        <div data-ai-family-filter="true" className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
          <span>Showing: {familyLabel ?? PICTURE_FAMILY_LABELS[familyFilter]} designs</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            data-ai-show-all="true"
            onClick={() => onShowAll?.()}
            className="font-semibold text-purple-600 hover:text-purple-800"
          >
            Show all
          </button>
        </div>
      )}

      {!familyEmpty && (
        <div ref={tilesRef} data-ai-outline-tiles="true" className="min-h-0 flex-1 overflow-auto pb-4" style={{ minHeight: 220 }}>
          {showNoNumbersNote && <div className="mb-3">{chartNote}</div>}
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
                note={option.key === 'flow' && theme !== 'classic' ? 'keeps its colours' : undefined}
              />
            ))}
          </div>

          {[...byCategory.entries()].map(([category, designs]) => {
            const expanded = expandedCategories.has(category);
            const shown = expanded ? designs : designs.slice(0, MAX_PER_CATEGORY);
            return (
              <div key={category} className="mt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</div>
                <div className="flex flex-wrap gap-2">
                  {shown.map((option) => (
                    <ThumbButton
                      key={option.key}
                      option={option}
                      best={false}
                      isSelected={effectiveSelectedKey === option.key}
                      envelope={envelopeFor(option)}
                      onSelect={() => onSelect(option.key)}
                      note={option.key === 'flow' && theme !== 'classic' ? 'keeps its colours' : undefined}
                    />
                  ))}
                </div>
                {!expanded && designs.length > MAX_PER_CATEGORY && (
                  <button
                    type="button"
                    data-ai-show-more={category}
                    onClick={() => setExpandedCategories((prev) => new Set(prev).add(category))}
                    className="mt-2 text-xs font-semibold text-purple-600 hover:text-purple-800"
                  >
                    Show more ({designs.length - MAX_PER_CATEGORY})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* PATCH-238: Colours -- local only, re-derives every option with a theme. */}
      {onThemeChange && (
        <div data-ai-colours="true" className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Colours</span>
          {(Object.keys(VISUAL_THEMES) as VisualThemeId[]).map((id) => {
            const swatch = VISUAL_THEMES[id];
            return (
              <button
                key={id}
                type="button"
                data-ai-theme={id}
                aria-label={swatch.name}
                aria-pressed={theme === id}
                title={swatch.name}
                onClick={() => onThemeChange(id)}
                className={`h-5 w-5 rounded-full border ${theme === id ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-300'}`}
                style={{
                  background: `conic-gradient(${swatch.background} 0 33.33%, ${swatch.palette[0].stroke} 33.33% 66.66%, ${swatch.palette[1].stroke} 66.66% 100%)`,
                }}
              />
            );
          })}
        </div>
      )}

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
