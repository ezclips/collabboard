'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';

import { normalizeHex, type ElementOverride } from '@/lib/ai/antv/elementOverrides';
import { useClampedLeft, type ChromeRect } from './AntvElementChrome';

/**
 * PATCH-261. The small popover under the selection bar: one row per applicable
 * colour (Fill/Border for shapes, Icon colour for icons, Text for text), each
 * with the picture's palette, the six most-recently-used colours, a native
 * picker and a hex field. Picking commits through the editor's history.
 */

export type ColourRow = 'fill' | 'border' | 'icon' | 'text';

const ROW_LABELS: Record<ColourRow, string> = {
  fill: 'Fill',
  border: 'Border',
  icon: 'Icon colour',
  text: 'Text',
};

const INVALID_BORDER = '#ef4444';

export interface AntvElementColourMenuProps {
  rows: ColourRow[];
  palette: readonly string[];
  recent: readonly string[];
  current: ElementOverride;
  rect: ChromeRect;
  counterScale: number;
  /** PATCH-261 fix. Matches the bar: below the box for text, above otherwise. */
  below?: boolean;
  onPick: (row: ColourRow, hex: string) => void;
  onReset: () => void;
}

function valueFor(row: ColourRow, current: ElementOverride): string | undefined {
  if (row === 'border') return current.stroke;
  if (row === 'text') return current.text;
  return current.fill;
}

export default function AntvElementColourMenu({
  rows,
  palette,
  recent,
  current,
  rect,
  counterScale,
  below = false,
  onPick,
  onReset,
}: AntvElementColourMenuProps) {
  const [drafts, setDrafts] = React.useState<Partial<Record<ColourRow, string>>>({});
  const [invalid, setInvalid] = React.useState<Partial<Record<ColourRow, boolean>>>({});
  // PATCH-263 Addendum 3. Keep the popover inside the preview at the right edge.
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuLeft = useClampedLeft(menuRef, rect.left, counterScale);

  const pick = (row: ColourRow, hex: string) => {
    setDrafts((drafts) => ({ ...drafts, [row]: undefined }));
    setInvalid((invalid) => ({ ...invalid, [row]: false }));
    onPick(row, hex);
  };

  const onHexChange = (row: ColourRow, raw: string) => {
    setDrafts((drafts) => ({ ...drafts, [row]: raw }));
    const normal = normalizeHex(raw);
    if (normal) pick(row, normal);
    else setInvalid((invalid) => ({ ...invalid, [row]: raw.trim().length > 0 }));
  };

  return (
    <div
      ref={menuRef}
      data-ai-element-colour="true"
      data-picture-control="true"
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute z-20 flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white p-2 shadow-xl"
      style={{
        pointerEvents: 'auto',
        left: `${menuLeft}%`,
        top: below
          ? `calc(${rect.top + rect.height}% + 36px)`
          : `calc(${Math.max(rect.top, 0)}% + 6px)`,
        transform: `scale(${counterScale})`,
        transformOrigin: 'left top',
      }}
    >
      {rows.map((row) => {
        const value = valueFor(row, current);
        const draft = drafts[row];
        return (
          <div key={row} data-ai-element-colour-row={row} className="flex items-center gap-1.5">
            <span className="w-16 shrink-0 text-[11px] text-gray-500">{ROW_LABELS[row]}</span>
            <div className="flex items-center gap-1">
              {palette.map((hex) => (
                <button
                  key={`palette-${hex}`}
                  type="button"
                  data-ai-element-swatch={row}
                  data-ai-element-swatch-value={hex}
                  title={hex}
                  onClick={() => pick(row, hex)}
                  className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                  style={{
                    backgroundColor: hex,
                    outline: value === hex ? '2px solid #2563eb' : undefined,
                    outlineOffset: 1,
                  }}
                />
              ))}
              {recent.map((hex) => (
                <button
                  key={`recent-${hex}`}
                  type="button"
                  data-ai-element-recent={row}
                  data-ai-element-swatch-value={hex}
                  title={hex}
                  onClick={() => pick(row, hex)}
                  className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <input
              type="color"
              data-ai-element-colour-input={row}
              value={value ?? '#000000'}
              onChange={(event) => pick(row, event.target.value)}
              onInput={(event) => pick(row, event.currentTarget.value)}
              className="h-6 w-7 shrink-0 cursor-pointer rounded border border-gray-200 bg-white p-0"
            />
            <input
              type="text"
              data-ai-element-hex={row}
              data-ai-element-hex-invalid={invalid[row] ? 'true' : undefined}
              value={draft ?? value ?? ''}
              placeholder="#rrggbb"
              spellCheck={false}
              onChange={(event) => onHexChange(row, event.target.value)}
              className="h-6 w-20 shrink-0 rounded border px-1 text-[11px]"
              style={{ borderColor: invalid[row] ? INVALID_BORDER : '#e5e7eb' }}
            />
          </div>
        );
      })}
      <button
        type="button"
        data-ai-element-colour-reset="true"
        onClick={onReset}
        className="flex items-center justify-center gap-1 rounded p-1 text-[11px] text-gray-600 hover:bg-gray-100"
      >
        <RotateCcw size={12} /> Reset colour
      </button>
    </div>
  );
}
