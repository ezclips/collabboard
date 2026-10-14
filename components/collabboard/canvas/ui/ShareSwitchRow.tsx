'use client';

/**
 * PATCH-369. One compact switch row for the Share modal: a label, a small info
 * icon whose hint is its `title` (with the same text as an `aria-describedby`
 * sr-only node), and the switch on the right. No card border -- the Guest link
 * tab groups its rows in one bordered list.
 *
 * Each toggle keeps its own data loading/writing logic and its `data-*` hook;
 * only the markup goes through here (`switchData` is spread onto the switch).
 */

import React, { useId } from 'react';
import { Info } from 'lucide-react';

export interface ShareSwitchRowProps {
  readonly label: string;
  readonly hint: string;
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
  /** The toggle's own `data-*` hook, e.g. `{ 'data-board-freeze-toggle': 'true' }`. */
  readonly switchData?: Record<string, string>;
  /** Extra content under the row (the approval toggle's "N already waiting" hint). */
  readonly children?: React.ReactNode;
}

export default function ShareSwitchRow({
  label,
  hint,
  checked,
  onToggle,
  disabled,
  switchData,
  children,
}: ShareSwitchRowProps) {
  const hintId = useId();

  return (
    <div data-share-switch-row="true">
      <div className="flex items-center justify-between gap-3 py-2" style={{ minHeight: 40 }}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-700">{label}</span>
          <span
            title={hint}
            data-share-switch-hint="true"
            aria-hidden="true"
            className="shrink-0 text-slate-400"
          >
            <Info size={14} />
          </span>
          <span id={hintId} className="sr-only">{hint}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          aria-describedby={hintId}
          disabled={disabled}
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            checked ? 'bg-[#655ac9]' : 'bg-slate-300'
          }`}
          {...switchData}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      {children}
    </div>
  );
}
