"use client";

import React, { useState } from "react";

type LayoutType = "row" | "column" | "grid";

export function SlideLayoutModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (type: LayoutType, columns: number) => void;
}) {
  const [selected, setSelected] = useState<LayoutType>("row");
  const [columns, setColumns] = useState(3);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[700]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Slides layout</h2>
          <p className="text-sm text-gray-500 mb-1">
            Are your slides all over the place? Choose from our predefined layouts for a tidier
            canvas and smooth transitions in your presentation.
          </p>
          <p className="text-sm font-medium text-gray-700 mb-5">
            The slides will be arranged in the order they appear in the sidebar.
          </p>

          {/* Layout options */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {(["row", "column", "grid"] as LayoutType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelected(type)}
                className={[
                  "relative rounded-xl border-2 p-3 flex flex-col items-center gap-2 transition-colors",
                  selected === type
                    ? "border-violet-500 bg-violet-50"
                    : "border-gray-200 hover:border-gray-300 bg-white",
                ].join(" ")}
              >
                {/* Visual preview */}
                <div className="w-full h-20 bg-violet-50 rounded-lg border border-violet-100 flex items-center justify-center">
                  {type === "row" && (
                    <div className="flex gap-1.5 items-center">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-7 h-10 bg-violet-300 rounded-sm" />
                      ))}
                    </div>
                  )}
                  {type === "column" && (
                    <div className="flex flex-col gap-1.5 items-center">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-10 h-3 bg-violet-300 rounded-sm" />
                      ))}
                    </div>
                  )}
                  {type === "grid" && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="w-6 h-6 bg-violet-300 rounded-sm" />
                      ))}
                    </div>
                  )}
                </div>

                {/* Label + check */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-sm font-medium capitalize ${
                      selected === type ? "text-violet-700" : "text-gray-700"
                    }`}
                  >
                    {type === "row" ? "Row" : type === "column" ? "Column" : "Grid"}
                  </span>
                  <div
                    className={[
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      selected === type
                        ? "border-violet-500 bg-violet-500"
                        : "border-gray-300 bg-white",
                    ].join(" ")}
                  >
                    {selected === type && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        className="text-white"
                      >
                        <path
                          d="M2 5l2 2 4-4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Column count (grid only) */}
          <div
            className={`transition-all overflow-hidden ${
              selected === "grid" ? "max-h-20 opacity-100 mb-6" : "max-h-0 opacity-0 mb-0"
            }`}
          >
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <div className="text-sm font-medium text-gray-800">Column count</div>
                <div className="text-xs text-gray-500">
                  Specify how many columns you want in your grid layout.
                </div>
              </div>
              <select
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 bg-white"
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onApply(selected, columns)}
              className="px-5 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors shadow-sm"
            >
              Apply layout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
