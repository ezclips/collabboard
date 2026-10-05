'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, RotateCcw, Trash2 } from 'lucide-react';

import type { DrawnDiagramData } from '@/lib/ai/contracts';
import type { DrawnElement, DrawnPicture } from '@/lib/ai/drawn/format';
import { applyEdit, removeElement, setBackground, setIconColour, setPaint, setText, setTextStyle } from '@/lib/ai/drawn/edit';
import { normalizeDrawnColor } from '@/lib/ai/drawn/parseHelpers';
import type { DrawnKind } from '@/lib/ai/drawn/prompt';
import type { VisualOutline } from '@/lib/ai/outline';

import { DrawnColourField } from './DrawnColourField';
import { DockedPanelShell, usePictureSidePanel } from './PictureSidePanel';

/**
 * PATCH-285. The one side panel per drawn-picture object. `DrawnEditContext` is
 * the bridge the gallery needs (the preview is rendered deep inside the options
 * panel): the selected preview reads `enabled`/`baseFor`/`onChange` from it.
 * The panel itself is rendered by `DrawnPictureRenderer` into the shared docked
 * column, falling back to inline when there is no host.
 */

export interface DrawnEditContextValue {
  /** True while a drawn option is on screen and the selected one may be edited. */
  enabled: boolean;
  /** The gallery renders one renderer per option, so only the selected preview
   *  layer may edit; the Edit window renders a single picture and does not. */
  scopeToSelectedLayer: boolean;
  /** The picture as the AI drew it (Reset), identified by the rendered data. */
  baseFor: (data: DrawnDiagramData) => DrawnPicture | null;
  /** Commits an edited picture for the option `data` names. */
  onChange: (data: DrawnDiagramData, next: DrawnPicture) => void;
}

export const DrawnEditContext = React.createContext<DrawnEditContextValue | null>(null);

/** The picture's colours, de-duplicated in first-appearance order (stable). */
export function collectPictureColours(picture: DrawnPicture): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string | undefined) => {
    if (!value) return;
    const hex = normalizeDrawnColor(value);
    if (!hex || hex === 'none' || seen.has(hex)) return;
    seen.add(hex);
    out.push(hex);
  };
  add(picture.background);
  for (const element of picture.elements) {
    if ('fill' in element) add(element.fill);
    if ('stroke' in element) add(element.stroke);
    if (element.type === 'text' || element.type === 'icon') add(element.color);
  }
  return out;
}

/** The panel header noun for an element (or the picture when nothing is selected). */
export function drawnElementKindLabel(element: DrawnElement | null): string {
  if (!element) return 'Picture';
  switch (element.type) {
    case 'rect':
      return 'Card';
    case 'wedge':
      return 'Slice';
    case 'bar':
      return 'Bar';
    case 'line':
      return 'Line';
    case 'text':
      return 'Text';
    case 'icon':
      return 'Icon';
    default:
      return 'Shape';
  }
}

