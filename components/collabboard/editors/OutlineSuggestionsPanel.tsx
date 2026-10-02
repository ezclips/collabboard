'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid, Palette, Pencil, Shapes, SlidersHorizontal, X } from 'lucide-react';

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
import type { VisualStyle } from '@/lib/ai/visualStyle';
import { type VisualThemeId } from '@/lib/ai/visualThemes';
import ColoursFontsPanel from './ColoursFontsPanel';
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
  /** PATCH-253. Background / element / font overrides, saved with the picture. */
  visualStyle?: VisualStyle;
  onVisualStyleChange?: (style: VisualStyle | undefined) => void;
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
  /** PATCH-254. An outline request is running: the Designs panel opens, shows 8
   *  skeleton tiles when there are no designs yet, and dims the existing designs
   *  (a regenerate) instead of replacing them. */
  loading?: boolean;
  /** PATCH-252. When given, the side panel portals into this docked host; when
   *  absent (unit tests, other callers) it renders inline as a right column. */
  sidePanelHost?: HTMLElement | null;
  /** PATCH-252. The editor sizes its modal from this open/closed notification. */
  onSidePanelChange?: (open: boolean) => void;
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

/**
 * PATCH-251. One preview toolbar icon: 28x28, with its name as a hint below on
 * hover/focus (CSS only) and as `title`. `aria-pressed` marks the open popover.
 */
