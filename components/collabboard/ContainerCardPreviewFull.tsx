"use client";

import React, { useMemo } from "react";
import PostPreviewCard from "./PostPreviewCard";
import type { Padlet } from "@/types/collabboard";

type Props = {
  title: string;
  childPadlets?: Padlet[];
  backgroundColor?: string;
  topStrip?: string | null;

  // click container header to open ContainerEditor (optional)
  onOpenContainer?: () => void;

  // optional: click a child to open its editor
  onOpenChild?: (padletId: string) => void;
};

export default function ContainerCardPreviewFull({
  title,
  childPadlets = [],
  backgroundColor = "#ffffff",
  topStrip = null,
  onOpenContainer,
  onOpenChild,
}: Props) {
  const isStripVisible = (color?: string | null) => !!color && color !== "transparent";

  const countLabel = useMemo(() => {
    const n = childPadlets.length;
    return `${n} item${n === 1 ? "" : "s"}`;
  }, [childPadlets.length]);

  return (
    <div className="w-full rounded-xl border border-gray-200 shadow-sm bg-white overflow-hidden" style={{ backgroundColor }}>
      {isStripVisible(topStrip) ? <div className="h-1 w-full" style={{ backgroundColor: topStrip as string }} /> : null}

      <div className="p-4 border-b border-gray-100">
        <button
          type="button"
          onClick={() => onOpenContainer?.()}
          className="w-full text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">{title || "Container"}</div>
              <div className="text-xs text-gray-500">{countLabel}</div>
            </div>
          </div>
        </button>
      </div>

      <div className="p-4 space-y-2">
        {childPadlets.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-10">Drop posts here</div>
        ) : (
          childPadlets.map((p) => (
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
              <div className="pointer-events-none select-none">
                <PostPreviewCard padlet={p} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
