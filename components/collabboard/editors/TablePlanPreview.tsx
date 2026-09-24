"use client";

import React from 'react';

import { formatSummary, summarizeColumn, type ColumnSummary } from '@/lib/domain/canvas/tableNumbers';
import type { TableGrid } from '@/lib/domain/canvas/tableStructure';

/**
 * PATCH-175. A READ-ONLY draft of the plan's result, shown in the panel before
 * anything is applied. It renders whatever grid it is given and writes nothing;
 * the editor computed the draft through the same pure functions the table uses,
 * so the preview matches what Apply would produce.
 *
 * The card's table branch shows the same summary footer with the same pure
 * functions, so the two cannot disagree.
 */

/** How many rows the preview shows before it says how many more there are. */
export const PLAN_PREVIEW_ROWS = 8;
/** How much of one cell the preview shows. */
export const PLAN_PREVIEW_CELL_CHARS = 40;

export interface TablePlanPreviewProps {
  readonly grid: TableGrid;
}

export default function TablePlanPreview({ grid }: TablePlanPreviewProps) {
  const visibleRows = grid.rows.slice(0, PLAN_PREVIEW_ROWS);
  const moreRows = grid.rows.length - visibleRows.length;

  const footerTexts = grid.columnSummaries?.some((summary) => summary !== null) ?? false
    ? grid.columns.map((_, col) => {
        const kind = grid.columnSummaries?.[col];
        if (!kind) return '';
        const texts = grid.rows.map((row) => row[col] ?? '');
        return formatSummary(kind as ColumnSummary, summarizeColumn(texts, kind as ColumnSummary));
      })
    : null;

  return (
    <div
      data-table-plan-preview=""
      className="overflow-hidden rounded border border-gray-200 bg-white"
    >
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-gray-100 text-gray-600">
            {grid.columns.map((col, i) => (
              <th key={i} className="px-1 py-0.5 border-r border-gray-200 font-medium text-left">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length > 0 ? visibleRows.map((row, ri) => (
            <tr key={ri} className="border-t border-gray-200">
              {grid.columns.map((_, ci) => {
                const text = row[ci] ?? '';
                return (
                  <td key={ci} className="px-1 py-0.5 border-r border-gray-200 truncate max-w-[120px]" title={text}>
                    {text.slice(0, PLAN_PREVIEW_CELL_CHARS)}
                  </td>
                );
              })}
            </tr>
          )) : (
            <tr>
              <td colSpan={grid.columns.length} className="px-1 py-2 text-center text-gray-400">
                Empty table
              </td>
            </tr>
          )}
        </tbody>
        {footerTexts && (
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 text-gray-500">
              {footerTexts.map((text, ci) => (
                <td key={ci} className="px-1 py-0.5 border-r border-gray-200 truncate">{text}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {moreRows > 0 && (
        <p className="px-1 py-0.5 text-[10px] text-gray-400">+{moreRows} more rows</p>
      )}
    </div>
  );
}