function PreviewToolButton({
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

// PATCH-252. One docked side panel; exactly one of these is open at a time.
type SidePanelId = 'designs' | 'edit' | 'similar' | 'colours' | 'customize';

const SIDE_PANEL_TITLES: Record<SidePanelId, string> = {
  designs: 'Designs',
  edit: 'Edit text',
  similar: 'Similar visuals',
  colours: 'Colours & Fonts',
  customize: 'Customize',
};

const SIDE_PANEL_ICONS: Record<SidePanelId, React.ReactNode> = {
  designs: <LayoutGrid size={16} aria-hidden="true" />,
  edit: <Pencil size={16} aria-hidden="true" />,
  similar: <Shapes size={16} aria-hidden="true" />,
  colours: <Palette size={16} aria-hidden="true" />,
  customize: <SlidersHorizontal size={16} aria-hidden="true" />,
};

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
  visualStyle,
  onVisualStyleChange,
  familyFilter = null,
  familyLabel = null,
  onShowAll,
  onMakeChart,
  makeChartSubtype = 'pie_chart',
  loading = false,
  sidePanelHost = null,
  onSidePanelChange,
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

  // PATCH-250. A mouse hover (held 120 ms so a sweep does not redraw each tile)
  // previews a design read-only. Touch/pen never hover; leaving is immediate.
  const [hoverKey, setHoverKey] = React.useState<string | null>(null);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHover = () => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverKey(null);
  };

  const startHover = (key: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse') return;
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      setHoverKey(key);
    }, 120);
  };

  // PATCH-250. Clean up the delay timer on unmount and when the list changes.
  React.useEffect(() => {
    setHoverKey(null);
    return () => {
      if (hoverTimerRef.current !== null) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, [options, familyFilter]);

  const hoverOption = hoverKey ? (visibleOptions.find((option) => option.key === hoverKey) ?? null) : null;
  const previewOption = hoverOption ?? effectiveSelected;
  const previewKey = previewOption?.key ?? null;
  // PATCH-252. "≈ Estimated" only makes sense on a numeric chart, and only when
  // the outline's numbers were estimated -- not on a Flow or an unflagged one.
  const showEstimated = Boolean(outline?.valuesEstimated && previewOption && isNumericChartKey(previewOption.key));

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

  // PATCH-252. The docked panel is open on Designs by default (the editor
  // unmounts the panel while loading, so a new Generate reopens it; a theme
  // change or local re-rank leaves a user-closed panel closed).
  const [panel, setPanel] = React.useState<SidePanelId | null>(() => (options.length > 0 || loading ? 'designs' : null));
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = React.useState<'auto' | 'summary' | 'detailed'>('auto');
  const [keepWording, setKeepWording] = React.useState(false);
  const [visualHint, setVisualHint] = React.useState('');
  // PATCH-241. Categories start at 12 tiles; "Show more" reveals the rest.
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());

  const selectedAntvName =
    effectiveSelected && effectiveSelected.key.startsWith(ANTV_PREFIX)
      ? effectiveSelected.key.slice(ANTV_PREFIX.length)
      : null;
  const similarPresent = selectedAntvName
    ? similarTemplates(selectedAntvName).filter((name) => options.some((option) => option.key === `${ANTV_PREFIX}${name}`))
    : [];

  const togglePanel = (id: SidePanelId) =>
    setPanel((current) => (current === id ? null : id));
  const closePanel = () => setPanel(null);

  // PATCH-252. Report the open/closed state so the editor can size its modal.
  React.useEffect(() => {
    onSidePanelChange?.(panel !== null);
  }, [panel, onSidePanelChange]);

  // PATCH-254. A running outline request opens Designs, where the skeleton (or
  // the dimmed existing designs) lives.
  React.useEffect(() => {
    if (loading) setPanel('designs');
  }, [loading]);

  // PATCH-252. Close a panel whose icon is no longer there.
  React.useEffect(() => {
    setPanel((current) => {
      if (current === 'edit' && !(outline && onEditOutline)) return null;
      if (current === 'similar' && similarPresent.length === 0) return null;
      if (current === 'colours' && !onThemeChange) return null;
      return current;
    });
  }, [outline, onEditOutline, onThemeChange, similarPresent.length]);

  // PATCH-252. Escape closes the docked panel; an outside pointerdown does not.
  React.useEffect(() => {
    if (!panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [panel]);

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

  // PATCH-252. The family filter chip lives in the Designs panel header.
  const familyChip = familyFilter ? (
    <div
      data-ai-family-filter="true"
      className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 py-0.5 pl-2 pr-1 text-[11px] font-medium text-gray-700"
    >
      <span>{familyLabel ?? PICTURE_FAMILY_LABELS[familyFilter]}</span>
      <button
        type="button"
        data-ai-show-all="true"
        aria-label="Show all designs"
        title="Show all designs"
        onClick={() => onShowAll?.()}
        className="group relative flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700"
      >
        <X size={12} aria-hidden="true" />
        <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Show all designs
        </span>
      </button>
    </div>
  ) : null;

  // PATCH-252. The designs are a 2-column grid that fills the panel width.
  const tilesFor = (list: SuggestionOption[], bestFirst: boolean) => (
    <div className="grid grid-cols-2 gap-2">
      {list.map((option, index) => (
        <ThumbButton
          key={option.key}
          option={option}
          best={bestFirst && index === 0}
          fullWidth
          isSelected={effectiveSelectedKey === option.key}
          envelope={envelopeFor(option)}
          onSelect={() => { clearHover(); onSelect(option.key); }}
          onPointerEnter={startHover(option.key)}
          onPointerLeave={clearHover}
          note={option.key === 'flow' && theme !== 'classic' ? 'keeps its colours' : undefined}
        />
      ))}
    </div>
  );

  // PATCH-252. One docked panel; the designs list is the scrolling tiles area.
  // Portalled into the host the panel fills it absolutely (the host is only as
  // tall as the row); inline it is a normal flex child bounded by min-h-0. In
  // both cases the root is a flex column whose body is height-bounded so it can
  // scroll instead of growing the column with its content.
  const sidePanel = panel ? (
    <section
      data-ai-side-panel={panel}
      className={`flex w-full flex-col bg-white ${sidePanelHost ? 'absolute inset-0' : 'h-full min-h-0'}`}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-gray-200 px-3">
        <span className="text-gray-500">{SIDE_PANEL_ICONS[panel]}</span>
        <span className="text-sm font-semibold text-gray-700">{SIDE_PANEL_TITLES[panel]}</span>
        {panel === 'designs' && familyChip}
        <button
          type="button"
          data-ai-side-panel-close="true"
          aria-label="Close panel"
          title="Close panel"
          onClick={closePanel}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {panel === 'designs' ? (
        <div
          ref={tilesRef}
          data-ai-outline-tiles="true"
          className={`min-h-0 flex-1 overflow-y-auto p-4 pb-4 ${loading && options.length > 0 ? 'pointer-events-none opacity-50' : ''}`}
          style={{ minHeight: 220 }}
        >
          {loading && options.length === 0 ? (
            <div data-ai-designs-skeleton="true" aria-hidden="true" className="grid grid-cols-2 gap-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-[104px] rounded-xl bg-gray-100 animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          ) : (
            <>
              {showNoNumbersNote && <div className="mb-3">{chartNote}</div>}
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Suggested</div>
              {tilesFor(suggested, true)}

              {[...byCategory.entries()].map(([category, designs]) => {
                const expanded = expandedCategories.has(category);
                const shown = expanded ? designs : designs.slice(0, MAX_PER_CATEGORY);
                return (
                  <div key={category} className="mt-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</div>
                    {tilesFor(shown, false)}
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
            </>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {panel === 'edit' && outline && onEditOutline && (
            <OutlineTextEditor outline={outline} onChange={onEditOutline} />
          )}

          {panel === 'similar' && (
            <div data-ai-similar-row="true" className="flex flex-wrap gap-2">
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

          {panel === 'colours' && onThemeChange && (
            <ColoursFontsPanel
              theme={theme}
              visualStyle={visualStyle}
              onVisualStyleChange={onVisualStyleChange ?? (() => {})}
              onThemeChange={onThemeChange}
              slotCount={Math.min(outline?.items.length ?? 0, 6)}
            />
          )}

          {panel === 'customize' && (
            <div data-ai-customize="true" className="space-y-3">
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
      )}
    </section>
  ) : null;

  return (
    <div data-ai-outline-options="true" className="flex h-full w-full flex-row gap-3 overflow-hidden p-4">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!familyEmpty && (
          <div
            data-ai-outline-preview="true"
            data-ai-preview-hover={hoverOption ? hoverOption.key : undefined}
            className={`relative min-h-0 flex-1 ${loading && options.length > 0 ? 'pointer-events-none opacity-50' : ''}`}
          >
            <PictureStage
              mode={previewMode}
              resetKey={`${previewKey ?? ''}:${theme}`}
              aria-label="Design preview"
              className="h-full"
            >
              {previewOption && (hoverOption ? (
                <AIContentRenderer content={envelopeFor(hoverOption)} />
              ) : editableInfographic ? (
                <InfographicRenderer data={editableInfographic} edit={{ onChange: onEditOutline! }} />
              ) : editableMindmap ? (
                <MindmapTreeRenderer
                  data={editableMindmap}
                  edit={{ onChange: (next: MindmapTree) => onEditOutline!(outlineFromMindmapTree(outline!, next)) }}
                />
              ) : (
                <AIContentRenderer content={envelopeFor(previewOption)} />
              ))}
            </PictureStage>

            {/* PATCH-252. One icon toolbar top-right; each icon opens its panel. */}
            <div
              ref={toolbarRef}
              data-ai-preview-toolbar="true"
              className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 px-1.5 py-1 shadow-md backdrop-blur"
            >
              {/* PATCH-252. The estimated label sits left of the icons, only on a
                  numeric chart whose outline estimated its numbers. */}
              {showEstimated && (
                <div
                  data-ai-values-estimated="true"
                  title="The AI estimated these numbers. Check them under Edit text."
                  className="group relative mr-0.5 flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
                >
                  <span>≈ Estimated</span>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    The AI estimated these numbers. Check them under Edit text.
                  </span>
                </div>
              )}
              <PreviewToolButton
                label="Designs"
                dataAi="data-ai-designs-toggle"
                active={panel === 'designs'}
                onClick={() => togglePanel('designs')}
              >
                <LayoutGrid size={16} aria-hidden="true" />
              </PreviewToolButton>
              {outline && onEditOutline && (
                <PreviewToolButton
                  label="Edit text"
                  dataAi="data-ai-edit-text-toggle"
                  active={panel === 'edit'}
                  onClick={() => togglePanel('edit')}
                >
                  <Pencil size={16} aria-hidden="true" />
                </PreviewToolButton>
              )}
              {similarPresent.length > 0 && (
                <PreviewToolButton
                  label="Similar visuals"
                  dataAi="data-ai-similar-toggle"
                  active={panel === 'similar'}
                  onClick={() => togglePanel('similar')}
                >
                  <Shapes size={16} aria-hidden="true" />
                </PreviewToolButton>
              )}
              {onThemeChange && (
                <PreviewToolButton
                  label="Colours & Fonts"
                  dataAi="data-ai-colours-toggle"
                  active={panel === 'colours'}
                  onClick={() => togglePanel('colours')}
                >
                  <Palette size={16} aria-hidden="true" />
                </PreviewToolButton>
              )}
              <PreviewToolButton
                label="Customize"
                dataAi="data-ai-customize-toggle"
                active={panel === 'customize'}
                onClick={() => togglePanel('customize')}
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
              </PreviewToolButton>
            </div>
          </div>
        )}
      </div>

      {!sidePanelHost && sidePanel && (
        <div className="flex h-full min-h-0 w-[340px] shrink-0 flex-col border-l border-gray-200 bg-white">{sidePanel}</div>
      )}
      {sidePanelHost && sidePanel && createPortal(sidePanel, sidePanelHost)}
    </div>
  );
}
