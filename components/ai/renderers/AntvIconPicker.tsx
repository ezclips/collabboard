'use client';

import React from 'react';

import { VISUAL_ICON_NAMES, type VisualIconName } from '@/lib/ai/visualIcons';

import { useClampedLeft, type ChromeRect } from './AntvElementChrome';
import { VISUAL_ICON_MAP } from './visualIconMap';

/**
 * PATCH-262. The searchable icon grid, shared by the selection bar's "Change
 * icon" popover and the Add panel. Every control carries `data-picture-control`
 * and stops pointerdown so PictureStage's pan never captures the press
 * (PATCH-261 Addendum 1). The popover clamps inside the preview (PATCH-263
 * Addendum 3) and counter-scales from the layer's real scale (Addendum 2).
 */

export interface AntvIconSearchProps {
  /** The item's current icon, highlighted in the grid. */
  current?: string | null;
  onPick: (name: VisualIconName) => void;
  /** An extra marker attribute for the option buttons (e.g. `data-ai-add-icon`). */
  optionAttribute?: string;
  /** Escape pressed inside the search field: let the owner close first. */
  onEscape?: () => void;
}

export function AntvIconSearch({ current, onPick, optionAttribute, onEscape }: AntvIconSearchProps) {
  const [query, setQuery] = React.useState('');
  const needle = query.trim().toLowerCase();
  const names = needle ? VISUAL_ICON_NAMES.filter((name) => name.includes(needle)) : VISUAL_ICON_NAMES;

  return (
    <div className="flex flex-col gap-2">
      <input
        data-ai-icon-search="true"
        data-picture-control="true"
        type="text"
        value={query}
        placeholder="Search icons…"
        spellCheck={false}
        aria-label="Search icons"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onEscape?.();
          }
        }}
        className="h-7 w-full rounded border border-gray-300 px-2 text-xs"
      />
      <div data-ai-icon-grid="true" className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto">
        {names.map((name) => {
          const Icon = VISUAL_ICON_MAP[name];
          const selected = current === name;
          return (
            <button
              key={name}
              type="button"
              data-ai-icon-option="true"
              {...(optionAttribute ? { [optionAttribute]: 'true' } : {})}
              data-ai-icon-name={name}
              data-picture-control="true"
              title={name}
              aria-label={name}
              aria-pressed={selected}
              onClick={() => onPick(name)}
              className={`flex h-7 w-7 items-center justify-center rounded border ${
                selected ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface AntvIconPickerProps {
  rect: ChromeRect;
  counterScale: number;
  current?: string | null;
  below?: boolean;
  onPick: (name: VisualIconName) => void;
  onClose: () => void;
}

export default function AntvIconPicker({
  rect,
  counterScale,
  current,
  below = false,
  onPick,
  onClose,
}: AntvIconPickerProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const left = useClampedLeft(ref, rect.left, counterScale);

  return (
    <div
      ref={ref}
      data-ai-icon-picker="true"
      data-picture-control="true"
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute z-30 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-xl"
      style={{
        pointerEvents: 'auto',
        left: `${left}%`,
        top: below
          ? `calc(${rect.top + rect.height}% + 36px)`
          : `calc(${Math.max(rect.top, 0)}% + 34px)`,
        transform: `scale(${counterScale})`,
        transformOrigin: 'left top',
      }}
    >
      <AntvIconSearch current={current} onPick={onPick} onEscape={onClose} />
    </div>
  );
}
