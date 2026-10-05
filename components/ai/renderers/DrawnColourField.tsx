'use client';

import React from 'react';

import { normalizeDrawnColor } from '@/lib/ai/drawn/parseHelpers';

/**
 * PATCH-285. One colour row in the drawn element panel. It shows the picture's
 * own colours as swatches in a stable first-appearance order (they never
 * reorder while the panel is open), a native picker and a hex field; the current
 * value is ringed. A fill row can offer "None" where the format allows it.
 */

export interface DrawnColourFieldProps {
  /** Stable id used in `data-drawn-colour-*` attributes. */
  row: string;
  label: string;
  /** `'#rrggbb'` or `'none'`. */
  current: string;
  palette: readonly string[];
  allowNone?: boolean;
  onPick: (hex: string) => void;
  onNone?: () => void;
}

const RING = '2px solid #2563eb';

function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed.slice(1).split('').map((c) => c + c).join('')}`;
  }
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null;
}

export function DrawnColourField({ row, label, current, palette, allowNone = false, onPick, onNone }: DrawnColourFieldProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const currentHex = normalizeDrawnColor(current) === 'none' ? 'none' : normalizeDrawnColor(current) ?? current;
  const ringed = (hex: string) => currentHex !== 'none' && currentHex === hex;

  const onHexChange = (raw: string) => {
    setDraft(raw);
    const normal = normalizeHex(raw);
    if (normal) onPick(normal);
  };

  return (
    <div data-drawn-colour-row={row} className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-[11px] text-gray-500">{label}</span>

      {palette.map((hex) => (
        <button
          key={`${row}-${hex}`}
          type="button"
          data-drawn-swatch={row}
          data-drawn-swatch-value={hex}
          title={hex}
          aria-label={`${label} ${hex}`}
          onClick={() => onPick(hex)}
          className="h-4 w-4 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: hex, outline: ringed(hex) ? RING : undefined, outlineOffset: 1 }}
        />
      ))}

      {allowNone && (
        <button
          type="button"
          data-drawn-none={row}
          aria-pressed={currentHex === 'none'}
          title="None"
          onClick={() => (onNone ? onNone() : onPick('none'))}
          className="h-4 w-4 shrink-0 rounded-full border border-gray-300 bg-[linear-gradient(45deg,transparent_45%,#ef4444_45%,#ef4444_55%,transparent_55%)]"
          style={{ outline: currentHex === 'none' ? RING : undefined, outlineOffset: 1 }}
        />
      )}

      <input
        type="color"
        data-drawn-colour-input={row}
        value={currentHex === 'none' ? '#e5e7eb' : currentHex}
        aria-label={`${label} colour picker`}
        onChange={(event) => onPick(event.target.value)}
        onInput={(event) => onPick(event.currentTarget.value)}
        className="h-6 w-7 shrink-0 cursor-pointer rounded border border-gray-200 bg-white p-0"
      />

      <input
        type="text"
        data-drawn-hex={row}
        data-drawn-hex-invalid={draft !== null && !isHex(draft) && normalizeHex(draft) === null ? 'true' : undefined}
        value={draft ?? (currentHex === 'none' ? '' : currentHex)}
        placeholder={currentHex === 'none' ? 'None' : '#rrggbb'}
        spellCheck={false}
        onChange={(event) => onHexChange(event.target.value)}
        className="h-6 w-20 shrink-0 rounded border border-gray-200 px-1 text-[11px]"
      />
    </div>
  );
}

export default DrawnColourField;
