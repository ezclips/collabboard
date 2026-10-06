'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import WallpaperSelector from '@/components/collabboard/canvas/WallpaperSelector';

const QUICK_BACKGROUNDS = ['#ffffff', '#f3f4f6', '#fef3c7', '#dcfce7', '#dbeafe'] as const;

type BackgroundType = 'color' | 'gradient' | 'image';

export interface BoardBackgroundFieldProps {
  value: string;
  type: BackgroundType;
  onChange: (type: BackgroundType, value: string) => void;
}

function backgroundCss(type: BackgroundType, value: string): string {
  if (type === 'image') return `url("${value}") center/cover no-repeat`;
  if (type === 'gradient') return value;
  return value;
}

/** PATCH-301. Five quick swatches plus a dashed "+" for the full picker. */
export default function BoardBackgroundField({ value, type, onChange }: BoardBackgroundFieldProps) {
  const [open, setOpen] = useState(false);
  const isQuick = type === 'color' && (QUICK_BACKGROUNDS as readonly string[]).includes(value);
  const shown: Array<{ type: BackgroundType; value: string }> = isQuick
    ? QUICK_BACKGROUNDS.map((color) => ({ type: 'color' as const, value: color }))
    : [{ type, value }, ...QUICK_BACKGROUNDS.slice(0, 4).map((color) => ({ type: 'color' as const, value: color }))];

  return (
    <div className="flex flex-wrap gap-1.5" data-board-background-field>
      {shown.map((option) => {
        const selected = option.value === value && option.type === type;
        return (
          <button
            key={`${option.type}:${option.value}`}
            type="button"
            aria-label="Background"
            aria-pressed={selected}
            onClick={() => onChange(option.type, option.value)}
            style={{
              background: backgroundCss(option.type, option.value),
              boxShadow: selected ? '0 0 0 2px #2563eb' : '0 0 0 1px #cfd5de',
            }}
            className="h-9 w-9 rounded-full border-[3px] border-white"
          />
        );
      })}
      <button
        type="button"
        data-more-backgrounds
        aria-label="More backgrounds"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white text-slate-400 hover:border-slate-400"
      >
        <Plus className="h-[18px] w-[18px]" />
      </button>
      <WallpaperSelector
        isOpen={open}
        onClose={() => setOpen(false)}
        currentSelection={{ type, value }}
        onSelect={(nextType, nextValue) => {
          onChange(nextType as BackgroundType, nextValue);
          setOpen(false);
        }}
      />
    </div>
  );
}
