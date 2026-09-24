"use client";

import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * PATCH-174. The Find & replace panel.
 *
 * The panel owns the query; the EDITOR owns the table and does the matching and
 * replacing through the pure `findMatchingCells` / `replaceInTable` helpers, so
 * this component never touches a grid. It reports what the user typed, and the
 * editor reports back how many cells matched or changed.
 */

export interface TableFindReplaceQuery {
  readonly find: string;
  readonly replace: string;
  readonly matchCase: boolean;
  readonly wholeCell: boolean;
  readonly onlyInSelection: boolean;
}

export interface TableFindReplacePanelProps {
  readonly find: string;
  readonly replace: string;
  readonly matchCase: boolean;
  readonly wholeCell: boolean;
  readonly onlyInSelection: boolean;
  /** True when a multi-cell selection exists, so `Only in selection` is usable. */
  readonly selectionAvailable: boolean;
  /** How many cells currently match the find text (shown while typing). */
  readonly matchCount: number;
  /** The result of the last Replace all, or null. */
  readonly replacedMessage: string | null;
  readonly onChange: (next: Partial<TableFindReplaceQuery>) => void;
  readonly onReplaceAll: () => void;
  readonly onClose: () => void;
}

export default function TableFindReplacePanel({
  find,
  replace,
  matchCase,
  wholeCell,
  onlyInSelection,
  selectionAvailable,
  matchCount,
  replacedMessage,
  onChange,
  onReplaceAll,
  onClose,
}: TableFindReplacePanelProps) {
  const hasFind = find.length > 0;

  return (
    <div
      data-table-find-panel=""
      className="relative z-[1100] w-[300px] bg-white rounded-xl shadow-xl border border-gray-200 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Search className="h-4 w-4 text-gray-500" aria-hidden="true" />
        Find &amp; replace
      </div>

      <label className="mb-1 block text-xs text-gray-500" htmlFor="table-find-input">Find</label>
      <input
        id="table-find-input"
        data-table-find-input=""
        type="text"
        autoFocus
        value={find}
        onChange={(e) => onChange({ find: e.target.value })}
        className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none"
      />

      <label className="mb-1 block text-xs text-gray-500" htmlFor="table-replace-input">Replace with</label>
      <input
        id="table-replace-input"
        data-table-replace-input=""
        type="text"
        value={replace}
        onChange={(e) => onChange({ replace: e.target.value })}
        className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none"
      />

      <label className="mb-1 flex items-center gap-2 text-xs text-gray-600">
        <input
          data-table-find-matchcase=""
          type="checkbox"
          checked={matchCase}
          onChange={(e) => onChange({ matchCase: e.target.checked })}
        />
        Match case
      </label>
      <label className="mb-1 flex items-center gap-2 text-xs text-gray-600">
        <input
          data-table-find-wholecell=""
          type="checkbox"
          checked={wholeCell}
          onChange={(e) => onChange({ wholeCell: e.target.checked })}
        />
        Whole cell only
      </label>
      <label className="mb-2 flex items-center gap-2 text-xs text-gray-600">
        <input
          data-table-find-selection=""
          type="checkbox"
          checked={onlyInSelection}
          disabled={!selectionAvailable}
          onChange={(e) => onChange({ onlyInSelection: e.target.checked })}
        />
        Only in selection
      </label>

      {hasFind && (
        <p data-table-find-count="" className="mb-2 text-xs text-gray-500">{matchCount} cells match</p>
      )}
      {replacedMessage && (
        <p data-table-replace-result="" className="mb-2 text-xs text-green-700">{replacedMessage}</p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onReplaceAll}
          disabled={!hasFind}
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Replace all
        </button>
      </div>
    </div>
  );
}
