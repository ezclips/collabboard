'use client';

import React from 'react';

import { effectiveColour, type ColourKind } from '@/lib/ai/antv/effectiveColour';
import { normalizeHex } from '@/lib/ai/antv/elementOverrides';

import type { ColourRow } from './useAntvElementColour';

/**
 * PATCH-275. One colour row in the element panel: Original (AntV's own colour,
 * with its alpha), the picture palette, a native picker, a hex field and the
 * recent line. The row never reorders while you work and shows the truth:
 * the current override, else AntV's own colour, or Mixed when the parts differ.
 */

const INVALID_BORDER = '#ef4444';

export interface AntvColourFieldProps {
  row: ColourRow;
  label: string;
  kind: ColourKind;
  /** The DOM parts this row applies to. */
  parts: Element[];
  /** Our override literal when one is set for this row. */
  override?: string;
  palette: readonly string[];
  recent: readonly string[];
  onPick: (hex: string) => void;
  /** The native picker's live input: updates the element but not the recent list. */
  onInput: (hex: string) => void;
  onReset: () => void;
}

export function AntvColourField({
  row,
  label,
  kind,
  parts,
  override,
  palette,
  recent,
  onPick,
  onInput,
  onReset,
}: AntvColourFieldProps) {
  const colour = effectiveColour(parts, kind, override);
  const overrideSet = override !== undefined;
  const currentHex = colour.current?.hex ?? null;
  const currentUpper = currentHex ? currentHex.toUpperCase() : '';
  // PATCH-275 Addendum 1/2. The picker and hex ALWAYS show the current colour:
  // the override when one is set, else AntV's Original. A row with no colour at
  // all is empty with "None", and a Mixed row is empty with "Mixed"; both show
  // the grey picker, not #000000.
  const pickerValue = currentHex ?? '#e5e7eb';
  const hexPlaceholder = colour.mixed ? 'Mixed' : currentHex ? '#rrggbb' : 'None';
  const originalRinged = !colour.mixed && !overrideSet;
  const swatchRinged = (hex: string) =>
    !colour.mixed && overrideSet && currentHex !== null && currentHex === hex.toLowerCase();
  const [draft, setDraft] = React.useState<string | null>(null);
  const [invalid, setInvalid] = React.useState(false);

  const onHexChange = (raw: string) => {
    setDraft(raw);
    const normal = normalizeHex(raw);
    if (normal) {
      setInvalid(false);
      onPick(normal);
    } else {
      setInvalid(raw.trim().length > 0);
    }
  };

  return (
    <div data-ai-element-colour-row={row} className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-[11px] text-gray-500">{label}</span>

      <button
        type="button"
        data-ai-element-swatch-original="true"
        data-ai-element-swatch-value={colour.baseCss ?? ''}
        title="Original"
        aria-label="Original colour"
        onClick={onReset}
        className="h-4 w-4 shrink-0 rounded-full border border-black/10"
        style={{
          backgroundColor: colour.baseCss ?? 'transparent',
          outline: originalRinged ? '2px solid #2563eb' : undefined,
          outlineOffset: 1,
        }}
      />

      {palette.map((hex) => (
        <button
          key={`palette-${hex}`}
          type="button"
          data-ai-element-swatch={row}
          data-ai-element-swatch-value={hex}
          title={hex}
          onClick={() => onPick(hex)}
          className="h-4 w-4 shrink-0 rounded-full border border-black/10"
          style={{
            backgroundColor: hex,
            outline: swatchRinged(hex) ? '2px solid #2563eb' : undefined,
            outlineOffset: 1,
          }}
        />
      ))}

      <input
        type="color"
        data-ai-element-colour-input={row}
        value={pickerValue}
        aria-label={`${label} colour picker`}
        disabled={colour.mixed}
        onChange={(event) => onInput(event.target.value)}
        onInput={(event) => onInput(event.currentTarget.value)}
        className={`h-6 w-7 shrink-0 cursor-pointer rounded border border-gray-200 bg-white p-0 ${colour.mixed ? 'opacity-40' : ''}`}
      />

      <input
        type="text"
        data-ai-element-hex={row}
        data-ai-element-hex-invalid={invalid ? 'true' : undefined}
        value={draft ?? currentUpper}
        placeholder={hexPlaceholder}
        spellCheck={false}
        onChange={(event) => onHexChange(event.target.value)}
        className="h-6 w-20 shrink-0 rounded border px-1 text-[11px]"
        style={{ borderColor: invalid ? INVALID_BORDER : '#e5e7eb' }}
      />

      {recent.length > 0 && (
        <div data-ai-element-recent={row} className="flex w-full items-center gap-1 pl-16">
          <span className="text-[10px] text-gray-400">Recent</span>
          {recent.map((hex) => (
            <button
              key={`recent-${hex}`}
              type="button"
              data-ai-element-swatch-value={hex}
              title={hex}
              onClick={() => onPick(hex)}
              className="h-4 w-4 shrink-0 rounded-full border border-black/10"
              style={{
                backgroundColor: hex,
                outline: swatchRinged(hex) ? '2px solid #2563eb' : undefined,
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
