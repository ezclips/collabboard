"use client";

import React, { useMemo } from "react";
import PostPreviewCard from "./PostPreviewCard";
import type { Padlet } from "@/types/collabboard";

type Props = {
  title: string;
  count: number;
  backgroundColor?: string;
  topStrip?: string | null;
  childrenPadlets?: Padlet[];

  // Click the container itself (open ContainerEditor)
  onOpenContainer?: () => void;

  // Optional: click a child inside the preview
  onOpenChild?: (padletId: string) => void;
};

export default function ContainerCardPreview({
  title,
  count,
  backgroundColor = "#ffffff",
  topStrip = null,
  childrenPadlets = [],
  onOpenContainer,
  onOpenChild,
}: Props) {
  const label = useMemo(() => `${count} card${count === 1 ? "" : "s"}`, [count]);
  const previewChildren = useMemo(() => childrenPadlets.slice(0, 3), [childrenPadlets]);

  const isStripVisible = (color?: string | null) => !!color && color !== "transparent";

  return (
    <button
      type="button"
      onClick={() => onOpenContainer?.()}
      className="w-full text-left rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition bg-white overflow-hidden"
      style={{ backgroundColor }}
    >
      {isStripVisible(topStrip) ? <div className="h-1 w-full" style={{ backgroundColor: topStrip as string }} /> : null}

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">{title || "Container"}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {previewChildren.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">Drop posts here</div>
          ) : (
            previewChildren.map((p) => (
              <div
                key={p.id}
                className="rounded-lg overflow-hidden"
                onClick={(e) => {
                  if (!onOpenChild) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenChild(p.id);
                }}
              >
                {/* Non-interactive child preview (prevents click/drag conflicts in parent) */}
                <div className="pointer-events-none select-none">
                  <PostPreviewCard padlet={p} />
                </div>
              </div>
            ))
          )}

          {childrenPadlets.length > 3 ? (
            <div className="text-[10px] text-gray-400 pt-1 text-center">+{childrenPadlets.length - 3} more</div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
