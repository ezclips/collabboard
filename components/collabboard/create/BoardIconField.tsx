'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import BoardIconGlyph from '@/components/collabboard/BoardIconGlyph';
import { BOARD_QUICK_ICON_NAMES } from '@/components/collabboard/boardIcons';
import IconSelector from '@/components/collabboard/canvas/IconSelector';

export interface BoardIconFieldProps {
  value: string;
  onChange: (icon: string) => void;
}

/** PATCH-301. Six quick line icons plus a dashed "+" for the full picker. */
export default function BoardIconField({ value, onChange }: BoardIconFieldProps) {
  const [open, setOpen] = useState(false);
  const quickValues = BOARD_QUICK_ICON_NAMES.map((name) => `lucide:${name}`);
  const inQuick = quickValues.includes(value);
  const shown = inQuick ? quickValues : [value, ...quickValues.slice(0, 5)];

  return (
    <div className="flex flex-wrap gap-1.5" data-board-icon-field>
      {shown.map((iconValue) => {
        const selected = iconValue === value;
        return (
          <button
            key={iconValue}
            type="button"
            aria-label="Icon"
            aria-pressed={selected}
            onClick={() => onChange(iconValue)}
            className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] border ${
              selected
                ? 'border-blue-600 bg-blue-50 text-blue-600'
                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            <BoardIconGlyph
              icon={iconValue}
              className="h-[18px] w-[18px]"
              imageClassName="h-full w-full object-cover"
            />
          </button>
        );
      })}
      <button
        type="button"
        data-more-icons
        aria-label="More icons"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-dashed border-slate-300 text-slate-400 hover:border-slate-400"
      >
        <Plus className="h-[18px] w-[18px]" />
      </button>
      <IconSelector
        isOpen={open}
        onClose={() => setOpen(false)}
        selectedIcon={value}
        onSelect={(icon) => {
          onChange(icon);
          setOpen(false);
        }}
      />
    </div>
  );
}
