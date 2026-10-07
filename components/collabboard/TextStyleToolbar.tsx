'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Palette } from 'lucide-react';
import {
  TEXT_STYLE_COLORS,
  TEXT_STYLE_FONT_FAMILIES,
  TEXT_STYLE_FONT_KEYS,
  TEXT_STYLE_FONT_SIZES,
  type TextStyle,
  type TextStyleFontKey,
} from '@/lib/domain/canvas/textStyle';

const BAR_HEIGHT = 36;
const WINDOW_MARGIN = 8;

type TextStyleToolbarProps = {
  value: TextStyle;
  onChange: (next: TextStyle) => void;
  anchorRect: DOMRect;
  className?: string;
};

/** PATCH-308 lesson: nothing inside the bar may reach the surface beneath it. */
const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();
/** Keep focus on the text input so a control press is not a save-and-close. */
const keepFocus = (event: React.MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const ALIGN_ORDER: Array<NonNullable<TextStyle['align']>> = ['left', 'center', 'right'];

export default function TextStyleToolbar({ value, onChange, anchorRect, className }: TextStyleToolbarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [colorOpen, setColorOpen] = useState(false);

  useLayoutEffect(() => {
    const element = barRef.current;
    if (!element || typeof window === 'undefined') return;
    const width = element.getBoundingClientRect().width || 320;
    const desiredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
    const maxLeft = Math.max(WINDOW_MARGIN, window.innerWidth - WINDOW_MARGIN - width);
    const desiredTop = anchorRect.top - WINDOW_MARGIN - BAR_HEIGHT;
    const maxTop = Math.max(WINDOW_MARGIN, window.innerHeight - WINDOW_MARGIN - BAR_HEIGHT);
    setPosition({
      left: Math.min(Math.max(desiredLeft, WINDOW_MARGIN), maxLeft),
      top: Math.min(Math.max(desiredTop, WINDOW_MARGIN), maxTop),
    });
  }, [anchorRect]);

  const currentAlign = value.align ?? 'left';
  const nextAlign = ALIGN_ORDER[(ALIGN_ORDER.indexOf(currentAlign) + 1) % ALIGN_ORDER.length];
  const AlignIcon = currentAlign === 'center' ? AlignCenter : currentAlign === 'right' ? AlignRight : AlignLeft;
  const fontKey = value.fontFamily ?? 'sans';

  return (
    <div
      ref={barRef}
      data-text-style-toolbar
      role="toolbar"
      aria-label="Text style"
      className={`fixed z-[10000] flex h-9 items-center gap-1 rounded-full bg-slate-800/95 px-2 text-white shadow-lg ${className ?? ''}`}
      style={position ? { left: position.left, top: position.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onMouseDown={stopPropagation}
      onMouseUp={stopPropagation}
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
    >
      <select
        aria-label="Font"
        className="h-7 rounded bg-transparent px-1 text-[12px] text-white outline-none"
        value={fontKey}
        onChange={(event) => onChange({ ...value, fontFamily: event.target.value as TextStyleFontKey })}
        style={{ fontFamily: TEXT_STYLE_FONT_FAMILIES[fontKey] }}
      >
        {TEXT_STYLE_FONT_KEYS.map((key) => (
          <option key={key} value={key} style={{ fontFamily: TEXT_STYLE_FONT_FAMILIES[key], color: '#0f172a' }}>
            {key[0].toUpperCase() + key.slice(1)}
          </option>
        ))}
      </select>

      <span className="h-5 w-px bg-white/20" />

      <select
        aria-label="Text size"
        className="h-7 rounded bg-transparent px-1 text-[12px] text-white outline-none"
        value={String(value.fontSize ?? 14)}
        onChange={(event) => onChange({ ...value, fontSize: Number(event.target.value) })}
      >
        {TEXT_STYLE_FONT_SIZES.map((size) => (
          <option key={size} value={size} style={{ color: '#0f172a' }}>
            {size}
          </option>
        ))}
      </select>

      <span className="h-5 w-px bg-white/20" />

      <button
        type="button"
        aria-label="Bold"
        aria-pressed={!!value.bold}
        onMouseDown={keepFocus}
        onClick={() => onChange({ ...value, bold: !value.bold })}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${
          value.bold ? 'bg-white/20' : 'hover:bg-white/10'
        }`}
      >
        B
      </button>

      <button
        type="button"
        aria-label="Text alignment"
        onMouseDown={keepFocus}
        onClick={() => onChange({ ...value, align: nextAlign })}
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10"
      >
        <AlignIcon size={15} />
      </button>

      <div className="relative">
        <button
          type="button"
          aria-label="Text colour"
          aria-expanded={colorOpen}
          onMouseDown={keepFocus}
          onClick={() => setColorOpen((open) => !open)}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10"
        >
          <Palette size={15} />
        </button>
        {colorOpen && (
          <div
            role="group"
            aria-label="Text colour palette"
            className="absolute right-0 top-9 flex w-40 flex-wrap items-center gap-1.5 rounded-lg bg-slate-800/95 p-2 shadow-lg"
            onPointerDown={stopPropagation}
            onMouseDown={stopPropagation}
            onClick={stopPropagation}
          >
            {TEXT_STYLE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Set colour ${color}`}
                onMouseDown={keepFocus}
                onClick={() => {
                  onChange({ ...value, color });
                  setColorOpen(false);
                }}
                className={`h-5 w-5 rounded-full border ${
                  value.color === color ? 'ring-2 ring-white' : 'border-white/30'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
            <input
              type="color"
              aria-label="Pick custom colour"
              value={value.color ?? '#0f172a'}
              onMouseDown={stopPropagation}
              onChange={(event) => onChange({ ...value, color: event.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-white/30 bg-transparent p-0"
            />
          </div>
        )}
      </div>
    </div>
  );
}