export interface DrawnElementPanelProps {
  picture: DrawnPicture;
  basePicture: DrawnPicture;
  outline: VisualOutline;
  kind?: DrawnKind;
  selectedId: string | null;
  onChange: (next: DrawnPicture) => void;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

function TextControls({
  element,
  palette,
  commit,
}: {
  element: Extract<DrawnElement, { type: 'text' }>;
  palette: readonly string[];
  commit: (op: (current: DrawnPicture) => DrawnPicture) => void;
}) {
  const [draft, setDraft] = React.useState(element.text);
  React.useEffect(() => setDraft(element.text), [element.id, element.text]);
  const applyText = () => {
    if (draft.trim() && draft !== element.text) commit((current) => setText(current, element.id, draft));
  };
  const setSize = (value: number) => {
    if (Number.isFinite(value)) commit((current) => setTextStyle(current, element.id, { size: value }));
  };

  return (
    <div data-drawn-section="text" className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-gray-600">Text</span>
        <textarea
          data-drawn-text-input="true"
          value={draft}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={applyText}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </label>

      <DrawnColourField
        row="text"
        label="Colour"
        current={element.color}
        palette={palette}
        onPick={(hex) => commit((current) => setTextStyle(current, element.id, { color: hex }))}
      />

      <div className="flex items-center gap-1.5">
        <span className="w-16 shrink-0 text-[11px] text-gray-500">Size</span>
        <button
          type="button"
          data-drawn-font-size-dec="true"
          aria-label="Smaller"
          onClick={() => setSize(element.size - 2)}
          className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
        >
          <Minus size={12} />
        </button>
        <input
          type="number"
          data-drawn-font-size="true"
          value={element.size}
          onChange={(event) => setSize(Number(event.target.value))}
          className="h-6 w-14 rounded border border-gray-300 px-1 text-[11px]"
        />
        <button
          type="button"
          data-drawn-font-size-inc="true"
          aria-label="Larger"
          onClick={() => setSize(element.size + 2)}
          className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
        >
          <Plus size={12} />
        </button>
      </div>

      <button
        type="button"
        data-drawn-bold="true"
        aria-pressed={!!element.bold}
        onClick={() => commit((current) => setTextStyle(current, element.id, { bold: !element.bold }))}
        className={`rounded border px-2 py-1 text-[11px] font-bold ${
          element.bold ? 'border-blue-400 bg-blue-100 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
        }`}
      >
        Bold
      </button>
    </div>
  );
}

export function DrawnElementPanel({
  picture,
  basePicture,
  outline,
  kind,
  selectedId,
  onChange,
  onSelect,
  onClose,
}: DrawnElementPanelProps) {
  const sidePanel = usePictureSidePanel();
  const [confirmingReset, setConfirmingReset] = React.useState(false);
  const element = selectedId !== null ? picture.elements.find((candidate) => candidate.id === selectedId) ?? null : null;
  // PATCH-285 Addendum 1. The swatch list is FROZEN when the panel opens for an
  // object (or the picture) and stays identical -- same colours, same order --
  // until the selection changes. A colour picked meanwhile is shown by the
  // picker and hex field, never inserted into the row.
  const [paletteFor, setPaletteFor] = React.useState<string | null>(selectedId);
  const [palette, setPalette] = React.useState(() => collectPictureColours(picture));
  if (paletteFor !== selectedId) {
    setPaletteFor(selectedId);
    setPalette(collectPictureColours(picture));
  }
  const commit = (op: (current: DrawnPicture) => DrawnPicture) =>
    onChange(applyEdit(picture, outline, kind, op));

  const fillable = element !== null && ['rect', 'ellipse', 'polygon', 'wedge', 'bar'].includes(element.type);
  const strokeable = element !== null && ['rect', 'ellipse', 'polygon', 'line', 'wedge'].includes(element.type);
  const decorative = element !== null && ['rect', 'ellipse', 'polygon'].includes(element.type);
  const noneFill = element !== null && (element.type === 'rect' || element.type === 'ellipse' || element.type === 'polygon');
  const fillOf = element && 'fill' in element ? element.fill : 'none';
  const strokeOf = element && 'stroke' in element ? element.stroke ?? 'none' : 'none';

  const body = (
    <section
      data-drawn-panel="true"
      data-picture-control="true"
      onPointerDown={(event) => event.stopPropagation()}
      className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
    >
      {!element && (
        <div data-drawn-section="background" className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Background</div>
          <DrawnColourField
            row="background"
            label="Colour"
            current={picture.background}
            palette={palette}
            onPick={(hex) => commit((current) => setBackground(current, hex))}
          />
        </div>
      )}

      {element && element.type !== 'text' && element.type !== 'icon' && (
        <div data-drawn-section="shape" className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Shape</div>
          {fillable && (
            <DrawnColourField
              row="fill"
              label="Fill"
              current={fillOf}
              palette={palette}
              allowNone={noneFill}
              onPick={(hex) => commit((current) => setPaint(current, element.id, { fill: hex }))}
              onNone={() => commit((current) => setPaint(current, element.id, { fill: 'none' }))}
            />
          )}
          {strokeable && (
            <DrawnColourField
              row="stroke"
              label="Border"
              current={strokeOf}
              palette={palette}
              allowNone
              onPick={(hex) => commit((current) => setPaint(current, element.id, { stroke: hex }))}
              onNone={() => commit((current) => setPaint(current, element.id, { stroke: 'none' }))}
            />
          )}
        </div>
      )}

      {element?.type === 'text' && <TextControls element={element} palette={palette} commit={commit} />}

      {element?.type === 'icon' && (
        <div data-drawn-section="icon" className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Icon</div>
          <DrawnColourField
            row="icon"
            label="Colour"
            current={element.color}
            palette={palette}
            onPick={(hex) => commit((current) => setIconColour(current, element.id, hex))}
          />
        </div>
      )}

      <div data-drawn-section="footer" className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        {decorative && (
          <button
            type="button"
            data-drawn-remove="true"
            data-picture-control="true"
            onClick={() => {
              onChange(removeElement(picture, element.id));
              onSelect(null);
            }}
            className="flex items-center gap-1 rounded border border-red-100 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
          >
            <Trash2 size={12} /> Remove
          </button>
        )}
        {!confirmingReset ? (
          <button
            type="button"
            data-drawn-reset-picture="true"
            data-picture-control="true"
            onClick={() => setConfirmingReset(true)}
            className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
          >
            <RotateCcw size={12} /> Reset picture
          </button>
        ) : (
          <span data-drawn-reset-confirm="true" className="flex items-center gap-1">
            <button
              type="button"
              data-drawn-reset-confirm-yes="true"
              data-picture-control="true"
              onClick={() => {
                onChange(basePicture);
                setConfirmingReset(false);
              }}
              className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100"
            >
              Reset
            </button>
            <button
              type="button"
              data-drawn-reset-confirm-no="true"
              data-picture-control="true"
              onClick={() => setConfirmingReset(false)}
              className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </span>
        )}
      </div>
    </section>
  );

  const shell = (
    <DockedPanelShell
      id="element"
      icon={<span className="text-gray-500">✎</span>}
      title={drawnElementKindLabel(element)}
      onClose={onClose}
      className={sidePanel?.host ? 'absolute inset-0' : 'h-full min-h-0'}
    >
      {body}
    </DockedPanelShell>
  );

  if (sidePanel?.host && typeof document !== 'undefined') return createPortal(shell, sidePanel.host);
  return shell;
}

export default DrawnElementPanel;
